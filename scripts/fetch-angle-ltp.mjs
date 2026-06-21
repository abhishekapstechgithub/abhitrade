/**
 * Fetches live LTP (Last Traded Price) from AngelOne SmartAPI for all
 * instruments in the angle_scrip table and writes open/high/low/close/ltp
 * back to Postgres.
 *
 * Usage:
 *   node scripts/fetch-angle-ltp.mjs              # NSE + BSE equities only (~19k)
 *   node scripts/fetch-angle-ltp.mjs --all        # every row (175k, takes ~45 min)
 *   node scripts/fetch-angle-ltp.mjs --exch NFO,NSE  # specific segments
 *   node scripts/fetch-angle-ltp.mjs --concurrency 8  # parallel requests (default 5)
 *
 * Reads credentials from .env.local automatically:
 *   ANGELONE_API_KEY, ANGELONE_CLIENT_ID, ANGELONE_PASSWORD, ANGELONE_TOTP_SECRET
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHmac } from 'crypto';
import pg from 'pg';

const __dir = dirname(fileURLToPath(import.meta.url));

// ── Load .env.local ───────────────────────────────────────────────────────────
function loadEnv() {
  const envPath = resolve(__dir, '..', '.env.local');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}
loadEnv();

// ── TOTP (RFC 6238 / SHA-1) — no external packages ───────────────────────────
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(input) {
  const s = input.replace(/=+$/, '').toUpperCase();
  let bits = 0, val = 0;
  const out = [];
  for (const ch of s) {
    const idx = B32.indexOf(ch);
    if (idx < 0) continue;
    val = (val << 5) | idx;
    bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(out);
}

function totp(secret) {
  const key  = base32Decode(secret);
  const step = Math.floor(Date.now() / 1000 / 30);
  const tb   = Buffer.alloc(8);
  tb.writeUInt32BE(Math.floor(step / 0x100000000), 0);
  tb.writeUInt32BE(step >>> 0, 4);
  const hmac  = createHmac('sha1', key).update(tb).digest();
  const off   = hmac[hmac.length - 1] & 0x0f;
  const code  = (((hmac[off] & 0x7f) << 24) | (hmac[off+1] << 16) |
                  (hmac[off+2] << 8)  |  hmac[off+3]) % 1_000_000;
  return code.toString().padStart(6, '0');
}

// ── Config ────────────────────────────────────────────────────────────────────
const API_KEY   = process.env.ANGELONE_API_KEY    ?? '';
const CLIENT_ID = process.env.ANGELONE_CLIENT_ID  ?? '';
const PASSWORD  = process.env.ANGELONE_PASSWORD   ?? '';
const TOTP_SEC  = process.env.ANGELONE_TOTP_SECRET ?? '';

const BASE_URL  = 'https://apiconnect.angelone.in';
const LOGIN_URL = `${BASE_URL}/rest/auth/angelbroking/user/v1/loginByPassword`;
const LTP_URL   = `${BASE_URL}/order-service/rest/secure/angelbroking/order/v1/getLtpData`;

// ── Parse CLI args ────────────────────────────────────────────────────────────
const args       = process.argv.slice(2);
const fetchAll   = args.includes('--all');
const exchArg    = args.find(a => a.startsWith('--exch'));
const exchFilter = exchArg ? exchArg.replace(/^--exch[= ]*/, '').split(',').map(e => e.trim().toUpperCase()) : null;
const concArg    = args.find(a => a.startsWith('--concurrency'));
const CONCURRENCY = concArg ? parseInt(concArg.replace(/^--concurrency[= ]*/, '')) || 5 : 5;

// ── Postgres ──────────────────────────────────────────────────────────────────
const pool = new pg.Pool({
  host:     process.env.POSTGRES_HOST     ?? 'localhost',
  port:     Number(process.env.POSTGRES_PORT ?? 5432),
  database: process.env.POSTGRES_DB_LIVE  ?? 'abhitrade_live',
  user:     process.env.POSTGRES_USER     ?? 'tradekaro',
  password: process.env.POSTGRES_PASSWORD ?? 'tradekaro',
  ssl:      false,
  max:      5,
});

// ── HTTP helper ───────────────────────────────────────────────────────────────
async function apiFetch(url, { method = 'POST', headers = {}, body } = {}) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${txt.slice(0, 200)}`);
  }
  return res.json();
}

// ── Shared AngelOne headers ───────────────────────────────────────────────────
const ANGEL_HEADERS = {
  'X-PrivateKey':     API_KEY,
  'X-UserType':       'USER',
  'X-SourceID':       'WEB',
  'X-ClientLocalIP':  '127.0.0.1',
  'X-ClientPublicIP': '127.0.0.1',
  'X-MACAddress':     '00:00:00:00:00:00',
};

// ── AngelOne login ────────────────────────────────────────────────────────────
async function login() {
  if (!CLIENT_ID || !PASSWORD || !TOTP_SEC) {
    throw new Error('Missing ANGELONE_CLIENT_ID / ANGELONE_PASSWORD / ANGELONE_TOTP_SECRET in .env.local');
  }
  const pin = totp(TOTP_SEC);
  console.log(`    TOTP generated: ${pin}`);
  const resp = await apiFetch(LOGIN_URL, {
    headers: ANGEL_HEADERS,
    body: { clientcode: CLIENT_ID, password: PASSWORD, totp: pin },
  });
  if (!resp.status || !resp.data?.jwtToken) {
    throw new Error(`Login failed: ${JSON.stringify(resp)}`);
  }
  console.log(`    Logged in as ${CLIENT_ID} ✓`);
  return resp.data.jwtToken;
}

// ── Fetch LTP for one instrument ──────────────────────────────────────────────
async function fetchLtp(token, symbol, jwtToken, retries = 2) {
  // Derive exchange from exch_seg stored in DB (passed as symbol context)
  // The LTP endpoint expects: exchange, tradingsymbol, symboltoken
  const [exchange, tradingsymbol] = symbol; // [exch_seg, symbol_col]

  // Map AngelOne exch_seg to API exchange field
  const exchMap = { NSE: 'NSE', BSE: 'BSE', NFO: 'NFO', BFO: 'BFO',
                    MCX: 'MCX', CDS: 'CDS', NCO: 'NCO', NCDEX: 'NCDEX' };
  const apiExchange = exchMap[exchange] ?? exchange;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const resp = await apiFetch(LTP_URL, {
        headers: { ...ANGEL_HEADERS, 'Authorization': `Bearer ${jwtToken}` },
        body: { exchange: apiExchange, tradingsymbol, symboltoken: token },
      });

      if (!resp.status || !resp.data) return null;
      const d = Array.isArray(resp.data) ? resp.data[0] : resp.data;
      if (!d) return null;
      return {
        ltp:   parseFloat(d.ltp)   || null,
        open:  parseFloat(d.open)  || null,
        high:  parseFloat(d.high)  || null,
        low:   parseFloat(d.low)   || null,
        close: parseFloat(d.close) || null,
      };
    } catch (err) {
      if (attempt === retries) return null; // give up, skip
      await sleep(500 * (attempt + 1));
    }
  }
  return null;
}

// ── DB batch update ───────────────────────────────────────────────────────────
async function flushUpdates(client, updates) {
  if (!updates.length) return;
  const vals   = [];
  const params = [];
  let   p      = 1;
  for (const u of updates) {
    vals.push(`($${p++},$${p++},$${p++},$${p++},$${p++},$${p++})`);
    params.push(u.token, u.ltp, u.open, u.high, u.low, u.close);
  }
  await client.query(`
    UPDATE angle_scrip AS t SET
      ltp            = v.ltp::NUMERIC,
      open           = v.open::NUMERIC,
      high           = v.high::NUMERIC,
      low            = v.low::NUMERIC,
      close          = v.close::NUMERIC,
      ltp_updated_at = now()
    FROM (VALUES ${vals.join(',')}) AS v(token, ltp, open, high, low, close)
    WHERE t.token = v.token
  `, params);
}

// ── Concurrency pool ──────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function runConcurrent(tasks, fn, concurrency) {
  let idx = 0;
  const results = new Array(tasks.length);
  async function worker() {
    while (idx < tasks.length) {
      const i = idx++;
      results[i] = await fn(tasks[i], i);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n📋  AngelOne LTP Fetcher');
  console.log('─'.repeat(50));

  // 1. Apply migration
  const client = await pool.connect();
  try {
    const migSql = readFileSync(resolve(__dir, 'migrate-angle-scrip-ltp.sql'), 'utf8');
    console.log('\n🛠   Applying LTP column migration ...');
    await client.query(migSql);
    console.log('    Done.');
  } finally {
    client.release();
  }

  // 2. Login
  console.log('\n🔐  Logging in to AngelOne ...');
  const jwtToken = await login();

  // 3. Load instruments from DB
  console.log('\n📂  Loading instruments from angle_scrip ...');
  let whereClause = '';
  if (!fetchAll && !exchFilter) {
    whereClause = `WHERE exch_seg IN ('NSE','BSE')`;
    console.log('    Mode: NSE + BSE equities only (use --all for all segments)');
  } else if (exchFilter) {
    const escaped = exchFilter.map(e => `'${e}'`).join(',');
    whereClause = `WHERE exch_seg IN (${escaped})`;
    console.log(`    Mode: segments = ${exchFilter.join(', ')}`);
  } else {
    console.log('    Mode: ALL segments (175k+ rows — this will take a while)');
  }

  const { rows: instruments } = await pool.query(
    `SELECT token, exch_seg, symbol FROM angle_scrip ${whereClause} ORDER BY exch_seg, token`
  );
  console.log(`    ${instruments.length.toLocaleString()} instruments to process`);

  // 4. Fetch LTP concurrently
  const DB_BATCH  = 200; // rows to UPDATE at once
  const updates   = [];
  let   done      = 0, hits = 0, misses = 0;
  const dbClient  = await pool.connect();
  const t0        = Date.now();

  try {
    await runConcurrent(instruments, async (row) => {
      const result = await fetchLtp(row.token, [row.exch_seg, row.symbol], jwtToken);
      done++;

      if (result) {
        hits++;
        updates.push({ token: row.token, ...result });
        if (updates.length >= DB_BATCH) {
          const batch = updates.splice(0, DB_BATCH);
          await flushUpdates(dbClient, batch);
        }
      } else {
        misses++;
      }

      if (done % 100 === 0 || done === instruments.length) {
        const pct     = ((done / instruments.length) * 100).toFixed(1);
        const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
        const eta     = done < instruments.length
          ? Math.round((Date.now() - t0) / done * (instruments.length - done) / 1000)
          : 0;
        process.stdout.write(
          `\r    [${pct}%] ${done.toLocaleString()}/${instruments.length.toLocaleString()}` +
          `  hits=${hits}  misses=${misses}  ${elapsed}s elapsed` +
          (eta > 0 ? `  ETA ~${eta}s` : '     ')
        );
      }
    }, CONCURRENCY);

    // Flush remaining
    if (updates.length) await flushUpdates(dbClient, updates);

  } finally {
    dbClient.release();
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n\n✅  Done in ${elapsed}s  —  ${hits.toLocaleString()} updated, ${misses.toLocaleString()} no data`);

  // 5. Summary
  const { rows: sample } = await pool.query(`
    SELECT token, exch_seg, symbol, ltp, open, high, low, close, ltp_updated_at
    FROM   angle_scrip
    WHERE  ltp IS NOT NULL
    ORDER  BY ltp_updated_at DESC
    LIMIT  10
  `);
  console.log('\nSample of updated rows:');
  console.table(sample.map(r => ({
    token: r.token, seg: r.exch_seg, symbol: r.symbol,
    ltp: r.ltp, open: r.open, high: r.high, low: r.low, close: r.close,
  })));

  await pool.end();
}

main().catch(e => { console.error('\n✗', e.message); process.exit(1); });

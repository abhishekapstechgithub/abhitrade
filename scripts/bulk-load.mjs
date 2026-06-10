/**
 * Bulk-loads NSE/BSE security master CSV files into Redis.
 *
 * Usage:
 *   node scripts/bulk-load.mjs                         # uses files listed in config below
 *   node scripts/bulk-load.mjs /path/to/NSE_CM.csv     # single file
 *   node scripts/bulk-load.mjs file1.csv file2.csv ...  # multiple files
 *
 * Env vars: REDIS_HOST, REDIS_PORT, REDIS_PASSWORD (same as app)
 */

import { readFileSync, existsSync } from 'fs';
import { parse } from 'csv-parse/sync';
import Redis from 'ioredis';
import { randomUUID } from 'crypto';
import { resolve, basename } from 'path';

// ── Default file list ─────────────────────────────────────────────────────────
// In Docker: CSV files are mounted at /csv (the project root).
// Locally:   set ABHITRADE_CSV_DIR or keep files in the project root.
const CSV_DIR = process.env.ABHITRADE_CSV_DIR ?? '/csv';
const DEFAULT_FILES = [
  `${CSV_DIR}/NSE_CM_security_05062026.csv`,
  `${CSV_DIR}/NSE_FO_contract_05062026.csv`,
  `${CSV_DIR}/BSE_EQD_CONTRACT_05062026.csv`,
  `${CSV_DIR}/BSE_EQ_SCRIP_05062026 (1).csv`,
];

// ── Redis connection ───────────────────────────────────────────────────────────
const redis = new Redis({
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: 3,
});
redis.on('error', (err) => console.error('[Redis] error:', err.message));

// ── Keys (mirror lib/redis-client.ts) ────────────────────────────────────────
const KEYS = {
  AUTOCOMPLETE: 'tk:auto',
  instr: (ex, token) => `tk:instr:${ex}:${token}`,
  bySymbol: (ex, sym) => `tk:sym:${ex}:${sym.toUpperCase()}`,
  job: (id) => `tk:job:${id}`,
};

// ── Date helpers ──────────────────────────────────────────────────────────────
const MONTHS = { Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12' };
function unixToISO(ts) {
  if (!ts || ts === '0') return '';
  const n = Number(ts);
  if (isNaN(n) || n <= 0) return '';
  return new Date(n * 1000).toISOString().slice(0, 10);
}
function bseToISO(d) {
  const m = (d ?? '').match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);
  if (!m) return '';
  return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${MONTHS[m[2]] ?? '01'}-${m[1].padStart(2,'0')}`;
}
function num(v, fb = 0) { const n = Number(v ?? fb); return isNaN(n) ? fb : n; }

// ── Format detection ──────────────────────────────────────────────────────────
function detectFormat(headers, filename, firstRow) {
  const fn = filename.toUpperCase();
  if (fn.includes('NSE_CM') || fn.includes('NSE_SECURITY')) return 'NSE_CM';
  if (fn.includes('NSE_FO')) {
    // Check if XpryDt is a BSE-style date string
    const sample = firstRow?.XpryDt ?? '';
    if (/^\d{1,2}-[A-Za-z]{3}-\d{2,4}$/.test(sample)) return 'BSE_FO';
    return 'NSE_FO';
  }
  if (fn.includes('BSE_EQD')) return 'BSE_FO';
  if (fn.includes('BSE_EQ')) return 'BSE_EQ';

  const h = headers.join(',').toUpperCase();
  const hasFO = h.includes('XPRYDT') && h.includes('STRKPRIC');
  if (hasFO) {
    const sample = firstRow?.XpryDt ?? '';
    return /^\d{1,2}-[A-Za-z]{3}-\d{2,4}$/.test(sample) ? 'BSE_FO' : 'NSE_FO';
  }
  return h.includes('SCTYSRS') ? 'NSE_CM' : 'UNKNOWN';
}

// ── Parsers ───────────────────────────────────────────────────────────────────
function deriveType(instrNm, optnTp) {
  const n = (instrNm ?? '').toUpperCase();
  if (n.includes('OPTIDX') || n.includes('OPTSTK') || n === 'SO' || n === 'IO') {
    return optnTp === 'CE' ? 'CE' : optnTp === 'PE' ? 'PE' : 'OPT';
  }
  return 'FUT';
}

function parseNSECM(rows) {
  return rows
    .filter(r => r.TckrSymb?.trim() && r.DelFlg !== 'Y')
    .map(r => ({
      token: r.FinInstrmId?.trim(),
      exchange: 'NSE',
      symbol: r.TckrSymb.trim(),
      tradingSymbol: `${r.TckrSymb.trim()}-NSE-${(r.SctySrs ?? 'EQ').trim()}`,
      name: r.FinInstrmNm?.trim() ?? r.TckrSymb.trim(),
      instrumentType: 'EQ',
      series: r.SctySrs?.trim() ?? '',
      isin: r.ISIN?.trim() ?? '',
      lotSize: num(r.NewBrdLotQty, 1),
      tickSize: num(r.BidIntrvl, 0.05),
    }))
    .filter(r => r.token);
}

function parseNSEFO(rows) {
  return rows
    .filter(r => r.TckrSymb?.trim() && r.DelFlg !== 'Y')
    .map(r => {
      const type = deriveType(r.FinInstrmNm, r.OptnTp);
      const strike = r.StrkPric ? num(r.StrkPric) / 100 : undefined;
      return {
        token: r.FinInstrmId?.trim(),
        exchange: 'NSE',
        symbol: r.TckrSymb.trim(),
        tradingSymbol: r.StockNm?.trim() || r.TckrSymb.trim(),
        name: r.StockNm?.trim() || r.TckrSymb.trim(),
        instrumentType: type,
        lotSize: num(r.MinLot, 1),
        tickSize: num(r.BidIntrvl, 0.05),
        expiry: unixToISO(r.XpryDt),
        strike: strike && strike > 0 ? strike : undefined,
        optionType: (r.OptnTp === 'CE' || r.OptnTp === 'PE') ? r.OptnTp : '',
        underlying: r.TckrSymb.trim(),
        underlyingToken: r.UndrlygFinInstrmId?.trim() ?? '',
      };
    })
    .filter(r => r.token);
}

function parseBSEFO(rows) {
  return rows
    .filter(r => r.TckrSymb?.trim() && r.DelFlg === 'A')
    .map(r => {
      const type = deriveType(r.FinInstrmNm ?? 'SO', r.OptnTp);
      const raw = r.StrkPric ? num(r.StrkPric) : undefined;
      const strike = raw && raw > 0 ? (raw > 10000 ? raw / 100 : raw) : undefined;
      return {
        token: r.FinInstrmId?.trim(),
        exchange: 'BSE',
        symbol: r.TckrSymb.trim(),
        tradingSymbol: r.StockNm?.trim() || r.TckrSymb.trim(),
        name: r.StockNm?.trim() || r.TckrSymb.trim(),
        instrumentType: type,
        lotSize: num(r.MinLot, 1),
        tickSize: num(r.BidIntrvl, 0.05),
        expiry: bseToISO(r.XpryDt),
        strike: strike && strike > 0 ? strike : undefined,
        optionType: (r.OptnTp === 'CE' || r.OptnTp === 'PE') ? r.OptnTp : '',
        underlying: r.TckrSymb.trim(),
        underlyingToken: r.UndrlygFinInstrmId?.trim() ?? '',
      };
    })
    .filter(r => r.token);
}

function parseBSEEQ(rows) {
  return rows
    .filter(r => r.TckrSymb?.trim() && r.DelFlg !== 'Y')
    .map(r => ({
      token: r.FinInstrmId?.trim(),
      exchange: 'BSE',
      symbol: r.TckrSymb.trim().replace('#', ''),
      tradingSymbol: `${r.TckrSymb.trim().replace('#','')}-BSE-${(r.SctySrs ?? 'A').trim()}`,
      name: r.FinInstrmNm?.trim() ?? r.TckrSymb.trim(),
      instrumentType: 'EQ',
      series: r.SctySrs?.trim() ?? '',
      isin: r.ISIN?.trim() ?? '',
      lotSize: num(r.NewBrdLotQty, 1),
      tickSize: num(r.BidIntrvl, 0.05),
    }))
    .filter(r => r.token);
}

function parseByFormat(format, rows) {
  switch (format) {
    case 'NSE_CM': return parseNSECM(rows);
    case 'NSE_FO': return parseNSEFO(rows);
    case 'BSE_FO': return parseBSEFO(rows);
    case 'BSE_EQ': return parseBSEEQ(rows);
    default: return [];
  }
}

// ── Redis loader ──────────────────────────────────────────────────────────────
const CHUNK = 500;

function buildAutoEntry(r) {
  const display = r.tradingSymbol.toUpperCase();
  return `${display}|${r.token}|${r.exchange}|${r.instrumentType}|${r.underlying ?? r.symbol}|${r.expiry ?? ''}|${r.strike ?? ''}|${r.optionType ?? ''}|${r.name}`;
}

async function flushChunk(records) {
  if (!records.length) return { written: 0, duplicates: 0 };

  // Dedup: HSETNX sentinel field — returns 1 for new keys, 0 for existing
  const checkPl = redis.pipeline();
  for (const r of records) checkPl.hsetnx(KEYS.instr(r.exchange, r.token), '_loaded', '1');
  const checkResults = await checkPl.exec();

  let duplicates = 0;
  const toWrite = records.filter((_, i) => {
    const isNew = checkResults?.[i]?.[1] === 1;
    if (!isNew) duplicates++;
    return isNew;
  });

  if (!toWrite.length) return { written: 0, duplicates };

  const pl = redis.pipeline();
  const countByExchange = {};
  for (const r of toWrite) {
    countByExchange[r.exchange] = (countByExchange[r.exchange] ?? 0) + 1;

    const entry = buildAutoEntry(r);
    pl.zadd(KEYS.AUTOCOMPLETE, 'NX', 0, entry);
    const symEntry = `${r.symbol.toUpperCase()}|${r.token}|${r.exchange}|${r.instrumentType}|${r.symbol}|||${r.optionType ?? ''}|${r.name}`;
    if (symEntry !== entry) pl.zadd(KEYS.AUTOCOMPLETE, 'NX', 0, symEntry);

    pl.hset(KEYS.instr(r.exchange, r.token), {
      token: r.token, exchange: r.exchange, symbol: r.symbol,
      tradingSymbol: r.tradingSymbol, name: r.name,
      instrumentType: r.instrumentType,
      series: r.series ?? '', isin: r.isin ?? '',
      lotSize: String(r.lotSize), tickSize: String(r.tickSize),
      expiry: r.expiry ?? '', strike: r.strike != null ? String(r.strike) : '',
      optionType: r.optionType ?? '', underlying: r.underlying ?? '',
      underlyingToken: r.underlyingToken ?? '',
    });

    pl.sadd(KEYS.bySymbol(r.exchange, r.symbol), r.token);
  }
  for (const [ex, cnt] of Object.entries(countByExchange)) {
    pl.incrby(`tk:count:${ex.toUpperCase()}`, cnt);
  }
  await pl.exec();
  return { written: toWrite.length, duplicates };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function loadFile(filePath) {
  const filename = basename(filePath);
  console.log(`\n📂  Loading ${filename} ...`);
  const t0 = Date.now();

  const content = readFileSync(filePath);
  const rows = parse(content, {
    columns: true, skip_empty_lines: true, trim: true,
    relax_column_count: true, bom: true,
  });

  const headers = Object.keys(rows[0] ?? {});
  const format = detectFormat(headers, filename, rows[0]);
  if (format === 'UNKNOWN') {
    console.error(`    ✗ Unknown format. Headers: ${headers.slice(0,6).join(', ')}`);
    return;
  }
  console.log(`    Format detected: ${format}`);

  const records = parseByFormat(format, rows);
  console.log(`    Parsed ${records.length} / ${rows.length} records`);

  let loaded = 0, totalDups = 0;
  for (let i = 0; i < records.length; i += CHUNK) {
    const { written, duplicates } = await flushChunk(records.slice(i, i + CHUNK));
    loaded += written; totalDups += duplicates;
    process.stdout.write(`\r    New: ${loaded}  Skipped (dups): ${totalDups}  `);
  }
  console.log(`\n    ✓ Done in ${((Date.now() - t0) / 1000).toFixed(1)}s  (${totalDups} duplicates skipped)`);
}

async function main() {
  const files = process.argv.slice(2).length
    ? process.argv.slice(2).map(f => resolve(f))
    : DEFAULT_FILES;

  console.log('\n🔗  Connecting to Redis...');
  try {
    await redis.ping();
    console.log('    Connected.');
  } catch (e) {
    console.error('    ✗ Cannot reach Redis:', e.message);
    process.exit(1);
  }

  for (const f of files) {
    if (!existsSync(f)) {
      console.warn(`⚠️  File not found, skipping: ${f}`);
      continue;
    }
    await loadFile(f);
  }

  const total = await redis.zcard(KEYS.AUTOCOMPLETE);
  console.log(`\n✅  Bulk load complete. tk:auto has ${total.toLocaleString()} entries.\n`);
  redis.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });

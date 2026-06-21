/**
 * Loads AngelOne OpenAPIScripMaster.json into the angle_scrip Postgres table.
 *
 * Usage:
 *   node scripts/load-angle-scrip.mjs                        # reads OpenAPIScripMaster.json from project root
 *   node scripts/load-angle-scrip.mjs /path/to/file.json     # custom path
 *   node scripts/load-angle-scrip.mjs --fresh                # truncate table before loading
 *
 * Env vars (optional — defaults match docker-compose):
 *   POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB_LIVE,
 *   POSTGRES_USER, POSTGRES_PASSWORD
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const { Pool } = pg;
const __dir = dirname(fileURLToPath(import.meta.url));

const BATCH = 1000;

const pool = new Pool({
  host:     process.env.POSTGRES_HOST     ?? 'localhost',
  port:     Number(process.env.POSTGRES_PORT ?? 5432),
  database: process.env.POSTGRES_DB_LIVE  ?? 'abhitrade_live',
  user:     process.env.POSTGRES_USER     ?? 'tradekaro',
  password: process.env.POSTGRES_PASSWORD ?? 'tradekaro',
  ssl:      (process.env.POSTGRES_SSL ?? 'false') === 'true' ? { rejectUnauthorized: false } : false,
});

function parseExpiry(raw) {
  if (!raw || raw.trim() === '') return null;
  // Format from AngelOne: "19JUN2026" or "19JUN26" or ISO "2026-06-19"
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(raw.trim()) ? raw.trim() : null;
  if (iso) return iso;
  const m = raw.trim().match(/^(\d{1,2})([A-Z]{3})(\d{2,4})$/i);
  if (!m) return null;
  const MONTHS = { JAN:'01',FEB:'02',MAR:'03',APR:'04',MAY:'05',JUN:'06',
                   JUL:'07',AUG:'08',SEP:'09',OCT:'10',NOV:'11',DEC:'12' };
  const year = m[3].length === 2 ? '20' + m[3] : m[3];
  const mon  = MONTHS[m[2].toUpperCase()];
  if (!mon) return null;
  return `${year}-${mon}-${m[1].padStart(2,'0')}`;
}

async function applyMigration(client) {
  const sql = readFileSync(resolve(__dir, 'migrate-angle-scrip.sql'), 'utf8');
  await client.query(sql);
}

async function insertBatch(client, rows) {
  if (!rows.length) return 0;

  const values = [];
  const params = [];
  let p = 1;

  for (const r of rows) {
    values.push(`($${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++})`);
    params.push(
      r.token,
      r.symbol,
      r.name,
      parseExpiry(r.expiry),
      parseFloat(r.strike)  || 0,
      parseInt(r.lotsize)   || 1,
      r.instrumenttype,
      r.exch_seg,
      parseFloat(r.tick_size) || 0,
      parseInt(r.freeze_qty)  || 0,
    );
  }

  const sql = `
    INSERT INTO angle_scrip
      (token, symbol, name, expiry, strike, lotsize, instrumenttype, exch_seg, tick_size, freeze_qty)
    VALUES ${values.join(',')}
    ON CONFLICT (token) DO UPDATE SET
      symbol         = EXCLUDED.symbol,
      name           = EXCLUDED.name,
      expiry         = EXCLUDED.expiry,
      strike         = EXCLUDED.strike,
      lotsize        = EXCLUDED.lotsize,
      instrumenttype = EXCLUDED.instrumenttype,
      exch_seg       = EXCLUDED.exch_seg,
      tick_size      = EXCLUDED.tick_size,
      freeze_qty     = EXCLUDED.freeze_qty,
      loaded_at      = now()
  `;
  await client.query(sql, params);
  return rows.length;
}

async function main() {
  const args = process.argv.slice(2);
  const fresh = args.includes('--fresh');
  const filePath = args.find(a => !a.startsWith('--'))
    ?? resolve(__dir, '..', 'OpenAPIScripMaster.json');

  if (!existsSync(filePath)) {
    console.error(`✗ File not found: ${filePath}`);
    process.exit(1);
  }

  console.log(`\n📂  Reading ${filePath} ...`);
  const raw = JSON.parse(readFileSync(filePath, 'utf8'));
  if (!Array.isArray(raw)) { console.error('✗ Expected a JSON array'); process.exit(1); }
  console.log(`    ${raw.length.toLocaleString()} records found`);

  const client = await pool.connect();
  try {
    console.log('\n🛠   Applying migration (CREATE TABLE IF NOT EXISTS) ...');
    await applyMigration(client);

    if (fresh) {
      console.log('⚠️   --fresh: truncating angle_scrip ...');
      await client.query('TRUNCATE TABLE angle_scrip');
    }

    console.log('\n⬆️   Inserting records in batches of', BATCH, '...');
    const t0 = Date.now();
    let inserted = 0;

    await client.query('BEGIN');
    for (let i = 0; i < raw.length; i += BATCH) {
      inserted += await insertBatch(client, raw.slice(i, i + BATCH));
      process.stdout.write(`\r    Processed: ${inserted.toLocaleString()} / ${raw.length.toLocaleString()}  `);
    }
    await client.query('COMMIT');

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`\n\n✅  Done! ${inserted.toLocaleString()} rows upserted in ${elapsed}s`);

    const { rows } = await client.query(
      `SELECT exch_seg, instrumenttype, COUNT(*) AS cnt
       FROM angle_scrip
       GROUP BY exch_seg, instrumenttype
       ORDER BY cnt DESC
       LIMIT 15`
    );
    console.log('\nBreakdown by exchange + instrument type:');
    console.table(rows.map(r => ({ exchange: r.exch_seg, type: r.instrumenttype, count: r.cnt })));

  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('\n✗ Error:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();

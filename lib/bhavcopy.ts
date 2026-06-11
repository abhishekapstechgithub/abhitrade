// Server-side only — Bhavcopy EOD price loader
// Uses UNNEST bulk updates: one query per file instead of one per row.

import fs   from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { getPool } from '@/lib/db/client';

export interface BhavcopyResult {
  file:    string;
  loaded:  number;
  skipped: number;
  errors:  string[];
  date:    string | null;
}

export interface BhavcopyStats {
  files:        number;
  totalLoaded:  number;
  totalSkipped: number;
  results:      BhavcopyResult[];
}

// ── Schema migration ───────────────────────────────────────────────────────────

let _migrationDone = false;
async function ensureColumns(): Promise<void> {
  if (_migrationDone) return;
  await getPool('live').query(`
    ALTER TABLE security_master
      ADD COLUMN IF NOT EXISTS ltp              DECIMAL(12,2),
      ADD COLUMN IF NOT EXISTS open_price       DECIMAL(12,2),
      ADD COLUMN IF NOT EXISTS high_price       DECIMAL(12,2),
      ADD COLUMN IF NOT EXISTS low_price        DECIMAL(12,2),
      ADD COLUMN IF NOT EXISTS close_price      DECIMAL(12,2),
      ADD COLUMN IF NOT EXISTS prev_close       DECIMAL(12,2),
      ADD COLUMN IF NOT EXISTS net_change       DECIMAL(12,2),
      ADD COLUMN IF NOT EXISTS change_pct       DECIMAL(8,4),
      ADD COLUMN IF NOT EXISTS volume           BIGINT,
      ADD COLUMN IF NOT EXISTS open_interest    BIGINT,
      ADD COLUMN IF NOT EXISTS price_date       DATE,
      ADD COLUMN IF NOT EXISTS price_updated_at TIMESTAMPTZ
  `);
  _migrationDone = true;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function p(v: string | undefined): number | null {
  if (!v || v.trim() === '' || v === '-') return null;
  const n = parseFloat(v.replace(/,/g, ''));
  return isNaN(n) ? null : n;
}

function pi(v: string | undefined): number | null {
  if (!v || v.trim() === '' || v === '-') return null;
  const n = parseInt(v.replace(/,/g, ''), 10);
  return isNaN(n) ? null : n;
}

function parseDate(v: string | undefined): string | null {
  if (!v || v.trim() === '') return null;
  const s = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [d, m, y] = s.split('/');
    return `${y}-${m}-${d}`;
  }
  const MON: Record<string, string> = {
    JAN:'01',FEB:'02',MAR:'03',APR:'04',MAY:'05',JUN:'06',
    JUL:'07',AUG:'08',SEP:'09',OCT:'10',NOV:'11',DEC:'12',
  };
  const match = s.match(/^(\d{2})-([A-Z]{3})-(\d{4})$/i);
  if (match) return `${match[3]}-${MON[match[2].toUpperCase()] ?? '01'}-${match[1]}`;
  return null;
}

function isNewFormat(headers: string[]): boolean {
  return headers.some(h => h.trim() === 'FinInstrmId');
}

// ── Batch SQL ─────────────────────────────────────────────────────────────────

// New format: update by token using UNNEST (single round-trip)
const BATCH_BY_TOKEN_SQL = `
UPDATE security_master AS sm SET
  ltp              = d.ltp::DECIMAL,
  open_price       = d.open::DECIMAL,
  high_price       = d.high::DECIMAL,
  low_price        = d.low::DECIMAL,
  close_price      = d.close::DECIMAL,
  prev_close       = d.prev::DECIMAL,
  net_change       = d.chg::DECIMAL,
  change_pct       = d.pct::DECIMAL,
  volume           = d.vol::BIGINT,
  open_interest    = d.oi::BIGINT,
  price_date       = d.dt::DATE,
  price_updated_at = NOW()
FROM (
  SELECT
    UNNEST($1::TEXT[])    AS token,
    UNNEST($2::TEXT[])    AS ltp,
    UNNEST($3::TEXT[])    AS open,
    UNNEST($4::TEXT[])    AS high,
    UNNEST($5::TEXT[])    AS low,
    UNNEST($6::TEXT[])    AS close,
    UNNEST($7::TEXT[])    AS prev,
    UNNEST($8::TEXT[])    AS chg,
    UNNEST($9::TEXT[])    AS pct,
    UNNEST($10::TEXT[])   AS vol,
    UNNEST($11::TEXT[])   AS oi,
    UNNEST($12::TEXT[])   AS dt
) AS d
WHERE sm.token = d.token
`;

// Old format: update by symbol+series
const BATCH_BY_SYMBOL_SQL = `
UPDATE security_master AS sm SET
  ltp              = d.ltp::DECIMAL,
  open_price       = d.open::DECIMAL,
  high_price       = d.high::DECIMAL,
  low_price        = d.low::DECIMAL,
  close_price      = d.close::DECIMAL,
  prev_close       = d.prev::DECIMAL,
  net_change       = d.chg::DECIMAL,
  change_pct       = d.pct::DECIMAL,
  volume           = d.vol::BIGINT,
  open_interest    = NULL,
  price_date       = d.dt::DATE,
  price_updated_at = NOW()
FROM (
  SELECT
    UNNEST($1::TEXT[])    AS symbol,
    UNNEST($2::TEXT[])    AS series,
    UNNEST($3::TEXT[])    AS ltp,
    UNNEST($4::TEXT[])    AS open,
    UNNEST($5::TEXT[])    AS high,
    UNNEST($6::TEXT[])    AS low,
    UNNEST($7::TEXT[])    AS close,
    UNNEST($8::TEXT[])    AS prev,
    UNNEST($9::TEXT[])    AS chg,
    UNNEST($10::TEXT[])   AS pct,
    UNNEST($11::TEXT[])   AS vol,
    UNNEST($12::TEXT[])   AS dt
) AS d
WHERE sm.symbol = d.symbol AND (sm.series = d.series OR sm.series IS NULL)
`;

function str(v: number | null): string {
  return v == null ? '' : String(v);
}

// ── Per-file processor ─────────────────────────────────────────────────────────

async function processFile(filePath: string): Promise<BhavcopyResult> {
  const result: BhavcopyResult = { file: path.basename(filePath), loaded: 0, skipped: 0, errors: [], date: null };

  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    result.errors.push(`Read error: ${(e as Error).message}`);
    return result;
  }

  let rows: Record<string, string>[];
  try {
    rows = parse(content, {
      columns: true, skip_empty_lines: true, trim: true, relax_column_count: true,
    }) as Record<string, string>[];
  } catch (e) {
    result.errors.push(`CSV parse error: ${(e as Error).message}`);
    return result;
  }

  if (!rows.length) return result;

  const headers = Object.keys(rows[0]);
  const newFmt  = isNewFormat(headers);
  const pool    = getPool('live');

  if (newFmt) {
    // ── Collect all rows into arrays, then single UNNEST update ──────────────
    const tokens: string[] = [], ltps: string[] = [], opens: string[] = [];
    const highs: string[] = [],  lows: string[] = [],  closes: string[] = [];
    const prevs: string[] = [],  chgs: string[] = [],  pcts: string[] = [];
    const vols: string[] = [],   ois: string[] = [],   dts: string[] = [];

    for (const row of rows) {
      const token = row['FinInstrmId']?.trim();
      if (!token) { result.skipped++; continue; }

      const ltp       = p(row['LastPric']);
      const open      = p(row['OpnPric']);
      const high      = p(row['HghPric']);
      const low       = p(row['LwPric']);
      const close     = p(row['ClsPric']);
      const prev      = p(row['PrvsClsgPric']);
      const vol       = pi(row['TtlTradgVol']);
      const oi        = pi(row['OpnIntrst']);
      const date      = parseDate(row['TradDt'] || row['BizDt']);
      const netChg    = (ltp != null && prev != null) ? parseFloat((ltp - prev).toFixed(2)) : null;
      const chgPct    = (netChg != null && prev != null && prev !== 0)
        ? parseFloat(((netChg / prev) * 100).toFixed(4)) : null;

      if (!result.date && date) result.date = date;

      tokens.push(token);
      ltps.push(str(ltp));   opens.push(str(open));  highs.push(str(high));
      lows.push(str(low));   closes.push(str(close)); prevs.push(str(prev));
      chgs.push(str(netChg)); pcts.push(str(chgPct));
      vols.push(str(vol));   ois.push(str(oi));       dts.push(date ?? '');
    }

    if (tokens.length > 0) {
      try {
        const res = await pool.query(BATCH_BY_TOKEN_SQL, [
          tokens, ltps, opens, highs, lows, closes, prevs, chgs, pcts, vols, ois, dts,
        ]);
        result.loaded  = res.rowCount ?? 0;
        result.skipped += tokens.length - result.loaded;
      } catch (e) {
        result.errors.push((e as Error).message);
      }
    }

  } else {
    // ── Old format: batch by symbol+series ────────────────────────────────────
    const symbols: string[] = [], series: string[] = [], ltps: string[] = [];
    const opens: string[] = [],  highs: string[] = [],  lows: string[] = [];
    const closes: string[] = [], prevs: string[] = [],  chgs: string[] = [];
    const pcts: string[] = [],   vols: string[] = [],   dts: string[] = [];

    for (const row of rows) {
      const symbol = row['SYMBOL']?.trim();
      const ser    = (row['SERIES'] ?? 'EQ').trim();
      if (!symbol) { result.skipped++; continue; }

      const ltp    = p(row['LAST']  || row['CLOSE']);
      const open   = p(row['OPEN']);
      const high   = p(row['HIGH']);
      const low    = p(row['LOW']);
      const close  = p(row['CLOSE']);
      const prev   = p(row['PREVCLOSE']);
      const vol    = pi(row['TOTTRDQTY']);
      const date   = parseDate(row['TIMESTAMP'] || row['DATE1'] || row['TDATE']);
      const netChg = (ltp != null && prev != null) ? parseFloat((ltp - prev).toFixed(2)) : null;
      const chgPct = (netChg != null && prev != null && prev !== 0)
        ? parseFloat(((netChg / prev) * 100).toFixed(4)) : null;

      if (!result.date && date) result.date = date;

      symbols.push(symbol);  series.push(ser);
      ltps.push(str(ltp));   opens.push(str(open));   highs.push(str(high));
      lows.push(str(low));   closes.push(str(close));  prevs.push(str(prev));
      chgs.push(str(netChg)); pcts.push(str(chgPct));
      vols.push(str(vol));   dts.push(date ?? '');
    }

    if (symbols.length > 0) {
      try {
        const res = await pool.query(BATCH_BY_SYMBOL_SQL, [
          symbols, series, ltps, opens, highs, lows, closes, prevs, chgs, pcts, vols, dts,
        ]);
        result.loaded  = res.rowCount ?? 0;
        result.skipped += symbols.length - result.loaded;
      } catch (e) {
        result.errors.push((e as Error).message);
      }
    }
  }

  return result;
}

// ── Public entry point ─────────────────────────────────────────────────────────

export async function loadBhavcopy(): Promise<BhavcopyStats> {
  const dir = path.join(process.cwd(), 'Bhavcopy');

  await ensureColumns().catch(() => {});

  if (!fs.existsSync(dir)) {
    return { files: 0, totalLoaded: 0, totalSkipped: 0, results: [] };
  }

  const files = fs.readdirSync(dir).filter(f => /\.(csv|CSV)$/.test(f));
  if (!files.length) {
    return { files: 0, totalLoaded: 0, totalSkipped: 0, results: [] };
  }

  // Process files sequentially — avoids OOM on large NSE FO files
  const results: BhavcopyResult[] = [];
  for (const f of files) {
    results.push(await processFile(path.join(dir, f)));
  }

  return {
    files:        files.length,
    totalLoaded:  results.reduce((s, r) => s + r.loaded,  0),
    totalSkipped: results.reduce((s, r) => s + r.skipped, 0),
    results,
  };
}

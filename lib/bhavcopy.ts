// Server-side only — Bhavcopy EOD price loader
// Reads CSV files from <project-root>/Bhavcopy/ and updates security_master price columns.
//
// Supported formats:
//   New NSE/BSE (FinInstrmId column present):
//     TradDt,BizDt,Sgmt,Src,FinInstrmTp,FinInstrmId,ISIN,TckrSymb,SctySrs,XpryDt,
//     FinInstrmNm,OpnPric,HghPric,LwPric,ClsPric,LastPric,PrvsClsgPric,...TtlTradgVol,OpnIntrst
//
//   Old NSE EQ (no FinInstrmId):
//     SYMBOL,SERIES,OPEN,HIGH,LOW,CLOSE,LAST,PREVCLOSE,TOTTRDQTY,...,ISIN

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
  files:       number;
  totalLoaded: number;
  totalSkipped:number;
  results:     BhavcopyResult[];
}

// ── SQL ────────────────────────────────────────────────────────────────────────

const APPLY_MIGRATION_SQL = `
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
  ADD COLUMN IF NOT EXISTS price_updated_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_sm_price_date ON security_master(price_date) WHERE price_date IS NOT NULL;
`;

// Update by token (new format — FinInstrmId → token)
const UPDATE_BY_TOKEN_SQL = `
UPDATE security_master SET
  ltp              = $1,
  open_price       = $2,
  high_price       = $3,
  low_price        = $4,
  close_price      = $5,
  prev_close       = $6,
  net_change       = $7,
  change_pct       = $8,
  volume           = $9,
  open_interest    = $10,
  price_date       = $11,
  price_updated_at = NOW()
WHERE token = $12
`;

// Update by symbol + series (old format)
const UPDATE_BY_SYMBOL_SQL = `
UPDATE security_master SET
  ltp              = $1,
  open_price       = $2,
  high_price       = $3,
  low_price        = $4,
  close_price      = $5,
  prev_close       = $6,
  net_change       = $7,
  change_pct       = $8,
  volume           = $9,
  open_interest    = $10,
  price_date       = $11,
  price_updated_at = NOW()
WHERE symbol = $12 AND (series = $13 OR series IS NULL)
`;

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
  // Formats: DD-MON-YYYY (20-JAN-2025), YYYY-MM-DD, DD/MM/YYYY
  const s = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [d, m, y] = s.split('/');
    return `${y}-${m}-${d}`;
  }
  // DD-MON-YYYY  e.g. 11-JUN-2026
  const m: Record<string,string> = {
    JAN:'01',FEB:'02',MAR:'03',APR:'04',MAY:'05',JUN:'06',
    JUL:'07',AUG:'08',SEP:'09',OCT:'10',NOV:'11',DEC:'12',
  };
  const match = s.match(/^(\d{2})-([A-Z]{3})-(\d{4})$/i);
  if (match) return `${match[3]}-${m[match[2].toUpperCase()] ?? '01'}-${match[1]}`;
  return null;
}

// ── Format detectors ───────────────────────────────────────────────────────────

function isNewFormat(headers: string[]): boolean {
  return headers.some(h => h.trim() === 'FinInstrmId');
}

// ── Per-file processor ─────────────────────────────────────────────────────────

async function processFile(filePath: string): Promise<BhavcopyResult> {
  const result: BhavcopyResult = { file: path.basename(filePath), loaded: 0, skipped: 0, errors: [], date: null };

  const content = fs.readFileSync(filePath, 'utf8');
  let rows: Record<string, string>[];
  try {
    rows = parse(content, { columns: true, skip_empty_lines: true, trim: true, relax_column_count: true }) as Record<string, string>[];
  } catch (e) {
    result.errors.push(`CSV parse error: ${(e as Error).message}`);
    return result;
  }

  if (!rows.length) return result;

  const headers = Object.keys(rows[0]);
  const newFmt  = isNewFormat(headers);
  const pool    = getPool('live');

  for (const row of rows) {
    try {
      let updated = 0;

      if (newFmt) {
        // ── New format ──────────────────────────────────────────────────────
        const token    = row['FinInstrmId']?.trim();
        if (!token) { result.skipped++; continue; }

        const ltp      = p(row['LastPric']);
        const open     = p(row['OpnPric']);
        const high     = p(row['HghPric']);
        const low      = p(row['LwPric']);
        const close    = p(row['ClsPric']);
        const prevClose= p(row['PrvsClsgPric']);
        const vol      = pi(row['TtlTradgVol']);
        const oi       = pi(row['OpnIntrst']);
        const date     = parseDate(row['TradDt'] || row['BizDt']);
        const netChg   = (ltp != null && prevClose != null) ? parseFloat((ltp - prevClose).toFixed(2)) : null;
        const chgPct   = (netChg != null && prevClose != null && prevClose !== 0)
          ? parseFloat(((netChg / prevClose) * 100).toFixed(4)) : null;

        if (!result.date && date) result.date = date;

        const res = await pool.query(UPDATE_BY_TOKEN_SQL, [
          ltp, open, high, low, close, prevClose, netChg, chgPct, vol, oi, date, token,
        ]);
        updated = res.rowCount ?? 0;

      } else {
        // ── Old format ──────────────────────────────────────────────────────
        const symbol   = row['SYMBOL']?.trim();
        const series   = (row['SERIES'] ?? 'EQ').trim();
        if (!symbol) { result.skipped++; continue; }

        const ltp      = p(row['LAST']  || row['CLOSE']);
        const open     = p(row['OPEN']);
        const high     = p(row['HIGH']);
        const low      = p(row['LOW']);
        const close    = p(row['CLOSE']);
        const prevClose= p(row['PREVCLOSE']);
        const vol      = pi(row['TOTTRDQTY']);
        const date     = parseDate(row['TIMESTAMP'] || row['DATE1'] || row['TDATE']);
        const netChg   = (ltp != null && prevClose != null) ? parseFloat((ltp - prevClose).toFixed(2)) : null;
        const chgPct   = (netChg != null && prevClose != null && prevClose !== 0)
          ? parseFloat(((netChg / prevClose) * 100).toFixed(4)) : null;

        if (!result.date && date) result.date = date;

        const res = await pool.query(UPDATE_BY_SYMBOL_SQL, [
          ltp, open, high, low, close, prevClose, netChg, chgPct, vol, null, date, symbol, series,
        ]);
        updated = res.rowCount ?? 0;
      }

      if (updated > 0) result.loaded++;
      else result.skipped++;

    } catch (e) {
      result.errors.push((e as Error).message);
    }
  }

  return result;
}

// ── Public entry point ─────────────────────────────────────────────────────────

export async function loadBhavcopy(): Promise<BhavcopyStats> {
  const dir = path.join(process.cwd(), 'Bhavcopy');

  // Ensure columns exist before loading
  await getPool('live').query(APPLY_MIGRATION_SQL).catch(() => {});

  if (!fs.existsSync(dir)) {
    return { files: 0, totalLoaded: 0, totalSkipped: 0, results: [] };
  }

  const files = fs.readdirSync(dir).filter(f => /\.(csv|CSV)$/.test(f));
  if (!files.length) {
    return { files: 0, totalLoaded: 0, totalSkipped: 0, results: [] };
  }

  const results = await Promise.all(files.map(f => processFile(path.join(dir, f))));

  return {
    files:        files.length,
    totalLoaded:  results.reduce((s, r) => s + r.loaded,  0),
    totalSkipped: results.reduce((s, r) => s + r.skipped, 0),
    results,
  };
}

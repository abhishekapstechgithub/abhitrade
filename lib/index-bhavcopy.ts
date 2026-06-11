// Server-side only — Index EOD price loader
// Reads CSV files from <project-root>/index/ and populates index_prices table.
//
// Supported formats:
//   NSE (ind_close_all_*.csv):
//     Index Name, Index Date, Open Index Value, High Index Value, Low Index Value,
//     Closing Index Value, Points Change, Change(%), Volume, Turnover (Rs. Cr.),
//     P/E, P/B, Div Yield
//
//   BSE (INDEXSummary_*.csv):
//     IndexCode, IndexID, IndexName, PreviousClose, OpenPrice, HighPrice,
//     LowPrice, ClosePrice, 52weeksHigh, 52weeksLow, ...

import fs   from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { getPool } from '@/lib/db/client';

export interface IndexResult {
  file:    string;
  loaded:  number;
  skipped: number;
  errors:  string[];
  date:    string | null;
  exchange: string;
}

export interface IndexStats {
  files:        number;
  totalLoaded:  number;
  totalSkipped: number;
  results:      IndexResult[];
}

const UPSERT_SQL = `
INSERT INTO index_prices
  (symbol, exchange, price_date, open_price, high_price, low_price, close_price,
   prev_close, net_change, change_pct, volume, high_52w, low_52w,
   pe_ratio, pb_ratio, div_yield, price_updated_at)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW())
ON CONFLICT (symbol, price_date) DO UPDATE SET
  open_price       = EXCLUDED.open_price,
  high_price       = EXCLUDED.high_price,
  low_price        = EXCLUDED.low_price,
  close_price      = EXCLUDED.close_price,
  prev_close       = EXCLUDED.prev_close,
  net_change       = EXCLUDED.net_change,
  change_pct       = EXCLUDED.change_pct,
  volume           = EXCLUDED.volume,
  high_52w         = EXCLUDED.high_52w,
  low_52w          = EXCLUDED.low_52w,
  pe_ratio         = EXCLUDED.pe_ratio,
  pb_ratio         = EXCLUDED.pb_ratio,
  div_yield        = EXCLUDED.div_yield,
  price_updated_at = NOW()
`;

function p(v: string | undefined): number | null {
  if (!v || v.trim() === '' || v === '-' || v.trim() === '-') return null;
  const n = parseFloat(v.replace(/,/g, '').trim());
  return isNaN(n) ? null : n;
}

function pi(v: string | undefined): number | null {
  if (!v || v.trim() === '') return null;
  const n = parseInt(v.replace(/,/g, '').trim(), 10);
  return isNaN(n) ? null : n;
}

function parseDateNSE(v: string | undefined): string | null {
  if (!v) return null;
  const s = v.trim();
  // DD-MM-YYYY
  if (/^\d{2}-\d{2}-\d{4}$/.test(s)) {
    const [d, m, y] = s.split('-');
    return `${y}-${m}-${d}`;
  }
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

function dateFromFilename(filename: string): string | null {
  // e.g. INDEXSummary_10062026.csv → 2026-06-10
  const m = filename.match(/(\d{2})(\d{2})(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

function isNSEFormat(headers: string[]): boolean {
  return headers.some(h => h.trim() === 'Index Name' || h.trim() === 'Closing Index Value');
}

function isBSEFormat(headers: string[]): boolean {
  return headers.some(h => h.trim() === 'IndexID' || h.trim() === 'IndexName');
}

async function processFile(filePath: string): Promise<IndexResult> {
  const filename = path.basename(filePath);
  const result: IndexResult = { file: filename, loaded: 0, skipped: 0, errors: [], date: null, exchange: '' };

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
  const pool    = getPool('live');

  if (isNSEFormat(headers)) {
    result.exchange = 'NSE';
    for (const row of rows) {
      try {
        const symbol    = row['Index Name']?.trim();
        if (!symbol || symbol === 'Index Name') { result.skipped++; continue; }

        const date      = parseDateNSE(row['Index Date']);
        const open      = p(row['Open Index Value']);
        const high      = p(row['High Index Value']);
        const low       = p(row['Low Index Value']);
        const close     = p(row['Closing Index Value']);
        const netChg    = p(row['Points Change']);
        const chgPct    = p(row['Change(%)']) ?? p(row['Change(% )']);
        const vol       = pi(row['Volume']);
        const prevClose = (close != null && netChg != null) ? parseFloat((close - netChg).toFixed(2)) : null;

        if (!result.date && date) result.date = date;

        await pool.query(UPSERT_SQL, [
          symbol, 'NSE', date, open, high, low, close,
          prevClose, netChg, chgPct, vol,
          null, null,
          p(row['P/E']), p(row['P/B']), p(row['Div Yield']),
        ]);
        result.loaded++;
      } catch (e) {
        result.errors.push((e as Error).message);
        result.skipped++;
      }
    }
  } else if (isBSEFormat(headers)) {
    result.exchange = 'BSE';
    const fileDate = dateFromFilename(filename);
    if (fileDate) result.date = fileDate;

    for (const row of rows) {
      try {
        const symbol    = row['IndexName']?.trim() || row['IndexID']?.trim();
        if (!symbol) { result.skipped++; continue; }

        const open      = p(row['OpenPrice']);
        const high      = p(row['HighPrice']);
        const low       = p(row['LowPrice']);
        const close     = p(row['ClosePrice']);
        const prevClose = p(row['PreviousClose']);
        const netChg    = (close != null && prevClose != null) ? parseFloat((close - prevClose).toFixed(2)) : null;
        const chgPct    = (netChg != null && prevClose != null && prevClose !== 0)
          ? parseFloat(((netChg / prevClose) * 100).toFixed(4)) : null;
        const high52w   = p(row['52weeksHigh']);
        const low52w    = p(row['52weeksLow']);

        await pool.query(UPSERT_SQL, [
          symbol, 'BSE', fileDate, open, high, low, close,
          prevClose, netChg, chgPct, null,
          high52w, low52w,
          null, null, null,
        ]);
        result.loaded++;
      } catch (e) {
        result.errors.push((e as Error).message);
        result.skipped++;
      }
    }
  } else {
    result.errors.push(`Unrecognized format — headers: ${headers.slice(0, 5).join(', ')}`);
  }

  return result;
}

export async function loadIndexBhavcopy(dirOverride?: string): Promise<IndexStats> {
  const dir = dirOverride ?? path.join(process.cwd(), 'index');

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

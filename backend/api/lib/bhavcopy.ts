// Server-side only — Bhavcopy EOD price loader
// Uses UNNEST bulk updates: one query per file instead of one per row.

import fs   from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { getPool } from '@/lib/db/client';
import { redis } from '@/lib/redis-client';

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
  purged:       number;
  results:      BhavcopyResult[];
}

interface BhavcopyFileInternal {
  result:    BhavcopyResult;
  exchange?: string;
  segment?:  string;
  tokens:    string[];
}

// ── Schema migrations ──────────────────────────────────────────────────────────

let _migrationDone = false;
async function ensureColumns(): Promise<void> {
  if (_migrationDone) return;
  const pool = getPool('live');
  await pool.query(`
    ALTER TABLE security_master
      ADD COLUMN IF NOT EXISTS ltp              DECIMAL(12,2),
      ADD COLUMN IF NOT EXISTS open_price       DECIMAL(12,2),
      ADD COLUMN IF NOT EXISTS high_price       DECIMAL(12,2),
      ADD COLUMN IF NOT EXISTS low_price        DECIMAL(12,2),
      ADD COLUMN IF NOT EXISTS close_price      DECIMAL(12,2),
      ADD COLUMN IF NOT EXISTS prev_close       DECIMAL(12,2),
      ADD COLUMN IF NOT EXISTS net_change       DECIMAL(12,2),
      ADD COLUMN IF NOT EXISTS change_pct       DECIMAL(12,4),
      ADD COLUMN IF NOT EXISTS volume           BIGINT,
      ADD COLUMN IF NOT EXISTS open_interest    BIGINT,
      ADD COLUMN IF NOT EXISTS price_date       DATE,
      ADD COLUMN IF NOT EXISTS price_updated_at TIMESTAMPTZ
  `);
  // Widen change_pct if an older deployment created it as DECIMAL(8,4).
  await pool.query(`
    ALTER TABLE security_master ALTER COLUMN change_pct TYPE DECIMAL(12,4)
  `).catch(() => {});

  // angle_scrip EOD columns (populated by Bhavcopy upload)
  await pool.query(`
    ALTER TABLE angle_scrip
      ADD COLUMN IF NOT EXISTS prev_close    NUMERIC(18,4),
      ADD COLUMN IF NOT EXISTS change_pct   NUMERIC(12,4),
      ADD COLUMN IF NOT EXISTS volume        BIGINT,
      ADD COLUMN IF NOT EXISTS open_interest BIGINT,
      ADD COLUMN IF NOT EXISTS price_date    DATE
  `).catch(() => {});

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

// ── angle_scrip EOD update — token-keyed, single UNNEST round-trip ────────────

const ANGLE_SCRIP_BY_TOKEN_SQL = `
UPDATE angle_scrip AS a SET
  ltp            = NULLIF(d.ltp,  '')::NUMERIC,
  open           = NULLIF(d.open, '')::NUMERIC,
  high           = NULLIF(d.high, '')::NUMERIC,
  low            = NULLIF(d.low,  '')::NUMERIC,
  close          = NULLIF(d.close,'')::NUMERIC,
  prev_close     = NULLIF(d.prev, '')::NUMERIC,
  change_pct     = NULLIF(d.pct,  '')::NUMERIC,
  volume         = NULLIF(d.vol,  '')::BIGINT,
  open_interest  = NULLIF(d.oi,   '')::BIGINT,
  price_date     = NULLIF(d.dt,   '')::DATE,
  ltp_updated_at = NOW()
FROM (
  SELECT
    UNNEST($1::TEXT[])  AS token,
    UNNEST($2::TEXT[])  AS ltp,
    UNNEST($3::TEXT[])  AS open,
    UNNEST($4::TEXT[])  AS high,
    UNNEST($5::TEXT[])  AS low,
    UNNEST($6::TEXT[])  AS close,
    UNNEST($7::TEXT[])  AS prev,
    UNNEST($8::TEXT[])  AS pct,
    UNNEST($9::TEXT[])  AS vol,
    UNNEST($10::TEXT[]) AS oi,
    UNNEST($11::TEXT[]) AS dt
) AS d
WHERE a.token = d.token
`;

// Old format: update by symbol, limited to EQ instruments on NSE/BSE
const ANGLE_SCRIP_BY_SYMBOL_SQL = `
UPDATE angle_scrip AS a SET
  ltp            = NULLIF(d.ltp,  '')::NUMERIC,
  open           = NULLIF(d.open, '')::NUMERIC,
  high           = NULLIF(d.high, '')::NUMERIC,
  low            = NULLIF(d.low,  '')::NUMERIC,
  close          = NULLIF(d.close,'')::NUMERIC,
  prev_close     = NULLIF(d.prev, '')::NUMERIC,
  change_pct     = NULLIF(d.pct,  '')::NUMERIC,
  volume         = NULLIF(d.vol,  '')::BIGINT,
  open_interest  = NULL,
  price_date     = NULLIF(d.dt,   '')::DATE,
  ltp_updated_at = NOW()
FROM (
  SELECT
    UNNEST($1::TEXT[])  AS symbol,
    UNNEST($2::TEXT[])  AS ltp,
    UNNEST($3::TEXT[])  AS open,
    UNNEST($4::TEXT[])  AS high,
    UNNEST($5::TEXT[])  AS low,
    UNNEST($6::TEXT[])  AS close,
    UNNEST($7::TEXT[])  AS prev,
    UNNEST($8::TEXT[])  AS pct,
    UNNEST($9::TEXT[])  AS vol,
    UNNEST($10::TEXT[]) AS dt
) AS d
WHERE a.symbol = d.symbol AND a.exch_seg IN ('NSE','BSE') AND a.instrumenttype = 'EQ'
`;

// ── Batch SQL ─────────────────────────────────────────────────────────────────

// New format: update by token using UNNEST (single round-trip)
const BATCH_BY_TOKEN_SQL = `
UPDATE security_master AS sm SET
  ltp              = NULLIF(d.ltp,  '')::DECIMAL,
  open_price       = NULLIF(d.open, '')::DECIMAL,
  high_price       = NULLIF(d.high, '')::DECIMAL,
  low_price        = NULLIF(d.low,  '')::DECIMAL,
  close_price      = NULLIF(d.close,'')::DECIMAL,
  prev_close       = NULLIF(d.prev, '')::DECIMAL,
  net_change       = NULLIF(d.chg,  '')::DECIMAL,
  change_pct       = NULLIF(d.pct,  '')::DECIMAL,
  volume           = NULLIF(d.vol,  '')::BIGINT,
  open_interest    = NULLIF(d.oi,   '')::BIGINT,
  price_date       = NULLIF(d.dt,   '')::DATE,
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
  ltp              = NULLIF(d.ltp,  '')::DECIMAL,
  open_price       = NULLIF(d.open, '')::DECIMAL,
  high_price       = NULLIF(d.high, '')::DECIMAL,
  low_price        = NULLIF(d.low,  '')::DECIMAL,
  close_price      = NULLIF(d.close,'')::DECIMAL,
  prev_close       = NULLIF(d.prev, '')::DECIMAL,
  net_change       = NULLIF(d.chg,  '')::DECIMAL,
  change_pct       = NULLIF(d.pct,  '')::DECIMAL,
  volume           = NULLIF(d.vol,  '')::BIGINT,
  open_interest    = NULL,
  price_date       = NULLIF(d.dt,   '')::DATE,
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

// ── Redis EOD cache sync ───────────────────────────────────────────────────────
// After the Postgres UNNEST update, fetch the updated rows and write them to Redis
// with no TTL so the data persists overnight until the next bhavcopy load.
async function syncEodToRedis(pool: ReturnType<typeof getPool>, tokens: string[]): Promise<void> {
  try {
    const { rows } = await pool.query<{
      symbol: string; exchange: string; token: string;
      ltp: string; open_price: string; high_price: string; low_price: string;
      close_price: string; prev_close: string; net_change: string;
      change_pct: string; volume: string; price_date: string;
    }>(`
      SELECT symbol, exchange, token,
             ltp, open_price, high_price, low_price, close_price,
             prev_close, net_change, change_pct, volume, price_date
      FROM security_master
      WHERE token = ANY($1::TEXT[]) AND ltp IS NOT NULL
        AND price_updated_at >= NOW() - INTERVAL '60 seconds'
    `, [tokens]);
    if (!rows.length) return;
    const pipe = redis.pipeline();
    for (const r of rows) {
      const quote = {
        symbol: r.symbol, exchange: r.exchange, token: r.token,
        ltp:        r.ltp        ? parseFloat(r.ltp)        : null,
        open:       r.open_price ? parseFloat(r.open_price) : null,
        high:       r.high_price ? parseFloat(r.high_price) : null,
        low:        r.low_price  ? parseFloat(r.low_price)  : null,
        close:      r.close_price? parseFloat(r.close_price): null,
        prevClose:  r.prev_close ? parseFloat(r.prev_close) : null,
        netChange:  r.net_change ? parseFloat(r.net_change) : null,
        changePct:  r.change_pct ? parseFloat(r.change_pct): null,
        volume:     r.volume     ? parseInt(r.volume, 10)   : null,
        date:       r.price_date,
        source:     'eod',
        updatedAt:  Date.now(),
      };
      pipe.set(`at:market:eod:${r.exchange}:${r.symbol.toUpperCase()}`, JSON.stringify(quote));
    }
    await pipe.exec();
  } catch { /* non-fatal — Postgres is the source of truth */ }
}

function str(v: number | null): string {
  return v == null ? '' : String(v);
}

// ── Per-file processor ─────────────────────────────────────────────────────────

async function processFile(filePath: string): Promise<BhavcopyFileInternal> {
  const result: BhavcopyResult = { file: path.basename(filePath), loaded: 0, skipped: 0, errors: [], date: null };

  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    result.errors.push(`Read error: ${(e as Error).message}`);
    return { result, tokens: [] };
  }

  let rows: Record<string, string>[];
  try {
    rows = parse(content, {
      columns: true, skip_empty_lines: true, trim: true, relax_column_count: true,
    }) as Record<string, string>[];
  } catch (e) {
    result.errors.push(`CSV parse error: ${(e as Error).message}`);
    return { result, tokens: [] };
  }

  if (!rows.length) return { result, tokens: [] };

  let returnExchange: string | undefined;
  let returnSegment:  string | undefined;
  let returnTokens:   string[] = [];

  const headers = Object.keys(rows[0]);
  const newFmt  = isNewFormat(headers);
  const pool    = getPool('live');

  if (newFmt) {
    // ── Collect all rows into arrays, then single UNNEST update ──────────────
    const tokens: string[] = [], ltps: string[] = [], opens: string[] = [];
    const highs: string[] = [],  lows: string[] = [],  closes: string[] = [];
    const prevs: string[] = [],  chgs: string[] = [],  pcts: string[] = [];
    const vols: string[] = [],   ois: string[] = [],   dts: string[] = [];

    let bhavExchange: string | undefined;
    let bhavSegment: string | undefined;
    const underlyingSpots = new Map<string, number>();

    for (const row of rows) {
      const token = row['FinInstrmId']?.trim();
      if (!token) { result.skipped++; continue; }

      if (!bhavExchange) bhavExchange = row['Src']?.trim().toUpperCase();
      if (!bhavSegment)  bhavSegment  = row['Sgmt']?.trim().toUpperCase();

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

      // Capture underlying spot price from FO rows — TckrSymb IS the underlying symbol
      if (row['Sgmt']?.trim().toUpperCase() === 'FO') {
        const sym = row['TckrSymb']?.trim();
        const undPric = p(row['UndrlygPric']);
        if (sym && undPric && undPric > 0 && !underlyingSpots.has(sym)) {
          underlyingSpots.set(sym, undPric);
        }
      }

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
        if (result.loaded > 0) syncEodToRedis(pool, tokens).catch(() => {});
      } catch (e) {
        result.errors.push((e as Error).message);
      }

      // Also update angle_scrip (ltp, open, high, low, close + new EOD columns)
      pool.query(ANGLE_SCRIP_BY_TOKEN_SQL, [
        tokens, ltps, opens, highs, lows, closes, prevs, pcts, vols, ois, dts,
      ]).catch(() => {});
    }

    // Write underlying spots to Redis so getSpot() resolves without MOCK_SPOT fallback
    if (underlyingSpots.size > 0) {
      const pipe = redis.pipeline();
      const now = Date.now();
      for (const [sym, ltp] of underlyingSpots) {
        pipe.set(`oc:spot:${sym}`, JSON.stringify({ ltp, change: 0, changePct: 0 }));
        pipe.set(`at:idx:${sym}`, JSON.stringify({ symbol: sym, ltp, change: 0, changePercent: 0, open: 0, high: 0, low: 0, close: 0, updatedAt: now }));
      }
      pipe.exec().catch(() => {});
      console.log(`[bhavcopy] Wrote spot prices to Redis: ${[...underlyingSpots.keys()].join(', ')}`);
    }

    returnExchange = bhavExchange;
    returnSegment  = bhavSegment;
    returnTokens   = tokens;

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
        // Fetch updated tokens to sync to Redis (old format doesn't have tokens in CSV)
        if (result.loaded > 0) {
          pool.query<{ token: string }>(
            `SELECT token FROM security_master WHERE symbol = ANY($1::TEXT[]) AND ltp IS NOT NULL`,
            [symbols]
          ).then(r => syncEodToRedis(pool, r.rows.map(x => x.token))).catch(() => {});
        }
      } catch (e) {
        result.errors.push((e as Error).message);
      }

      // Also update angle_scrip EOD prices keyed by symbol (EQ only)
      pool.query(ANGLE_SCRIP_BY_SYMBOL_SQL, [
        symbols, ltps, opens, highs, lows, closes, prevs, pcts, vols, dts,
      ]).catch(() => {});
    }
  }

  return { result, exchange: returnExchange, segment: returnSegment, tokens: returnTokens };
}

// ── Public entry point ─────────────────────────────────────────────────────────

export async function loadBhavcopy(): Promise<BhavcopyStats> {
  const dir = path.join(process.cwd(), 'Bhavcopy');

  await ensureColumns().catch(() => {});

  if (!fs.existsSync(dir)) {
    return { files: 0, totalLoaded: 0, totalSkipped: 0, purged: 0, results: [] };
  }

  const files = fs.readdirSync(dir).filter(f => /\.(csv|CSV)$/.test(f));
  if (!files.length) {
    return { files: 0, totalLoaded: 0, totalSkipped: 0, purged: 0, results: [] };
  }

  // Process files sequentially — avoids OOM on large NSE FO files
  const fileInternals: BhavcopyFileInternal[] = [];
  for (const f of files) {
    fileInternals.push(await processFile(path.join(dir, f)));
  }
  const results = fileInternals.map(fi => fi.result);

  // ── Purge security_master rows not found in any bhavcopy file ─────────────
  // Group collected tokens by exchange+segment so each pairing is purged independently.
  const byExchSeg = new Map<string, Set<string>>();
  for (const fi of fileInternals) {
    if (fi.exchange && fi.segment && fi.tokens.length) {
      const key = `${fi.exchange}:${fi.segment}`;
      const s = byExchSeg.get(key) ?? new Set<string>();
      for (const t of fi.tokens) s.add(t);
      byExchSeg.set(key, s);
    }
  }

  let purged = 0;
  if (byExchSeg.size > 0) {
    const pool = getPool('live');
    for (const [key, tokenSet] of byExchSeg) {
      const [exchange, segment] = key.split(':');
      const tokens = Array.from(tokenSet);
      try {
        const res = await pool.query(
          `DELETE FROM security_master
           WHERE exchange = $1 AND segment = $2
             AND token != ALL($3::TEXT[])`,
          [exchange, segment, tokens],
        );
        const n = res.rowCount ?? 0;
        purged += n;
        console.log(`[bhavcopy] Purged ${n} security_master rows not in bhavcopy for ${exchange}/${segment}`);
      } catch (e) {
        console.error('[bhavcopy] Purge error:', e);
      }
    }
  }

  return {
    files:        files.length,
    totalLoaded:  results.reduce((s, r) => s + r.loaded,  0),
    totalSkipped: results.reduce((s, r) => s + r.skipped, 0),
    purged,
    results,
  };
}

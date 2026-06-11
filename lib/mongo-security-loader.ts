/**
 * Security Master → PostgreSQL loader
 *
 * Routing (exchange + segment determines target rows to wipe before insert):
 *   NSE_CM  →  exchange=NSE, segment=CM
 *   BSE_CM  →  exchange=BSE, segment=CM
 *   NSE_FO  →  exchange=NSE, segment=FO
 *   BSE_FO  →  exchange=BSE, segment=FO
 *
 * Column mapping from raw CSV → security_master table:
 *   FinInstrmId      → token
 *   TckrSymb         → symbol  (+ trading_symbol for CM files)
 *   StockNm          → trading_symbol (FO files)
 *   FinInstrmNm      → name (CM) / instrument_type label (FO)
 *   SctySrs / SrsId  → series
 *   ISIN             → isin
 *   NewBrdLotQty     → lot_size
 *   TickSz/BidIntrvl → tick_size
 *   XpryDt           → expiry  (unix-sec for NSE_FO; dd-MMM-yyyy for BSE_FO)
 *   StrkPric         → strike  (raw value ÷ 100)
 *   OptnTp           → option_type (CE/PE)
 *   InstrmTp/FinInstrmNm → instrument_type
 */

import { createReadStream } from 'fs';
import { parse as createParser } from 'csv-parse';
import { getPool }   from './db/client';
import { upsertInstrumentsBatch, type SecurityMasterRow } from './db/repositories';
import { redis, KEYS } from './redis-client';

export type FileType = 'NSE_CM' | 'BSE_CM' | 'NSE_FO' | 'BSE_FO';

// ─── Job helpers ──────────────────────────────────────────────────────────────
async function setJob(jobId: string, fields: Record<string, string | number>): Promise<void> {
  await redis.hset(KEYS.job(jobId), fields as Record<string, string>);
  await redis.expire(KEYS.job(jobId), 86400);
}

// ─── CSV row → SecurityMasterRow ─────────────────────────────────────────────

function parseDate(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  // Unix timestamp (NSE_FO): e.g. "1467297000"
  if (/^\d{7,}$/.test(raw.trim())) {
    return new Date(parseInt(raw) * 1000).toISOString().slice(0, 10);
  }
  // dd-MMM-yyyy (BSE_FO): e.g. "27-AUG-2026"
  if (/^\d{2}-[A-Za-z]{3}-\d{4}$/.test(raw.trim())) {
    return new Date(raw.trim()).toISOString().slice(0, 10);
  }
  return undefined;
}

function toInstrumentType(fileType: FileType, row: Record<string, string>): string {
  if (fileType === 'NSE_CM' || fileType === 'BSE_CM') {
    const srs = (row['SctySrs'] ?? '').toUpperCase();
    if (srs === 'EQ' || srs === 'BE' || srs === 'BZ') return 'EQ';
    if (srs === 'INDEX' || srs === 'IDX') return 'IDX';
    return srs || 'EQ';
  }

  // FO files (both NSE and BSE):
  // FinInstrmNm can be: OPTIDX | OPTSTK | FUTIDX | FUTSTK
  // BSE also uses abbreviations:  IO/SO → options,  IF/SF → futures
  const nm  = (row['FinInstrmNm'] ?? '').toUpperCase().trim();
  const opt = (row['OptnTp']      ?? '').toUpperCase().trim();

  // Exact OPTIDX / OPTSTK
  if (nm === 'OPTIDX') return opt === 'PE' ? 'PE' : 'CE';   // index option
  if (nm === 'OPTSTK' || nm === 'SO' || nm === 'IO') return opt === 'PE' ? 'PE' : 'CE'; // stock option
  // Exact FUTIDX / FUTSTK
  if (nm === 'FUTIDX' || nm === 'IF') return 'FUTIDX';
  if (nm === 'FUTSTK' || nm === 'SF') return 'FUTSTK';
  // Prefix fallback
  if (nm.startsWith('OPT')) return opt === 'PE' ? 'PE' : 'CE';
  if (nm.startsWith('FUT')) return 'FUT';

  return nm || 'FUT';
}

function rowToPg(fileType: FileType, exchange: string, segment: string, row: Record<string, string>): SecurityMasterRow | null {
  const token = (row['FinInstrmId'] ?? '').trim();
  if (!token) return null;

  const isCM = fileType === 'NSE_CM' || fileType === 'BSE_CM';
  const symbol        = (row['TckrSymb'] ?? '').trim();
  const tradingSymbol = isCM ? symbol : (row['StockNm'] ?? symbol).trim();
  const name          = isCM
    ? (row['FinInstrmNm'] ?? symbol).trim()
    : (row['StockNm'] ?? row['TckrSymb'] ?? '').trim();
  const isin       = (row['ISIN'] ?? '').trim() || undefined;
  const lotRaw     = row['NewBrdLotQty'] ?? row['MinLot'] ?? '1';
  const tickRaw    = row['TickSz'] ?? row['BidIntrvl'] ?? '0.05';
  const lot_size   = parseInt(lotRaw) || 1;
  const tick_size  = parseFloat(tickRaw) || 0.05;
  const series     = (row['SctySrs'] ?? row['SrsId'] ?? '').trim() || undefined;
  const instrType  = toInstrumentType(fileType, row);

  // FO-only fields
  const expiry      = isCM ? undefined : parseDate(row['XpryDt']);
  const strikeRaw   = row['StrkPric'];
  const strike      = strikeRaw ? parseFloat(strikeRaw) / 100 : undefined;
  const optionType  = isCM ? undefined : ((row['OptnTp'] ?? '').toUpperCase().trim() || undefined);
  const underlying  = isCM ? undefined : symbol;

  return {
    token,
    exchange,
    symbol,
    trading_symbol:  tradingSymbol,
    name,
    isin,
    instrument_type: instrType,
    segment,
    lot_size,
    tick_size,
    expiry,
    strike,
    option_type: optionType,
    underlying,
  };
}

// ─── Result type ──────────────────────────────────────────────────────────────
export interface MongoLoadResult {       // name kept for import compatibility
  fileType:   FileType;
  segment:    string;
  exchange:   string;
  totalRows:  number;
  wiped:      number;
  inserted:   number;
  failed:     number;
  durationMs: number;
}

const CHUNK = 500;

// ─── Main loader ──────────────────────────────────────────────────────────────
export async function loadFileIntoMongo(
  filePath: string,
  filename: string,
  fileType: FileType,
  jobId:    string,
  _overwrite = false,           // ignored: wipe-then-insert is always full replace
): Promise<MongoLoadResult> {
  const t0       = Date.now();
  const segment  = fileType.endsWith('_CM') ? 'CM' : 'FO';
  const exchange = fileType.startsWith('NSE') ? 'NSE' : 'BSE';

  await setJob(jobId, { status: 'parsing', progress: 2, filename, fileType, segment, exchange });

  // ── Wipe existing rows for this exchange + segment FIRST ──────────────────
  await setJob(jobId, { status: 'wiping', progress: 5 });
  const pool = getPool('live');
  const wipeRes = await pool.query(
    'DELETE FROM security_master WHERE exchange = $1 AND segment = $2',
    [exchange, segment],
  );
  const wiped = wipeRes.rowCount ?? 0;
  console.log(`[pg-loader] Wiped ${wiped} rows (exchange=${exchange}, segment=${segment})`);

  // ── Invalidate Redis search cache for this exchange ───────────────────────
  try {
    const cacheKeys = await redis.keys(`tk:q:${exchange}:*`);
    if (cacheKeys.length) await redis.del(...cacheKeys);
  } catch { /* non-fatal */ }

  await setJob(jobId, { status: 'loading', progress: 8, wiped });

  // ── Stream-parse CSV + insert in batches ──────────────────────────────────
  // Use streaming so the entire file is never held in memory at once.
  let inserted  = 0;
  let failed    = 0;
  let total     = 0;
  let batch: SecurityMasterRow[] = [];
  let lastProgressUpdate = Date.now();

  const parser = createReadStream(filePath).pipe(
    createParser({
      columns: true, skip_empty_lines: true, trim: true,
      relax_column_count: true, bom: true,
    }),
  );

  try {
    for await (const row of parser as AsyncIterable<Record<string, string>>) {
      total++;
      const r = rowToPg(fileType, exchange, segment, row);
      if (r) batch.push(r);
      else failed++;

      if (batch.length >= CHUNK) {
        try {
          const written = await upsertInstrumentsBatch(batch);
          inserted += written;
        } catch (e) {
          console.error('[pg-loader] batch error:', e);
          failed += batch.length;
        }
        batch = [];

        // Throttle Redis progress updates to every 2 s
        if (Date.now() - lastProgressUpdate > 2000) {
          const pct = Math.min(95, Math.round(8 + (inserted / Math.max(total, 1)) * 87));
          await setJob(jobId, { progress: pct, loaded: inserted, totalRows: total });
          lastProgressUpdate = Date.now();
        }
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await setJob(jobId, { status: 'error', error: `CSV parse error: ${msg}` });
    throw e;
  }

  // ── Flush remaining batch ─────────────────────────────────────────────────
  if (batch.length > 0) {
    try {
      const written = await upsertInstrumentsBatch(batch);
      inserted += written;
    } catch (e) {
      console.error('[pg-loader] final batch error:', e);
      failed += batch.length;
    }
  }

  if (!total) {
    await setJob(jobId, { status: 'error', error: 'File is empty' });
    throw new Error('EMPTY_FILE');
  }

  const durationMs = Date.now() - t0;
  await setJob(jobId, {
    status: 'done', progress: 100,
    totalRows: total, wiped, inserted, failed, durationMs,
    completedAt: new Date().toISOString(),
  });

  return { fileType, segment, exchange, totalRows: total, wiped, inserted, failed, durationMs };
}

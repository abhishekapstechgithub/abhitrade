/**
 * Loads parsed instrument records into PostgreSQL (source of truth),
 * then indexes searchable fields into Redis (fast autocomplete + lookup).
 *
 * Redis layout:
 *   tk:auto          ZSET  — lexicographic autocomplete entries
 *   tk:instr:{ex}:{token}  HASH  — full instrument details
 *   tk:sym:{ex}:{SYM}      SET   — tokens for a given underlying symbol
 *   tk:job:{id}            HASH  — upload job progress / status
 */

import { parse } from 'csv-parse/sync';
import { readFile } from 'fs/promises';
import { redis, KEYS } from './redis-client';
import { detectFormat, parseByFormat, InstrumentRecord } from './parsers';
import type { FileFormat } from './parsers';
import { upsertInstrumentsBatch } from './db/repositories';
import type { SecurityMasterRow } from './db/repositories';

// ── Entry format in tk:auto sorted set ──────────────────────────────────────
// score = 0 (all equal so lex ordering works)
// member = "{DISPLAY}|{token}|{exchange}|{type}|{underlying}|{expiry}|{strike}|{optType}|{name}"
function buildAutoEntry(r: InstrumentRecord): string {
  const expiry = r.expiry ?? '';
  const strike = r.strike != null ? String(r.strike) : '';
  const optType = r.optionType ?? '';
  const underlying = r.underlying ?? r.symbol;
  // Display key = what user types to find this (symbol or tradingSymbol, uppercased)
  const display = r.tradingSymbol.toUpperCase();
  return `${display}|${r.token}|${r.exchange}|${r.instrumentType}|${underlying}|${expiry}|${strike}|${optType}|${r.name}`;
}

// ── Redis pipeline flush helper ───────────────────────────────────────────────
const CHUNK = 500; // records per pipeline

async function flushChunk(
  records: InstrumentRecord[],
  overwrite: boolean,
): Promise<{ written: number; duplicates: number }> {
  if (!records.length) return { written: 0, duplicates: 0 };

  // ── Deduplication: check which tokens already exist ──────────────────────
  // Use HSETNX on a sentinel field so we can detect new vs existing records
  // without a separate EXISTS round-trip when overwrite=false.
  let toWrite = records;
  let duplicates = 0;

  if (!overwrite) {
    const checkPl = redis.pipeline();
    for (const r of records) {
      // HSETNX returns 1 if the field was set (new key), 0 if it already existed
      checkPl.hsetnx(KEYS.instr(r.exchange, r.token), '_loaded', '1');
    }
    const results = await checkPl.exec();
    toWrite = records.filter((_, i) => {
      const isNew = (results?.[i]?.[1] as number) === 1;
      if (!isNew) duplicates++;
      return isNew;
    });
  }

  if (!toWrite.length) return { written: 0, duplicates };

  const pl = redis.pipeline();
  const countByExchange: Record<string, number> = {};

  for (const r of toWrite) {
    countByExchange[r.exchange] = (countByExchange[r.exchange] ?? 0) + 1;

    // 1. Autocomplete sorted set (ZADD NX — skip if member already in set)
    const entry = buildAutoEntry(r);
    pl.zadd(KEYS.AUTOCOMPLETE, 'NX', 0, entry);

    // 2. Symbol-only entry for bare-symbol searches
    const symEntry = `${r.symbol.toUpperCase()}|${r.token}|${r.exchange}|${r.instrumentType}|${r.symbol}|||${r.optionType ?? ''}|${r.name}`;
    if (symEntry !== entry) {
      pl.zadd(KEYS.AUTOCOMPLETE, 'NX', 0, symEntry);
    }

    // 3. Instrument hash (full upsert — overwrites stale fields on re-load)
    pl.hset(KEYS.instr(r.exchange, r.token), {
      token: r.token,
      exchange: r.exchange,
      symbol: r.symbol,
      tradingSymbol: r.tradingSymbol,
      name: r.name,
      instrumentType: r.instrumentType,
      series: r.series ?? '',
      isin: r.isin ?? '',
      lotSize: String(r.lotSize),
      tickSize: String(r.tickSize),
      expiry: r.expiry ?? '',
      strike: r.strike != null ? String(r.strike) : '',
      optionType: r.optionType ?? '',
      underlying: r.underlying ?? '',
      underlyingToken: r.underlyingToken ?? '',
    });

    // 4. Symbol → token index
    pl.sadd(KEYS.bySymbol(r.exchange, r.symbol), r.token);
  }

  // 5. Only count genuinely new records
  for (const [ex, count] of Object.entries(countByExchange)) {
    pl.incrby(KEYS.count(ex), count);
  }

  await pl.exec();
  return { written: toWrite.length, duplicates };
}

// ── Job helpers ───────────────────────────────────────────────────────────────

export async function setJobField(jobId: string, fields: Record<string, string | number>): Promise<void> {
  await redis.hset(KEYS.job(jobId), fields as Record<string, string>);
  // expire job key after 24 h
  await redis.expire(KEYS.job(jobId), 86400);
}

export async function getJob(jobId: string): Promise<Record<string, string> | null> {
  const data = await redis.hgetall(KEYS.job(jobId));
  return Object.keys(data).length ? data : null;
}

// ── Main loader ───────────────────────────────────────────────────────────────

export interface LoadResult {
  total: number;
  valid: number;
  invalid: number;
  duplicates: number;
  format: FileFormat;
  durationMs: number;
}

export async function loadFileIntoRedis(
  filePath: string,
  filename: string,
  jobId: string,
  overwrite = false,
): Promise<LoadResult> {
  const t0 = Date.now();

  await setJobField(jobId, { status: 'parsing', progress: 0, filePath, filename });

  // Read & parse CSV
  const content = await readFile(filePath);

  let rawRows: Record<string, string>[];
  try {
    rawRows = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      bom: true,
    }) as Record<string, string>[];
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    await setJobField(jobId, { status: 'error', error: `CSV parse error: ${msg}` });
    throw e;
  }

  const headers = Object.keys(rawRows[0] ?? {});
  const format = detectFormat(headers, filename);

  let resolvedFormat: FileFormat = format;
  if (format === 'NSE_FO' && rawRows.length > 0) {
    const sample = rawRows[0].XpryDt ?? '';
    if (/^\d{1,2}-[A-Za-z]{3}-\d{2,4}$/.test(sample)) {
      resolvedFormat = 'BSE_FO';
    }
  }

  if (resolvedFormat === 'UNKNOWN') {
    await setJobField(jobId, { status: 'error', error: `Unrecognised file format. Headers: ${headers.slice(0, 5).join(', ')}` });
    throw new Error('UNKNOWN_FORMAT');
  }

  await setJobField(jobId, { status: 'loading', format: resolvedFormat, totalRows: rawRows.length, progress: 5 });

  const exchange = resolvedFormat === 'NSE_CM' || resolvedFormat === 'NSE_FO' ? 'NSE' : 'BSE';
  const records = parseByFormat(resolvedFormat, rawRows);
  const total = rawRows.length;
  const valid = records.length;
  const invalid = total - valid;

  await setJobField(jobId, { valid, invalid, exchange, progress: 8 });

  // ── Phase 1: Write to PostgreSQL (source of truth) ──────────────────────────
  let pgWritten = 0;
  try {
    for (let i = 0; i < records.length; i += CHUNK) {
      const chunk = records.slice(i, i + CHUNK);
      const pgRows: SecurityMasterRow[] = chunk.map(r => ({
        token:           r.token,
        exchange:        r.exchange,
        symbol:          r.symbol,
        trading_symbol:  r.tradingSymbol,
        name:            r.name,
        isin:            r.isin,
        instrument_type: r.instrumentType,
        segment:         r.series ?? undefined,
        lot_size:        r.lotSize,
        tick_size:       r.tickSize,
        strike:          r.strike ?? undefined,
        expiry:          r.expiry ?? undefined,
        option_type:     r.optionType ?? undefined,
        underlying:      r.underlying ?? undefined,
      }));
      pgWritten += await upsertInstrumentsBatch(pgRows);
      const pct = Math.round(8 + ((i + chunk.length) / records.length) * 40);
      await setJobField(jobId, { progress: pct });
    }
  } catch (pgErr) {
    // PostgreSQL write failed — log but continue; Redis still gets indexed
    console.error('[loader] PostgreSQL upsert error:', pgErr);
    await setJobField(jobId, { pgWarning: 'PostgreSQL unavailable — data written to Redis only' });
  }

  await setJobField(jobId, { pgWritten, progress: 50 });

  // ── Phase 2: Index into Redis (autocomplete + fast lookup) ──────────────────
  let loaded = 0;
  let totalDuplicates = 0;
  for (let i = 0; i < records.length; i += CHUNK) {
    const chunk = records.slice(i, i + CHUNK);
    const { written, duplicates } = await flushChunk(chunk, overwrite);
    loaded += written;
    totalDuplicates += duplicates;
    const pct = Math.round(50 + ((i + chunk.length) / records.length) * 48);
    await setJobField(jobId, { progress: pct, loaded, duplicates: totalDuplicates });
  }

  const durationMs = Date.now() - t0;

  await setJobField(jobId, {
    status: 'done',
    progress: 100,
    total,
    valid,
    invalid,
    duplicates: totalDuplicates,
    format: resolvedFormat,
    durationMs,
    completedAt: new Date().toISOString(),
  });

  return { total, valid, invalid, duplicates: totalDuplicates, format: resolvedFormat, durationMs };
}

// ── Search via Redis autocomplete ─────────────────────────────────────────────

export interface SearchHit {
  token: string;
  exchange: string;
  symbol: string;
  tradingSymbol: string;
  name: string;
  instrumentType: string;
  expiry?: string;
  strike?: number;
  optionType?: string;
  underlying?: string;
  lotSize?: number;
}

export async function searchInstruments(
  query: string,
  limit = 20,
  filters?: { exchange?: string; type?: string },
): Promise<SearchHit[]> {
  if (!query || query.length < 1) return [];

  const prefix = query.toUpperCase();
  const rangeEnd = prefix.slice(0, -1) + String.fromCharCode(prefix.charCodeAt(prefix.length - 1) + 1);

  // ZRANGEBYLEX on autocomplete sorted set
  const members = await redis.zrangebylex(
    KEYS.AUTOCOMPLETE,
    `[${prefix}`,
    `(${rangeEnd}`,
    'LIMIT', 0, limit * 3, // fetch extra since we may filter
  );

  const hits: SearchHit[] = [];
  const seenTokens = new Set<string>();

  for (const member of members) {
    const parts = member.split('|');
    // format: display|token|exchange|type|underlying|expiry|strike|optType|name
    const [, token, exchange, instrumentType, underlying, expiry, strikeStr, optType, name] = parts;
    const display = parts[0];

    if (!token || seenTokens.has(`${exchange}:${token}`)) continue;

    if (filters?.exchange && exchange !== filters.exchange.toUpperCase()) continue;
    if (filters?.type) {
      const ft = filters.type.toUpperCase();
      if (ft === 'EQ' && instrumentType !== 'EQ') continue;
      if (ft === 'FO' && instrumentType === 'EQ') continue;
      if (ft === 'OPTIONS' && instrumentType !== 'CE' && instrumentType !== 'PE') continue;
      if (ft === 'FUTURES' && instrumentType !== 'FUT') continue;
    }

    seenTokens.add(`${exchange}:${token}`);
    hits.push({
      token,
      exchange,
      symbol: underlying || display,
      tradingSymbol: display,
      name: name || display,
      instrumentType,
      expiry: expiry || undefined,
      strike: strikeStr ? Number(strikeStr) : undefined,
      optionType: optType || undefined,
      underlying: underlying || undefined,
    });

    if (hits.length >= limit) break;
  }

  return hits;
}

// ── Stats ─────────────────────────────────────────────────────────────────────

export async function getRedisStats(): Promise<{
  totalEntries: number;
  nseEntries: number;
  bseEntries: number;
  available: boolean;
}> {
  try {
    await redis.ping();
    const [totalEntries, nseCount, bseCount] = await Promise.all([
      redis.zcard(KEYS.AUTOCOMPLETE),
      redis.get(KEYS.count('NSE')).then(v => Number(v ?? 0)),
      redis.get(KEYS.count('BSE')).then(v => Number(v ?? 0)),
    ]);
    return { totalEntries, nseEntries: nseCount, bseEntries: bseCount, available: true };
  } catch {
    return { totalEntries: 0, nseEntries: 0, bseEntries: 0, available: false };
  }
}

/**
 * Security Master → MongoDB loader
 *
 * File types and their routing:
 *   NSE_CM  →  segment=CM  →  NSE_E_EQUITY
 *   BSE_CM  →  segment=CM  →  BSE_E_EQUITY
 *   NSE_FO  →  segment=FO  →  NSE_D_FUTIDX | NSE_D_FUTSTK | NSE_D_OPTIDX | NSE_D_OPTSTK  (by FinInstrmNm)
 *   BSE_FO  →  segment=FO  →  BSE_D_OPTSTK
 */

import { parse } from 'csv-parse/sync';
import { readFile } from 'fs/promises';
import { getMongoDb } from './mongodb';
import { redis, KEYS } from './redis-client';

export type FileType = 'NSE_CM' | 'BSE_CM' | 'NSE_FO' | 'BSE_FO';

// ─── Collection routing ───────────────────────────────────────────────────────

// All collections that a given fileType can write to (used for pre-wipe)
const ALL_COLLECTIONS: Record<FileType, string[]> = {
  NSE_CM: ['NSE_E_EQUITY'],
  BSE_CM: ['BSE_E_EQUITY'],
  NSE_FO: ['NSE_D_FUTIDX', 'NSE_D_FUTSTK', 'NSE_D_OPTIDX', 'NSE_D_OPTSTK'],
  BSE_FO: ['BSE_D_OPTSTK'],
};

// Per-row routing for FO (splits by instrument type)
function getCollections(fileType: FileType, instrNm?: string): string[] {
  switch (fileType) {
    case 'NSE_CM': return ['NSE_E_EQUITY'];
    case 'BSE_CM': return ['BSE_E_EQUITY'];
    case 'BSE_FO': return ['BSE_D_OPTSTK'];
    case 'NSE_FO': {
      const t = (instrNm ?? '').toUpperCase().trim();
      if (t === 'OPTIDX') return ['NSE_D_OPTIDX'];
      if (t === 'OPTSTK') return ['NSE_D_OPTSTK'];
      if (t === 'FUTIDX') return ['NSE_D_FUTIDX'];
      if (t === 'FUTSTK') return ['NSE_D_FUTSTK'];
      return ['NSE_D_OPTSTK'];
    }
  }
}

function segmentFor(fileType: FileType): string {
  return fileType.endsWith('_CM') ? 'CM' : 'FO';
}

function exchangeFor(fileType: FileType): string {
  return fileType.startsWith('NSE') ? 'NSE' : 'BSE';
}

// ─── Job status helpers ───────────────────────────────────────────────────────

async function setJob(jobId: string, fields: Record<string, string | number>): Promise<void> {
  await redis.hset(KEYS.job(jobId), fields as Record<string, string>);
  await redis.expire(KEYS.job(jobId), 86400);
}

// ─── Main loader ──────────────────────────────────────────────────────────────

export interface MongoLoadResult {
  fileType: FileType;
  segment: string;
  exchange: string;
  totalRows: number;
  inserted: number;
  updated: number;
  failed: number;
  collections: Record<string, number>;
  durationMs: number;
}

const CHUNK = 500;

export async function loadFileIntoMongo(
  filePath: string,
  filename: string,
  fileType: FileType,
  jobId: string,
  overwrite = false,
): Promise<MongoLoadResult> {
  const t0 = Date.now();
  const segment = segmentFor(fileType);
  const exchange = exchangeFor(fileType);

  await setJob(jobId, { status: 'parsing', progress: 5, filename, fileType, segment, exchange });

  // ── Read & parse CSV ──────────────────────────────────────────────────────
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
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await setJob(jobId, { status: 'error', error: `CSV parse error: ${msg}` });
    throw e;
  }

  const total = rawRows.length;
  if (!total) {
    await setJob(jobId, { status: 'error', error: 'File is empty or has no data rows' });
    throw new Error('EMPTY_FILE');
  }

  await setJob(jobId, { status: 'loading', totalRows: total, progress: 10 });

  // ── Connect MongoDB ───────────────────────────────────────────────────────
  const db = await getMongoDb();

  // ── Wipe all target collections before loading ────────────────────────────
  await setJob(jobId, { status: 'wiping', progress: 8 });
  const wipedCounts: Record<string, number> = {};
  for (const colName of ALL_COLLECTIONS[fileType]) {
    const result = await db.collection(colName).deleteMany({});
    wipedCounts[colName] = result.deletedCount ?? 0;
    console.log(`[mongo-loader] Wiped ${wipedCounts[colName]} docs from ${colName}`);
  }
  await setJob(jobId, {
    status: 'loading',
    progress: 10,
    wiped: Object.values(wipedCounts).reduce((a, b) => a + b, 0),
  });

  let inserted = 0;
  let updated = 0;
  let failed = 0;
  const collectionCounts: Record<string, number> = {};

  // ── Group rows by target collection ──────────────────────────────────────
  // For NSE_FO we need to split rows into up to 4 collections by FinInstrmNm.
  // For others, everything goes to one collection.
  const groups: Map<string, Record<string, string>[]> = new Map();

  for (const row of rawRows) {
    const instrNm = row['FinInstrmNm'] ?? '';
    const targets = getCollections(fileType, instrNm);
    for (const col of targets) {
      if (!groups.has(col)) groups.set(col, []);
      groups.get(col)!.push(row);
    }
  }

  // ── Upsert each group into its collection ──────────────────────────────
  let processed = 0;
  for (const [colName, rows] of Array.from(groups)) {
    const coll = db.collection(colName);
    collectionCounts[colName] = 0;

    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);

      // Build bulk ops — upsert by FinInstrmId (the unique token)
      const ops = chunk.map((row: Record<string, string>) => {
        const doc: Record<string, unknown> = {
          ...row,
          Segment: segment,
          Exchange: exchange,
          FileType: fileType,
          _loadedAt: new Date(),
        };
        // Numeric conversions for FO files
        if (fileType === 'NSE_FO' || fileType === 'BSE_FO') {
          if (row['StrkPric']) doc['StrkPric'] = parseFloat(row['StrkPric']) / 100;
          if (row['NewBrdLotQty']) doc['NewBrdLotQty'] = parseInt(row['NewBrdLotQty']);
          if (row['MinLot']) doc['MinLot'] = parseInt(row['MinLot']);
          // NSE FO expiry is unix timestamp; BSE FO is dd-MMM-yyyy string — keep as-is
          if (fileType === 'NSE_FO' && row['XpryDt'] && /^\d+$/.test(row['XpryDt'])) {
            doc['XpryDt'] = new Date(parseInt(row['XpryDt']) * 1000);
          }
        }
        if (fileType === 'NSE_CM' || fileType === 'BSE_CM') {
          if (row['NewBrdLotQty']) doc['NewBrdLotQty'] = parseInt(row['NewBrdLotQty']);
        }
        return {
          updateOne: {
            filter: { FinInstrmId: row['FinInstrmId'] },
            update: { $set: doc },
            upsert: true,
          },
        };
      });

      try {
        const result = await coll.bulkWrite(ops, { ordered: false });
        const ins = result.upsertedCount ?? 0;
        const upd = result.modifiedCount ?? 0;
        inserted += ins;
        updated += upd;
        collectionCounts[colName] += ins + upd;
      } catch (e) {
        console.error(`[mongo-loader] bulkWrite error in ${colName}:`, e);
        failed += chunk.length;
      }

      processed += chunk.length;
      const pct = Math.round(10 + (processed / total) * 88);
      await setJob(jobId, {
        progress: pct,
        inserted,
        updated,
        failed,
        loaded: inserted + updated,
      });
    }
  }

  const durationMs = Date.now() - t0;

  await setJob(jobId, {
    status: 'done',
    progress: 100,
    totalRows: total,
    inserted,
    updated,
    failed,
    durationMs,
    completedAt: new Date().toISOString(),
    collections: JSON.stringify(collectionCounts),
  });

  return {
    fileType,
    segment,
    exchange,
    totalRows: total,
    inserted,
    updated,
    failed,
    collections: collectionCounts,
    durationMs,
  };
}

/**
 * Backtest service — all operations related to running, polling, and exporting
 * strategy backtests.
 *
 * The backtest lifecycle on the server is async:
 *   POST /run   → { jobId, status: 'queued' }
 *   GET  /:jobId → { status: 'running' | 'completed' | 'failed', ...result }
 *
 * Callers that need reactive UI should use the useBacktest() hook, which
 * wraps this service with automatic polling.
 */

import apiClient from './api.client';
import type {
  BacktestRunRequest,
  BacktestJobData,
  BacktestListParams,
  BacktestCompareRequest,
  BacktestCompareData,
  BacktestExportRequest,
  BacktestExportData,
} from './api.types';
import type { BacktestResult } from '../backtest/types/backtest.types';
import type { PaginationMeta } from './api.client';

const BASE = '/api/backtests';

// ─────────────────────────────────────────────────────────────────────────────
// Run — kick off a new backtest job
// ─────────────────────────────────────────────────────────────────────────────

async function run(config: BacktestRunRequest): Promise<BacktestJobData> {
  const res = await apiClient.post<{ data: BacktestJobData }, BacktestRunRequest>(
    `${BASE}/run`,
    {
      initialCapital:  100_000,
      slippagePct:     0.05,
      brokeragePerLot: 40,
      ...config,
    },
  );
  return res.data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Get result — poll until status is 'completed' or 'failed'
// ─────────────────────────────────────────────────────────────────────────────

async function getResult(jobId: string): Promise<BacktestResult> {
  const res = await apiClient.get<{ data: BacktestResult }>(`${BASE}/${jobId}`);
  return res.data;
}

// ─────────────────────────────────────────────────────────────────────────────
// List past runs
// ─────────────────────────────────────────────────────────────────────────────

export interface BacktestListResult {
  results: BacktestResult[];
  meta:    PaginationMeta;
}

async function list(params?: BacktestListParams): Promise<BacktestListResult> {
  const cleaned: Record<string, string | number | undefined> = {};
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== 'all' && v !== undefined) cleaned[k] = v as string | number;
    }
  }

  const res = await apiClient.get<{ data: BacktestResult[]; meta?: PaginationMeta }>(
    BASE,
    { params: cleaned },
  );

  return {
    results: res.data,
    meta:    res.meta ?? { page: 1, pageSize: res.data.length, total: res.data.length, totalPages: 1 },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Compare two backtest runs side by side
// ─────────────────────────────────────────────────────────────────────────────

async function compare(
  jobIdA: string,
  jobIdB: string,
): Promise<BacktestCompareData> {
  const body: BacktestCompareRequest = { jobIdA, jobIdB };
  const res = await apiClient.post<{ data: BacktestCompareData }, BacktestCompareRequest>(
    `${BASE}/compare`,
    body,
  );
  return res.data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Delete a backtest result
// ─────────────────────────────────────────────────────────────────────────────

async function remove(jobId: string): Promise<void> {
  await apiClient.delete(`${BASE}/${jobId}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Export — returns a pre-signed download URL
// ─────────────────────────────────────────────────────────────────────────────

async function exportResult(
  jobId:  string,
  format: BacktestExportRequest['format'],
): Promise<BacktestExportData> {
  const res = await apiClient.post<{ data: BacktestExportData }, BacktestExportRequest>(
    `${BASE}/${jobId}/export`,
    { format },
  );
  return res.data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public service object
// ─────────────────────────────────────────────────────────────────────────────

export const backtestService = {
  run,
  getResult,
  list,
  compare,
  remove,
  exportResult,
} as const;

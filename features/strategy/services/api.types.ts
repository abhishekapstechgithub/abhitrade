/**
 * All request-body and response-envelope types for the Strategy API.
 *
 * The real server doesn't exist yet — these types define the contract so that
 * when the backend is built, TypeScript enforces both sides automatically.
 *
 * Rule: types here describe what crosses the wire.
 * Domain types (Strategy, BacktestResult, …) live in their own files and are
 * re-used here as the inner `data` payload.
 */

import type { Strategy, StrategyCategory, StrategyStatus, StrategyLeg, PayoffPoint } from '../types/strategy.types';
import type { BacktestResult, BacktestConfig, Timeframe }                             from '../backtest/types/backtest.types';
import type { StrategyBuilderJSON }                                                    from '../builder/types/builder.types';
import type { PaginationMeta, ApiEnvelope }                                            from './api.client';

// ─── Re-export shared envelope types so callers import from one place ─────────

export type { ApiEnvelope, PaginationMeta };

// ─────────────────────────────────────────────────────────────────────────────
// STRATEGY — list
// ─────────────────────────────────────────────────────────────────────────────

export interface StrategyListParams {
  page?:      number;
  pageSize?:  number;
  /** 'all' means no filter */
  category?:  StrategyCategory | 'all';
  status?:    StrategyStatus   | 'all';
  symbol?:    string;
  exchange?:  'NSE' | 'BSE' | 'all';
  /** Free-text search on name / tags / symbol */
  q?:         string;
  sortBy?:    'createdAt' | 'updatedAt' | 'name' | 'netPremium';
  order?:     'asc' | 'desc';
}

export type StrategyListResponse     = ApiEnvelope<Strategy[]>;

// ─────────────────────────────────────────────────────────────────────────────
// STRATEGY — single item
// ─────────────────────────────────────────────────────────────────────────────

export type StrategyItemResponse     = ApiEnvelope<Strategy>;

// ─────────────────────────────────────────────────────────────────────────────
// STRATEGY — create
// ─────────────────────────────────────────────────────────────────────────────

/** The server assigns id, createdAt, updatedAt */
export type CreateStrategyRequest = Omit<
  Strategy,
  'id' | 'createdAt' | 'updatedAt'
>;

export type CreateStrategyResponse   = ApiEnvelope<Strategy>;

// ─────────────────────────────────────────────────────────────────────────────
// STRATEGY — update
// ─────────────────────────────────────────────────────────────────────────────

/** Anything except the immutable server-set fields */
export type UpdateStrategyRequest = Partial<
  Omit<Strategy, 'id' | 'createdAt' | 'updatedAt'>
>;

export type UpdateStrategyResponse   = ApiEnvelope<Strategy>;

// ─────────────────────────────────────────────────────────────────────────────
// STRATEGY — import from builder JSON
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Save or update from the visual builder's exported JSON.
 * The server converts the builder graph → Strategy domain object.
 */
export interface ImportBuilderRequest {
  builderJson: StrategyBuilderJSON;
  /** If set, overwrites an existing strategy instead of creating a new one */
  strategyId?: string;
}

export type ImportBuilderResponse    = ApiEnvelope<Strategy>;

// ─────────────────────────────────────────────────────────────────────────────
// STRATEGY — deploy
// ─────────────────────────────────────────────────────────────────────────────

export interface DeployStrategyRequest {
  /** Optional basket name override; defaults to strategy name */
  basketName?: string;
}

export interface DeployStrategyData {
  strategy:   Strategy;
  basketId:   string;
  deployedAt: string;
}

export type DeployStrategyResponse   = ApiEnvelope<DeployStrategyData>;

// ─────────────────────────────────────────────────────────────────────────────
// STRATEGY — clone
// ─────────────────────────────────────────────────────────────────────────────

export interface CloneStrategyRequest {
  name?: string;   // override the cloned strategy's name
}

export type CloneStrategyResponse    = ApiEnvelope<Strategy>;

// ─────────────────────────────────────────────────────────────────────────────
// STRATEGY — simulate (quick what-if, no full backtest)
// ─────────────────────────────────────────────────────────────────────────────

export interface SimulateRequest {
  legs:        StrategyLeg[];
  spotPrice:   number;
  daysToExpiry:number;
  ivShiftPct?: number;  // +/− shift to all IVs
}

export interface SimulateData {
  payoffPoints:    PayoffPoint[];
  estimatedPnl:    number;
  winProbability:  number;
  greeks: {
    delta: number;
    gamma: number;
    theta: number;
    vega:  number;
  };
}

export type SimulateResponse         = ApiEnvelope<SimulateData>;

// ─────────────────────────────────────────────────────────────────────────────
// BACKTEST — run
// ─────────────────────────────────────────────────────────────────────────────

export interface BacktestRunRequest {
  strategyId:       string;
  fromDate:         string;          // "YYYY-MM-DD"
  toDate:           string;
  timeframe:        Timeframe;
  initialCapital?:  number;          // default 100_000
  slippagePct?:     number;          // default 0.05
  brokeragePerLot?: number;          // default 40
}

export interface BacktestJobData {
  jobId:     string;
  status:    'queued' | 'running';
  queuedAt:  string;
  estimatedSecs?: number;
}

export type BacktestRunResponse      = ApiEnvelope<BacktestJobData>;

// ─────────────────────────────────────────────────────────────────────────────
// BACKTEST — poll / get result
// ─────────────────────────────────────────────────────────────────────────────

export type BacktestResultResponse   = ApiEnvelope<BacktestResult>;

// ─────────────────────────────────────────────────────────────────────────────
// BACKTEST — list past runs
// ─────────────────────────────────────────────────────────────────────────────

export interface BacktestListParams {
  strategyId?: string;
  status?:     BacktestResult['status'] | 'all';
  page?:       number;
  pageSize?:   number;
  sortBy?:     'runAt' | 'netPnl' | 'winRate';
  order?:      'asc' | 'desc';
}

export type BacktestListResponse     = ApiEnvelope<BacktestResult[]>;

// ─────────────────────────────────────────────────────────────────────────────
// BACKTEST — compare two runs
// ─────────────────────────────────────────────────────────────────────────────

export interface BacktestCompareRequest {
  jobIdA: string;
  jobIdB: string;
}

export interface BacktestCompareDelta {
  metric:  string;
  a:       number;
  b:       number;
  delta:   number;
  better:  'a' | 'b' | 'equal';
}

export interface BacktestCompareData {
  a:       BacktestResult;
  b:       BacktestResult;
  deltas:  BacktestCompareDelta[];
}

export type BacktestCompareResponse  = ApiEnvelope<BacktestCompareData>;

// ─────────────────────────────────────────────────────────────────────────────
// BACKTEST — export
// ─────────────────────────────────────────────────────────────────────────────

export interface BacktestExportRequest {
  format: 'csv' | 'json' | 'pdf';
}

export interface BacktestExportData {
  downloadUrl: string;
  expiresAt:   string;
}

export type BacktestExportResponse   = ApiEnvelope<BacktestExportData>;

// ─────────────────────────────────────────────────────────────────────────────
// Utility — extract TData from ApiEnvelope<TData>
// ─────────────────────────────────────────────────────────────────────────────

export type UnwrapEnvelope<T> = T extends ApiEnvelope<infer D> ? D : never;

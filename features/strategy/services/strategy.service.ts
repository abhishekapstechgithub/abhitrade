/**
 * Strategy service — maps HTTP responses to clean domain objects.
 *
 * This is the only file that should import apiClient directly.
 * Hooks and components import from this service, not from api.client.
 *
 * Public shape is kept intentionally stable:
 *   { strategies, meta }  for list
 *   { strategy }          for single-item mutations
 * so existing hooks (useStrategies, useStrategyBuilder) need no changes.
 */

import apiClient, { type PaginationMeta } from './api.client';
import type {
  StrategyListParams,
  StrategyListResponse,
  StrategyItemResponse,
  CreateStrategyRequest,
  UpdateStrategyRequest,
  ImportBuilderRequest,
  DeployStrategyRequest,
  DeployStrategyData,
  CloneStrategyRequest,
  SimulateRequest,
  SimulateData,
} from './api.types';
import type { Strategy }            from '../types/strategy.types';
import type { StrategyBuilderJSON } from '../builder/types/builder.types';

const BASE = '/api/strategies';

// ─────────────────────────────────────────────────────────────────────────────
// List
// ─────────────────────────────────────────────────────────────────────────────

export interface StrategyListResult {
  strategies: Strategy[];
  meta:        PaginationMeta;
}

async function list(params?: StrategyListParams): Promise<StrategyListResult> {
  // Strip 'all' filter values — the server treats absence as "no filter"
  const cleaned: Record<string, string | number | boolean | undefined> = {};
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== 'all' && v !== '') cleaned[k] = v as string | number;
    }
  }

  const res = await apiClient.get<StrategyListResponse>(BASE, { params: cleaned });

  return {
    strategies: res.data,
    meta: res.meta ?? { page: 1, pageSize: res.data.length, total: res.data.length, totalPages: 1 },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Single strategy
// ─────────────────────────────────────────────────────────────────────────────

async function get(id: string): Promise<{ strategy: Strategy }> {
  const res = await apiClient.get<StrategyItemResponse>(`${BASE}/${id}`);
  return { strategy: res.data };
}

// ─────────────────────────────────────────────────────────────────────────────
// Create
// ─────────────────────────────────────────────────────────────────────────────

async function create(data: CreateStrategyRequest): Promise<{ strategy: Strategy }> {
  const res = await apiClient.post<StrategyItemResponse, CreateStrategyRequest>(BASE, data);
  return { strategy: res.data };
}

// ─────────────────────────────────────────────────────────────────────────────
// Update (partial)
// ─────────────────────────────────────────────────────────────────────────────

async function update(
  id:   string,
  data: UpdateStrategyRequest,
): Promise<{ strategy: Strategy }> {
  const res = await apiClient.patch<StrategyItemResponse, UpdateStrategyRequest>(
    `${BASE}/${id}`,
    data,
  );
  return { strategy: res.data };
}

// ─────────────────────────────────────────────────────────────────────────────
// Delete
// ─────────────────────────────────────────────────────────────────────────────

async function remove(id: string): Promise<void> {
  await apiClient.delete(`${BASE}/${id}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Deploy — pushes the strategy to the broker as an order basket
// ─────────────────────────────────────────────────────────────────────────────

async function deploy(
  id:      string,
  options: DeployStrategyRequest = {},
): Promise<{ strategy: Strategy; basketId: string; deployedAt: string }> {
  const res = await apiClient.post<{ data: DeployStrategyData }>(
    `${BASE}/${id}/deploy`,
    options,
  );
  return {
    strategy:   res.data.strategy,
    basketId:   res.data.basketId,
    deployedAt: res.data.deployedAt,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Clone — server-side duplicate with a new ID
// ─────────────────────────────────────────────────────────────────────────────

async function clone(
  id:      string,
  options: CloneStrategyRequest = {},
): Promise<{ strategy: Strategy }> {
  const res = await apiClient.post<StrategyItemResponse, CloneStrategyRequest>(
    `${BASE}/${id}/clone`,
    options,
  );
  return { strategy: res.data };
}

// ─────────────────────────────────────────────────────────────────────────────
// Import from visual builder JSON
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Saves a builder-graph as a Strategy entity on the server.
 * If `strategyId` is provided the existing record is overwritten.
 */
async function importFromBuilder(
  builderJson: StrategyBuilderJSON,
  strategyId?: string,
): Promise<{ strategy: Strategy }> {
  const body: ImportBuilderRequest = { builderJson, strategyId };
  const res = await apiClient.post<StrategyItemResponse, ImportBuilderRequest>(
    `${BASE}/import`,
    body,
  );
  return { strategy: res.data };
}

// ─────────────────────────────────────────────────────────────────────────────
// Simulate — quick payoff projection without a full backtest
// ─────────────────────────────────────────────────────────────────────────────

async function simulate(
  id:   string,
  body: SimulateRequest,
): Promise<SimulateData> {
  const res = await apiClient.post<{ data: SimulateData }, SimulateRequest>(
    `${BASE}/${id}/simulate`,
    body,
  );
  return res.data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tags helper — get all unique tags across the user's strategies
// ─────────────────────────────────────────────────────────────────────────────

async function getTags(): Promise<string[]> {
  const res = await apiClient.get<{ data: string[] }>(`${BASE}/tags`);
  return res.data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public service object
// ─────────────────────────────────────────────────────────────────────────────

export const strategyService = {
  list,
  get,
  create,
  update,
  remove,
  deploy,
  clone,
  importFromBuilder,
  simulate,
  getTags,
} as const;

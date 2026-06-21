// Services
export { strategyService }  from './strategy.service';
export { backtestService }  from './backtest.service';

// HTTP client (for advanced use — prefer the service objects above)
export { default as apiClient, ApiError } from './api.client';
export type { RequestOptions, ApiEnvelope, PaginationMeta } from './api.client';

// Contract types (request bodies + response envelopes)
export type {
  // Strategy
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
  // Backtest
  BacktestRunRequest,
  BacktestJobData,
  BacktestListParams,
  BacktestCompareRequest,
  BacktestCompareData,
  BacktestExportRequest,
  BacktestExportData,
  UnwrapEnvelope,
} from './api.types';

// Domain-level result shapes returned by the services
export type { StrategyListResult }  from './strategy.service';
export type { BacktestListResult }  from './backtest.service';

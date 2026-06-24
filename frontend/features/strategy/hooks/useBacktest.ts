'use client';

/**
 * useBacktest — React hook for the async backtest lifecycle.
 *
 * Flow:
 *   1. caller calls run(config)
 *   2. hook POSTs to /api/backtests/run → receives { jobId }
 *   3. hook polls GET /api/backtests/:jobId every POLL_INTERVAL_MS
 *   4. when status === 'completed' or 'failed' polling stops
 *   5. caller reads { result, status, error }
 *
 * Usage:
 *   const bt = useBacktest();
 *   bt.run({ strategyId, fromDate, toDate, timeframe });
 *   // bt.loading, bt.status, bt.result, bt.error
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { backtestService }  from '../services/backtest.service';
import { ApiError }         from '../services/api.client';
import type { BacktestRunRequest }  from '../services/api.types';
import type { BacktestResult }      from '../backtest/types/backtest.types';

const POLL_INTERVAL_MS = 2_000;
const MAX_POLL_ATTEMPTS = 150;   // 5 minutes at 2s intervals before giving up

export type BacktestPhase =
  | 'idle'
  | 'queuing'
  | 'running'
  | 'completed'
  | 'failed';

export interface UseBacktestReturn {
  /** Start a new backtest run. Resets all previous state. */
  run:       (config: BacktestRunRequest) => Promise<void>;
  /** Cancel an in-progress poll / abort the queuing request. */
  cancel:    () => void;
  /** Current lifecycle phase */
  phase:     BacktestPhase;
  /** True while any network activity is happening (queuing or polling) */
  loading:   boolean;
  /** The job ID returned by the server after queuing */
  jobId:     string | null;
  /** Completed result — only set when phase === 'completed' */
  result:    BacktestResult | null;
  /** Human-readable error — only set when phase === 'failed' */
  error:     string | null;
  /** Field-level validation errors from a 422 response */
  fieldErrors: Record<string, string[]>;
  /** How many poll attempts have been made (useful for progress indication) */
  pollCount: number;
  /** Reset to idle state */
  reset:     () => void;
}

export function useBacktest(): UseBacktestReturn {
  const [phase,       setPhase]       = useState<BacktestPhase>('idle');
  const [jobId,       setJobId]       = useState<string | null>(null);
  const [result,      setResult]      = useState<BacktestResult | null>(null);
  const [error,       setError]       = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [pollCount,   setPollCount]   = useState(0);

  // Refs — don't trigger re-renders but survive across renders
  const abortRef    = useRef<AbortController | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const attemptsRef = useRef(0);

  // ── cleanup helper ────────────────────────────────────────────────────────
  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const abortRequest = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  // ── cancel ────────────────────────────────────────────────────────────────
  const cancel = useCallback(() => {
    stopPolling();
    abortRequest();
    setPhase('idle');
  }, [stopPolling, abortRequest]);

  // ── poll loop ─────────────────────────────────────────────────────────────
  const startPolling = useCallback((id: string) => {
    attemptsRef.current = 0;

    intervalRef.current = setInterval(async () => {
      attemptsRef.current += 1;
      setPollCount(attemptsRef.current);

      if (attemptsRef.current > MAX_POLL_ATTEMPTS) {
        stopPolling();
        setPhase('failed');
        setError('Backtest timed out. Please try again.');
        return;
      }

      try {
        const data = await backtestService.getResult(id);

        if (data.status === 'completed') {
          stopPolling();
          setResult(data);
          setPhase('completed');
        } else if (data.status === 'failed') {
          stopPolling();
          setError(data.errorMsg ?? 'Backtest engine reported a failure.');
          setPhase('failed');
        }
        // status === 'running' → keep polling
      } catch (err) {
        // Don't stop on transient network errors — the client retries internally.
        // Only stop if the job is definitively gone (404) or we get a hard failure.
        if (err instanceof ApiError && err.isNotFound) {
          stopPolling();
          setError(`Backtest job ${id} not found.`);
          setPhase('failed');
        }
      }
    }, POLL_INTERVAL_MS);
  }, [stopPolling]);

  // ── run ───────────────────────────────────────────────────────────────────
  const run = useCallback(async (config: BacktestRunRequest) => {
    // Tear down any previous run
    stopPolling();
    abortRequest();

    setPhase('queuing');
    setResult(null);
    setError(null);
    setFieldErrors({});
    setJobId(null);
    setPollCount(0);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const job = await backtestService.run(config);
      setJobId(job.jobId);
      setPhase('running');
      startPolling(job.jobId);
    } catch (err) {
      if (controller.signal.aborted) {
        // Deliberate cancellation — stay idle
        setPhase('idle');
        return;
      }

      setPhase('failed');

      if (err instanceof ApiError) {
        setError(err.message);
        if (err.details) setFieldErrors(err.details);
      } else {
        setError('Failed to queue backtest. Please try again.');
      }
    }
  }, [stopPolling, abortRequest, startPolling]);

  // ── reset ─────────────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    stopPolling();
    abortRequest();
    setPhase('idle');
    setJobId(null);
    setResult(null);
    setError(null);
    setFieldErrors({});
    setPollCount(0);
  }, [stopPolling, abortRequest]);

  // Cleanup on unmount
  useEffect(() => () => { stopPolling(); abortRequest(); }, [stopPolling, abortRequest]);

  return {
    run,
    cancel,
    phase,
    loading:   phase === 'queuing' || phase === 'running',
    jobId,
    result,
    error,
    fieldErrors,
    pollCount,
    reset,
  };
}

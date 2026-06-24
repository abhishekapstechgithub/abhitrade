/**
 * Typed HTTP client for the Strategy feature.
 *
 * Responsibilities:
 *  - Attach JWT from sessionStorage / cookie
 *  - Enforce request timeout via AbortController
 *  - Retry transient errors (5xx / network) on read-only requests
 *  - Parse the standard envelope  { data, meta, message }
 *  - Throw a typed ApiError on every failure path
 */

// ─── Error class ─────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string            = 'UNKNOWN_ERROR',
    public readonly details?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isNetwork()    { return this.statusCode === 0; }
  get isAuth()       { return this.statusCode === 401 || this.statusCode === 403; }
  get isNotFound()   { return this.statusCode === 404; }
  get isValidation() { return this.statusCode === 422 || this.details != null; }
  get isServer()     { return this.statusCode >= 500; }
}

// ─── Standard API envelope ───────────────────────────────────────────────────

export interface ApiEnvelope<T> {
  data:     T;
  meta?:    PaginationMeta;
  message?: string;
}

export interface PaginationMeta {
  page:       number;
  pageSize:   number;
  total:      number;
  totalPages: number;
}

// ─── Request options ──────────────────────────────────────────────────────────

export interface RequestOptions<TBody = unknown> {
  method?:  'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?:    TBody;
  /** Appended as ?key=value query params (undefined values are omitted) */
  params?:  Record<string, string | number | boolean | null | undefined>;
  signal?:  AbortSignal;
  /** ms before the request is aborted — default 15 000 */
  timeout?: number;
  /**
   * Number of additional attempts on network / 5xx failure.
   * Defaults to 2 for GET, 0 for mutations to avoid double-posting.
   */
  retries?: number;
  headers?: Record<string, string>;
}

// ─── Auth token accessor ──────────────────────────────────────────────────────

function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  // Prefer sessionStorage (set by the auth hook on login)
  return sessionStorage.getItem('tk_access_token')
      ?? localStorage.getItem('tk_access_token')
      ?? null;
}

// ─── Query-string builder ─────────────────────────────────────────────────────

function buildUrl(base: string, params?: RequestOptions['params']): string {
  if (!params) return base;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `${base}?${s}` : base;
}

// ─── Core fetch wrapper ───────────────────────────────────────────────────────

const DEFAULT_TIMEOUT = 15_000;
const RETRY_DELAY_MS  = 800;

async function attempt<TResponse>(
  url: string,
  init: RequestInit,
): Promise<TResponse> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err) {
    // Network-level failure (offline, DNS, CORS preflight blocked)
    throw new ApiError(
      err instanceof Error ? err.message : 'Network error',
      0,
      'NETWORK_ERROR',
    );
  }

  // No-content responses
  if (res.status === 204) return undefined as TResponse;

  let body: unknown;
  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) {
    body = await res.json().catch(() => ({}));
  } else {
    body = await res.text().catch(() => '');
  }

  if (!res.ok) {
    const envelope = body as { error?: string; message?: string; code?: string; details?: Record<string, string[]> };
    throw new ApiError(
      envelope.error ?? envelope.message ?? res.statusText,
      res.status,
      envelope.code ?? `HTTP_${res.status}`,
      envelope.details,
    );
  }

  return body as TResponse;
}

// ─── Public request function ──────────────────────────────────────────────────

export async function request<TResponse, TBody = unknown>(
  path: string,
  options: RequestOptions<TBody> = {},
): Promise<TResponse> {
  const {
    method  = 'GET',
    body,
    params,
    signal: callerSignal,
    timeout = DEFAULT_TIMEOUT,
    retries = method === 'GET' ? 2 : 0,
    headers = {},
  } = options;

  const url   = buildUrl(path, params);
  const token = getAuthToken();

  const combinedHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept':       'application/json',
    ...headers,
  };
  if (token) combinedHeaders['Authorization'] = `Bearer ${token}`;

  const init: RequestInit = {
    method,
    headers: combinedHeaders,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  };

  let lastError: ApiError = new ApiError('Unknown error', 0);

  for (let attempt_ = 0; attempt_ <= retries; attempt_++) {
    // Fresh AbortController per attempt so timeout resets on retry
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    // Merge caller's signal if provided
    const onCallerAbort = () => controller.abort();
    callerSignal?.addEventListener('abort', onCallerAbort);

    try {
      const result = await attempt<TResponse>(url, {
        ...init,
        signal: controller.signal,
      });
      return result;
    } catch (err) {
      lastError = err instanceof ApiError ? err : new ApiError(String(err), 0);

      // Never retry mutations, auth failures, 4xx client errors, or deliberate cancellations
      const isAborted    = controller.signal.aborted && !callerSignal?.aborted;
      const shouldRetry  = attempt_ < retries
                        && (lastError.isNetwork || lastError.isServer)
                        && !lastError.isAuth
                        && method === 'GET'
                        && !isAborted;

      if (!shouldRetry) throw lastError;

      // Exponential back-off: 800ms, 1600ms, …
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS * 2 ** attempt_));
    } finally {
      clearTimeout(timer);
      callerSignal?.removeEventListener('abort', onCallerAbort);
    }
  }

  throw lastError;
}

// ─── Convenience methods ──────────────────────────────────────────────────────

const apiClient = {
  get<TResponse>(path: string, opts?: Omit<RequestOptions, 'method' | 'body'>) {
    return request<TResponse>(path, { ...opts, method: 'GET' });
  },
  post<TResponse, TBody = unknown>(path: string, body?: TBody, opts?: Omit<RequestOptions<TBody>, 'method' | 'body'>) {
    return request<TResponse, TBody>(path, { ...opts, method: 'POST', body });
  },
  patch<TResponse, TBody = unknown>(path: string, body?: TBody, opts?: Omit<RequestOptions<TBody>, 'method' | 'body'>) {
    return request<TResponse, TBody>(path, { ...opts, method: 'PATCH', body });
  },
  put<TResponse, TBody = unknown>(path: string, body?: TBody, opts?: Omit<RequestOptions<TBody>, 'method' | 'body'>) {
    return request<TResponse, TBody>(path, { ...opts, method: 'PUT', body });
  },
  delete<TResponse = void>(path: string, opts?: Omit<RequestOptions, 'method' | 'body'>) {
    return request<TResponse>(path, { ...opts, method: 'DELETE' });
  },
};

export default apiClient;

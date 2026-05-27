/**
 * Production HTTP client for Digital Crew Max API calls.
 *
 * Features:
 * - Per-request timeout via AbortSignal
 * - Exponential backoff with jitter on transient failures
 * - Method-aware retry policy (only safe methods retry on 502)
 * - Retry-After header parsing on 429
 * - Bounded concurrency to prevent flooding upstream
 * - Structured logging with per-request IDs
 */

type RetryConfig = {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  timeoutMs?: number;
};

const DEFAULTS = {
  maxRetries: 3,
  baseDelayMs: 500,
  maxDelayMs: 8000,
  timeoutMs: 30_000,
  maxConcurrent: 8,
};

const SAFE_METHODS = new Set(["GET", "HEAD", "DELETE", "PATCH"]);
const ALWAYS_RETRY_STATUSES = new Set([429, 503, 504]);
const SAFE_METHOD_RETRY_STATUSES = new Set([502]);

let inFlight = 0;
const waiters: Array<() => void> = [];

async function acquireSlot(): Promise<void> {
  if (inFlight < DEFAULTS.maxConcurrent) {
    inFlight++;
    return;
  }
  await new Promise<void>((resolve) => waiters.push(resolve));
  inFlight++;
}

function releaseSlot(): void {
  inFlight--;
  const next = waiters.shift();
  if (next) next();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitteredBackoff(attempt: number, base: number, max: number): number {
  const exp = Math.min(max, base * 2 ** attempt);
  return Math.floor(exp / 2 + Math.random() * (exp / 2));
}

function parseRetryAfter(value: string | null, maxMs: number): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, maxMs);
  }
  const date = Date.parse(value);
  if (Number.isFinite(date)) {
    return Math.max(0, Math.min(date - Date.now(), maxMs));
  }
  return null;
}

function shortId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function shouldRetryStatus(status: number, method: string): boolean {
  if (ALWAYS_RETRY_STATUSES.has(status)) return true;
  if (SAFE_METHODS.has(method) && SAFE_METHOD_RETRY_STATUSES.has(status)) return true;
  return false;
}

function isAbortError(e: unknown): boolean {
  return e instanceof Error && (e.name === "AbortError" || e.name === "TimeoutError");
}

export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  config: RetryConfig = {},
): Promise<Response> {
  const maxRetries = config.maxRetries ?? DEFAULTS.maxRetries;
  const baseDelayMs = config.baseDelayMs ?? DEFAULTS.baseDelayMs;
  const maxDelayMs = config.maxDelayMs ?? DEFAULTS.maxDelayMs;
  const timeoutMs = config.timeoutMs ?? DEFAULTS.timeoutMs;
  const method = (init.method ?? "GET").toUpperCase();
  const reqId = shortId();

  await acquireSlot();
  try {
    let lastErr: unknown = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const started = Date.now();
      try {
        const res = await fetch(url, { ...init, signal: controller.signal });
        clearTimeout(timer);

        if (res.ok) {
          if (attempt > 0) {
            console.log(`[mcp:${reqId}] ${method} ${url} → ${res.status} (recovered after ${attempt} retr${attempt === 1 ? "y" : "ies"})`);
          }
          return res;
        }

        if (attempt < maxRetries && shouldRetryStatus(res.status, method)) {
          const retryAfter = parseRetryAfter(res.headers.get("retry-after"), maxDelayMs);
          const delay = retryAfter ?? jitteredBackoff(attempt, baseDelayMs, maxDelayMs);
          console.warn(`[mcp:${reqId}] ${method} ${url} → ${res.status}, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
          await sleep(delay);
          continue;
        }

        return res;
      } catch (e) {
        clearTimeout(timer);
        lastErr = e;
        const elapsed = Date.now() - started;
        const isTimeout = isAbortError(e);
        const reason = isTimeout ? `timeout after ${elapsed}ms` : (e instanceof Error ? e.message : String(e));

        if (attempt < maxRetries) {
          const delay = jitteredBackoff(attempt, baseDelayMs, maxDelayMs);
          console.warn(`[mcp:${reqId}] ${method} ${url} failed (${reason}), retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
          await sleep(delay);
          continue;
        }
        throw new Error(`${method} ${url} failed after ${maxRetries + 1} attempts: ${reason}`);
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  } finally {
    releaseSlot();
  }
}

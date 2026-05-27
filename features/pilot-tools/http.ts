/**
 * Production HTTP client for Digital Crew Max API calls.
 *
 * Features:
 * - Per-request timeout via AbortSignal
 * - Exponential backoff with jitter on transient failures
 * - Method-aware retry policy (only safe methods retry on 502)
 * - Retry-After header parsing on 429
 * - Bounded concurrency to prevent flooding upstream
 * - Per-host circuit breaker to fail fast when upstream is dead
 * - Dead-letter logging for permanently-failed writes
 * - Structured logging with per-request IDs
 */

import { beforeRequest, recordFailure, recordSuccess, CircuitOpenError } from "./circuit-breaker";
import { buildEntry, isWriteMethod, recordDeadLetter } from "./dead-letter";
import { withSpan } from "./tracing";

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
  const method = (init.method ?? "GET").toUpperCase();
  return withSpan("max.api.fetch", { "http.method": method, "http.url": url }, () =>
    fetchWithRetryInner(url, init, config, method));
}

async function fetchWithRetryInner(
  url: string,
  init: RequestInit,
  config: RetryConfig,
  method: string,
): Promise<Response> {
  const maxRetries = config.maxRetries ?? DEFAULTS.maxRetries;
  const baseDelayMs = config.baseDelayMs ?? DEFAULTS.baseDelayMs;
  const maxDelayMs = config.maxDelayMs ?? DEFAULTS.maxDelayMs;
  const timeoutMs = config.timeoutMs ?? DEFAULTS.timeoutMs;
  const reqId = shortId();

  // Fail fast if the breaker is open for this host
  let breakerToken: { host: string; probing: boolean };
  try {
    breakerToken = beforeRequest(url);
  } catch (e) {
    if (e instanceof CircuitOpenError) {
      console.warn(`[mcp:${reqId}] ${method} ${url} blocked by open circuit`);
    }
    throw e;
  }

  await acquireSlot();
  try {
    let lastErr: unknown = null;
    let lastStatus: number | null = null;
    let lastReason = "unknown";
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const started = Date.now();
      try {
        const res = await fetch(url, { ...init, signal: controller.signal });
        clearTimeout(timer);

        if (res.ok) {
          recordSuccess(breakerToken.host, breakerToken.probing);
          if (attempt > 0) {
            console.log(`[mcp:${reqId}] ${method} ${url} → ${res.status} (recovered after ${attempt} retr${attempt === 1 ? "y" : "ies"})`);
          }
          return res;
        }

        lastStatus = res.status;
        lastReason = `HTTP ${res.status}`;

        if (attempt < maxRetries && shouldRetryStatus(res.status, method)) {
          const retryAfter = parseRetryAfter(res.headers.get("retry-after"), maxDelayMs);
          const delay = retryAfter ?? jitteredBackoff(attempt, baseDelayMs, maxDelayMs);
          console.warn(`[mcp:${reqId}] ${method} ${url} → ${res.status}, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
          await sleep(delay);
          continue;
        }

        // 4xx counts as a caller error, not an upstream-health signal —
        // don't trip the breaker on those. Only count 5xx + retries-exhausted.
        if (res.status >= 500) {
          recordFailure(breakerToken.host, breakerToken.probing);
          if (isWriteMethod(method)) {
            void recordDeadLetter(buildEntry({
              method, url, status: res.status, reason: lastReason,
              body: init.body, attempts: attempt + 1,
            }));
          }
        } else {
          // Caller error — breaker stays closed, but probe still resolves
          recordSuccess(breakerToken.host, breakerToken.probing);
        }
        return res;
      } catch (e) {
        clearTimeout(timer);
        lastErr = e;
        const elapsed = Date.now() - started;
        const isTimeout = isAbortError(e);
        lastReason = isTimeout ? `timeout after ${elapsed}ms` : (e instanceof Error ? e.message : String(e));

        if (attempt < maxRetries) {
          const delay = jitteredBackoff(attempt, baseDelayMs, maxDelayMs);
          console.warn(`[mcp:${reqId}] ${method} ${url} failed (${lastReason}), retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
          await sleep(delay);
          continue;
        }

        recordFailure(breakerToken.host, breakerToken.probing);
        if (isWriteMethod(method)) {
          void recordDeadLetter(buildEntry({
            method, url, status: null, reason: lastReason,
            body: init.body, attempts: attempt + 1,
          }));
        }
        throw new Error(`${method} ${url} failed after ${maxRetries + 1} attempts: ${lastReason}`);
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  } finally {
    releaseSlot();
  }
}

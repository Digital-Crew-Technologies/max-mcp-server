/**
 * Per-host circuit breaker.
 *
 * States:
 *   closed     — normal operation; failures are counted in a sliding window
 *   open       — too many failures recently; fail fast without calling
 *   half-open  — cooldown elapsed; allow exactly one probe to test recovery
 *
 * A failure here means a request that the retry layer already gave up on
 * (network error or non-recoverable 5xx). 4xx is intentionally NOT a
 * failure — those are caller errors, not upstream-health signals.
 */

type State = "closed" | "open" | "half-open";

type HostState = {
  state: State;
  failures: number[]; // unix-ms timestamps within the window
  openedAt: number;
  halfOpenInFlight: boolean;
};

const DEFAULTS = {
  failureThreshold: 5,
  windowMs: 60_000,
  cooldownMs: 30_000,
};

const hosts = new Map<string, HostState>();

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function getState(host: string): HostState {
  let s = hosts.get(host);
  if (!s) {
    s = { state: "closed", failures: [], openedAt: 0, halfOpenInFlight: false };
    hosts.set(host, s);
  }
  return s;
}

export class CircuitOpenError extends Error {
  constructor(host: string, retryInSeconds: number) {
    super(`Circuit breaker is open for ${host}; upstream is failing. Try again in ~${retryInSeconds}s.`);
    this.name = "CircuitOpenError";
  }
}

/**
 * Throw CircuitOpenError if the breaker is open and we shouldn't make a
 * request. Returns a token that must be passed back to recordSuccess /
 * recordFailure so the breaker can transition out of half-open correctly.
 */
export function beforeRequest(url: string): { host: string; probing: boolean } {
  const host = hostOf(url);
  const s = getState(host);
  const now = Date.now();

  if (s.state === "open") {
    if (now - s.openedAt >= DEFAULTS.cooldownMs) {
      // Move to half-open and let exactly one request through as a probe
      if (!s.halfOpenInFlight) {
        s.state = "half-open";
        s.halfOpenInFlight = true;
        return { host, probing: true };
      }
      const retryIn = Math.ceil((DEFAULTS.cooldownMs - (now - s.openedAt)) / 1000);
      throw new CircuitOpenError(host, Math.max(retryIn, 1));
    }
    const retryIn = Math.ceil((DEFAULTS.cooldownMs - (now - s.openedAt)) / 1000);
    throw new CircuitOpenError(host, retryIn);
  }

  if (s.state === "half-open") {
    if (s.halfOpenInFlight) {
      throw new CircuitOpenError(host, 1);
    }
    s.halfOpenInFlight = true;
    return { host, probing: true };
  }

  return { host, probing: false };
}

export function recordSuccess(host: string, probing: boolean): void {
  const s = getState(host);
  s.failures = [];
  if (probing || s.state === "half-open") {
    s.state = "closed";
    s.halfOpenInFlight = false;
    console.log(`[circuit] ${host} closed (probe succeeded)`);
  }
}

export function recordFailure(host: string, probing: boolean): void {
  const s = getState(host);
  const now = Date.now();

  if (probing || s.state === "half-open") {
    s.state = "open";
    s.openedAt = now;
    s.halfOpenInFlight = false;
    console.warn(`[circuit] ${host} re-opened (probe failed)`);
    return;
  }

  s.failures.push(now);
  s.failures = s.failures.filter((t) => now - t < DEFAULTS.windowMs);

  if (s.failures.length >= DEFAULTS.failureThreshold) {
    s.state = "open";
    s.openedAt = now;
    console.warn(`[circuit] ${host} opened after ${s.failures.length} failures in ${DEFAULTS.windowMs / 1000}s`);
  }
}

/** Inspect breaker state — useful for diagnostics. */
export function breakerStatus(): Record<string, { state: State; failures: number; openedAt: number }> {
  const out: Record<string, { state: State; failures: number; openedAt: number }> = {};
  for (const [host, s] of hosts.entries()) {
    out[host] = { state: s.state, failures: s.failures.length, openedAt: s.openedAt };
  }
  return out;
}

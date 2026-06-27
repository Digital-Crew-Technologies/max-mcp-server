import { describe, it, expect, vi, afterEach } from "vitest";
import {
  beforeRequest,
  recordFailure,
  recordSuccess,
  CircuitOpenError,
} from "@/features/pilot-tools/circuit-breaker";

// The breaker keeps per-host state in a module-level Map, so each test uses a
// UNIQUE host to avoid state leaking between tests.
let hostCounter = 0;
function freshUrl(): string {
  hostCounter += 1;
  return `https://breaker-test-${hostCounter}.example/api`;
}

function failNtimes(url: string, n: number): void {
  for (let i = 0; i < n; i++) {
    const t = beforeRequest(url);
    recordFailure(t.host, t.probing);
  }
}

afterEach(() => {
  vi.useRealTimers();
});

describe("circuit breaker state machine", () => {
  it("stays closed below the failure threshold (5)", () => {
    const url = freshUrl();
    failNtimes(url, 4); // 4 < 5
    expect(() => beforeRequest(url)).not.toThrow();
  });

  it("opens after 5 failures and then fast-fails", () => {
    const url = freshUrl();
    failNtimes(url, 5);
    expect(() => beforeRequest(url)).toThrow(CircuitOpenError);
  });

  it("half-opens after the cooldown, then closes on a successful probe", () => {
    vi.useFakeTimers();
    const url = freshUrl();
    failNtimes(url, 5);
    expect(() => beforeRequest(url)).toThrow(CircuitOpenError);

    vi.advanceTimersByTime(30_000); // cooldown (30s) elapses
    const probe = beforeRequest(url);
    expect(probe.probing).toBe(true); // exactly one probe is allowed through

    recordSuccess(probe.host, probe.probing);
    expect(beforeRequest(url).probing).toBe(false); // breaker is closed again
  });

  it("re-opens immediately if the half-open probe fails", () => {
    vi.useFakeTimers();
    const url = freshUrl();
    failNtimes(url, 5);

    vi.advanceTimersByTime(30_000);
    const probe = beforeRequest(url);
    expect(probe.probing).toBe(true);

    recordFailure(probe.host, probe.probing); // probe fails → straight back to open
    expect(() => beforeRequest(url)).toThrow(CircuitOpenError);
  });
});

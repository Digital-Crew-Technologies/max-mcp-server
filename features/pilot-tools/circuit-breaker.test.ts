import { describe, it, expect, vi, afterEach } from "vitest";
import {
  beforeRequest,
  recordFailure,
  recordSuccess,
  CircuitOpenError,
} from "@/features/pilot-tools/circuit-breaker";

let hostCounter = 0;
function freshUrl(): string {
  hostCounter += 1;
  return `https://breaker-test-${hostCounter}.example/api`;
}

async function failNtimes(url: string, n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    const t = await beforeRequest(url);
    await recordFailure(t.host, t.probing);
  }
}

afterEach(() => {
  vi.useRealTimers();
});

describe("circuit breaker state machine", () => {
  it("stays closed below the failure threshold (5)", async () => {
    const url = freshUrl();
    await failNtimes(url, 4);
    await expect(beforeRequest(url)).resolves.toBeDefined();
  });

  it("opens after 5 failures and then fast-fails", async () => {
    const url = freshUrl();
    await failNtimes(url, 5);
    await expect(beforeRequest(url)).rejects.toThrow(CircuitOpenError);
  });

  it("half-opens after the cooldown, then closes on a successful probe", async () => {
    vi.useFakeTimers();
    const url = freshUrl();
    await failNtimes(url, 5);
    await expect(beforeRequest(url)).rejects.toThrow(CircuitOpenError);

    vi.advanceTimersByTime(30_000);
    const probe = await beforeRequest(url);
    expect(probe.probing).toBe(true);

    await recordSuccess(probe.host, probe.probing);
    const next = await beforeRequest(url);
    expect(next.probing).toBe(false);
  });

  it("re-opens immediately if the half-open probe fails", async () => {
    vi.useFakeTimers();
    const url = freshUrl();
    await failNtimes(url, 5);

    vi.advanceTimersByTime(30_000);
    const probe = await beforeRequest(url);
    expect(probe.probing).toBe(true);

    await recordFailure(probe.host, probe.probing);
    await expect(beforeRequest(url)).rejects.toThrow(CircuitOpenError);
  });
});

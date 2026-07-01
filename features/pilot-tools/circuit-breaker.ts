/**
 * Per-host circuit breaker facade.
 * State lives in breaker-store (in-memory or Redis when REDIS_URL is set).
 */

import { CircuitOpenError } from "./circuit-breaker-errors";
import { breakerStore, type BreakerState } from "./breaker-store";

export { CircuitOpenError };

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export async function beforeRequest(url: string): Promise<{ host: string; probing: boolean }> {
  return breakerStore.beforeRequest(hostOf(url));
}

export async function recordSuccess(host: string, probing: boolean): Promise<void> {
  await breakerStore.recordSuccess(host, probing);
}

export async function recordFailure(host: string, probing: boolean): Promise<void> {
  await breakerStore.recordFailure(host, probing);
}

export async function breakerStatus(): Promise<
  Record<string, { state: BreakerState; failures: number; openedAt: number }>
> {
  return breakerStore.status();
}

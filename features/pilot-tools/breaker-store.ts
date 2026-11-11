/**
 * Pluggable circuit-breaker state — in-memory (default) or Redis (multi-instance).
 */

import { randomUUID } from "node:crypto";
import { createFailFastRedis } from "@/shared/redis/fail-fast";
import { CircuitOpenError } from "./circuit-breaker-errors";

export type BreakerState = "closed" | "open" | "half-open";

export type BreakerStatusEntry = {
  state: BreakerState;
  failures: number;
  openedAt: number;
};

export type BreakerToken = { host: string; probing: boolean };

const DEFAULTS = {
  failureThreshold: 5,
  windowMs: 60_000,
  cooldownMs: 30_000,
};

export interface BreakerStore {
  beforeRequest(host: string): Promise<BreakerToken>;
  recordSuccess(host: string, probing: boolean): Promise<void>;
  recordFailure(host: string, probing: boolean): Promise<void>;
  status(): Promise<Record<string, BreakerStatusEntry>>;
}

// ── In-memory (single instance) ─────────────────────────────────────────────

type HostState = {
  state: BreakerState;
  failures: number[];
  openedAt: number;
  halfOpenInFlight: boolean;
};

class InMemoryBreakerStore implements BreakerStore {
  private readonly hosts = new Map<string, HostState>();

  private getState(host: string): HostState {
    let s = this.hosts.get(host);
    if (!s) {
      s = { state: "closed", failures: [], openedAt: 0, halfOpenInFlight: false };
      this.hosts.set(host, s);
    }
    return s;
  }

  async beforeRequest(host: string): Promise<BreakerToken> {
    const s = this.getState(host);
    const now = Date.now();

    if (s.state === "open") {
      if (now - s.openedAt >= DEFAULTS.cooldownMs) {
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
      if (s.halfOpenInFlight) throw new CircuitOpenError(host, 1);
      s.halfOpenInFlight = true;
      return { host, probing: true };
    }

    return { host, probing: false };
  }

  async recordSuccess(host: string, probing: boolean): Promise<void> {
    const s = this.getState(host);
    s.failures = [];
    if (probing || s.state === "half-open") {
      s.state = "closed";
      s.halfOpenInFlight = false;
      console.log(`[circuit] ${host} closed (probe succeeded)`);
    }
  }

  async recordFailure(host: string, probing: boolean): Promise<void> {
    const s = this.getState(host);
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
      console.warn(`[circuit] ${host} opened after ${s.failures.length} failures`);
    }
  }

  async status(): Promise<Record<string, BreakerStatusEntry>> {
    const out: Record<string, BreakerStatusEntry> = {};
    for (const [host, s] of this.hosts.entries()) {
      out[host] = { state: s.state, failures: s.failures.length, openedAt: s.openedAt };
    }
    return out;
  }
}

// ── Redis (shared across instances) ─────────────────────────────────────────
//
// Every Redis call goes through a fail-fast connection (shared/redis): an
// unreachable or slow Redis falls back to the in-memory store instead of
// holding the request (ADR-004).

const redis = createFailFastRedis("circuit");

function redisKey(host: string): string {
  return `max-mcp:breaker:${host}`;
}

type Admission = { probing: boolean } | { openRetryIn: number };

class RedisBreakerStore implements BreakerStore {
  private readonly fallback = new InMemoryBreakerStore();

  async beforeRequest(host: string): Promise<BreakerToken> {
    const admission = await redis.run<Admission | null>(async (r) => {
      const key = redisKey(host);
      const now = Date.now();
      const raw = await r.hGetAll(key);
      const state = (raw.state as BreakerState) || "closed";
      const openedAt = Number(raw.openedAt || 0);
      const halfOpenInFlight = raw.halfOpenInFlight === "1";

      if (state === "open") {
        if (now - openedAt >= DEFAULTS.cooldownMs) {
          const won = await r.set(`${key}:probe`, "1", { NX: true, PX: DEFAULTS.cooldownMs });
          if (won) {
            await r.hSet(key, { state: "half-open", halfOpenInFlight: "1" });
            return { probing: true };
          }
          return { openRetryIn: 1 };
        }
        return { openRetryIn: Math.ceil((DEFAULTS.cooldownMs - (now - openedAt)) / 1000) };
      }

      if (state === "half-open") {
        if (halfOpenInFlight) return { openRetryIn: 1 };
        await r.hSet(key, { halfOpenInFlight: "1" });
        return { probing: true };
      }

      return { probing: false };
    }, () => null);

    if (admission === null) return this.fallback.beforeRequest(host);
    if ("openRetryIn" in admission) throw new CircuitOpenError(host, admission.openRetryIn);
    return { host, probing: admission.probing };
  }

  async recordSuccess(host: string, probing: boolean): Promise<void> {
    await redis.run(async (r) => {
      const key = redisKey(host);
      await r.del(`${key}:failures`);
      // Same rule as the in-memory store: only the probe (or a half-open
      // breaker) closes it. A request admitted before the breaker opened, and
      // finishing late, must not close an open breaker.
      const state = (await r.hGet(key, "state")) as BreakerState | null;
      if (probing || state === "half-open") {
        await r.hSet(key, { state: "closed", halfOpenInFlight: "0", openedAt: "0" });
        console.log(`[circuit] ${host} closed (probe succeeded)`);
      }
    }, () => this.fallback.recordSuccess(host, probing));
  }

  async recordFailure(host: string, probing: boolean): Promise<void> {
    await redis.run(async (r) => {
      const key = redisKey(host);
      const now = Date.now();
      const state = (await r.hGet(key, "state")) as BreakerState | null;

      if (probing || state === "half-open") {
        await r.hSet(key, { state: "open", openedAt: String(now), halfOpenInFlight: "0" });
        console.warn(`[circuit] ${host} re-opened (probe failed)`);
        return;
      }

      const failKey = `${key}:failures`;
      // Unique members: two failures in the same millisecond are two failures.
      await r.zAdd(failKey, { score: now, value: `${now}:${randomUUID()}` });
      await r.zRemRangeByScore(failKey, 0, now - DEFAULTS.windowMs);
      await r.pExpire(failKey, DEFAULTS.windowMs);
      const count = await r.zCard(failKey);

      if (count >= DEFAULTS.failureThreshold) {
        await r.hSet(key, { state: "open", openedAt: String(now), halfOpenInFlight: "0" });
        console.warn(`[circuit] ${host} opened after ${count} failures`);
      }
    }, () => this.fallback.recordFailure(host, probing));
  }

  async status(): Promise<Record<string, BreakerStatusEntry>> {
    return redis.run(async (r) => {
      const out: Record<string, BreakerStatusEntry> = {};
      const keys = await r.keys("max-mcp:breaker:*");
      for (const key of keys) {
        if (key.endsWith(":failures") || key.endsWith(":probe")) continue;
        const host = key.replace("max-mcp:breaker:", "");
        const raw = await r.hGetAll(key);
        const failures = await r.zCard(`${key}:failures`);
        out[host] = {
          state: (raw.state as BreakerState) || "closed",
          failures,
          openedAt: Number(raw.openedAt || 0),
        };
      }
      return out;
    }, () => this.fallback.status());
  }
}

const memoryStore = new InMemoryBreakerStore();
const redisStore = new RedisBreakerStore();

export const breakerStore: BreakerStore =
  process.env.REDIS_URL ? redisStore : memoryStore;

/**
 * Pluggable circuit-breaker state — in-memory (default) or Redis (multi-instance).
 */

import { createClient, type RedisClientType } from "redis";
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

let redis: RedisClientType | null = null;
let redisReady = false;
let redisInitPromise: Promise<void> | null = null;

async function ensureRedis(): Promise<RedisClientType | null> {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  if (redisReady && redis) return redis;
  if (redisInitPromise) {
    await redisInitPromise;
    return redisReady ? redis : null;
  }

  redisInitPromise = (async () => {
    try {
      const client: RedisClientType = createClient({ url });
      client.on("error", (err) => {
        console.warn(`[circuit] redis error: ${err.message}`);
      });
      await client.connect();
      redis = client;
      redisReady = true;
      console.log("[circuit] connected to Redis for breaker state");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[circuit] redis unavailable, using in-memory fallback: ${msg}`);
      redisReady = false;
    }
  })();
  await redisInitPromise;
  redisInitPromise = null;
  return redisReady ? redis : null;
}

function redisKey(host: string): string {
  return `max-mcp:breaker:${host}`;
}

class RedisBreakerStore implements BreakerStore {
  private readonly fallback = new InMemoryBreakerStore();

  private async client(): Promise<RedisClientType | null> {
    return ensureRedis();
  }

  async beforeRequest(host: string): Promise<BreakerToken> {
    const r = await this.client();
    if (!r) return this.fallback.beforeRequest(host);

    const key = redisKey(host);
    const now = Date.now();
    const raw = await r.hGetAll(key);
    const state = (raw.state as BreakerState) || "closed";
    const openedAt = Number(raw.openedAt || 0);
    const halfOpenInFlight = raw.halfOpenInFlight === "1";

    if (state === "open") {
      if (now - openedAt >= DEFAULTS.cooldownMs) {
        const probeKey = `${key}:probe`;
        const won = await r.set(probeKey, "1", { NX: true, PX: DEFAULTS.cooldownMs });
        if (won) {
          await r.hSet(key, { state: "half-open", halfOpenInFlight: "1" });
          return { host, probing: true };
        }
        throw new CircuitOpenError(host, 1);
      }
      const retryIn = Math.ceil((DEFAULTS.cooldownMs - (now - openedAt)) / 1000);
      throw new CircuitOpenError(host, retryIn);
    }

    if (state === "half-open") {
      if (halfOpenInFlight) throw new CircuitOpenError(host, 1);
      await r.hSet(key, { halfOpenInFlight: "1" });
      return { host, probing: true };
    }

    return { host, probing: false };
  }

  async recordSuccess(host: string, probing: boolean): Promise<void> {
    const r = await this.client();
    if (!r) return this.fallback.recordSuccess(host, probing);

    const key = redisKey(host);
    await r.hSet(key, { state: "closed", failures: "0", halfOpenInFlight: "0", openedAt: "0" });
    await r.del(`${key}:failures`);
    if (probing) console.log(`[circuit] ${host} closed (probe succeeded)`);
  }

  async recordFailure(host: string, probing: boolean): Promise<void> {
    const r = await this.client();
    if (!r) return this.fallback.recordFailure(host, probing);

    const key = redisKey(host);
    const now = Date.now();

    if (probing) {
      await r.hSet(key, { state: "open", openedAt: String(now), halfOpenInFlight: "0" });
      console.warn(`[circuit] ${host} re-opened (probe failed)`);
      return;
    }

    const failKey = `${key}:failures`;
    await r.zAdd(failKey, { score: now, value: String(now) });
    await r.zRemRangeByScore(failKey, 0, now - DEFAULTS.windowMs);
    const count = await r.zCard(failKey);

    if (count >= DEFAULTS.failureThreshold) {
      await r.hSet(key, { state: "open", openedAt: String(now), halfOpenInFlight: "0" });
      console.warn(`[circuit] ${host} opened after ${count} failures`);
    }
  }

  async status(): Promise<Record<string, BreakerStatusEntry>> {
    const r = await this.client();
    if (!r) return this.fallback.status();

    const out: Record<string, BreakerStatusEntry> = {};
    const keys = await r.keys("max-mcp:breaker:*");
    for (const key of keys) {
      if (key.endsWith(":failures") || key.endsWith(":probe")) continue;
      const host = key.replace("max-mcp:breaker:", "");
      const raw = await r.hGetAll(key);
      const failKey = `${key}:failures`;
      const failures = await r.zCard(failKey);
      out[host] = {
        state: (raw.state as BreakerState) || "closed",
        failures,
        openedAt: Number(raw.openedAt || 0),
      };
    }
    return out;
  }
}

const memoryStore = new InMemoryBreakerStore();
const redisStore = new RedisBreakerStore();

export const breakerStore: BreakerStore =
  process.env.REDIS_URL ? redisStore : memoryStore;

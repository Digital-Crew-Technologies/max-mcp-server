// A Redis connection that can never hold a request hostage.
//
// node-redis 4 defaults retry a lost connection forever and queue commands
// while disconnected, so a plain `await client.connect()` or `hGetAll()` never
// settles when Redis is unreachable — and every tool call or /chat request
// that awaited the breaker or the rate limiter hung with it. ADR-004 and
// ADR-005 promise the opposite: Redis failures fall back to in-memory, and the
// route never blocks on Redis.
//
// This helper keeps that promise:
//   • connect gives up after a short timeout and two reconnect attempts;
//   • the offline queue is disabled, so a command fails at once when the
//     connection is down instead of waiting for it to come back;
//   • every operation is raced against a timeout and falls back on any error;
//   • after a failure Redis is left alone for a cooldown before reconnecting.

import { createClient, type RedisClientType } from "redis";

export const REDIS_CONNECT_TIMEOUT_MS = 1_500;
export const REDIS_OP_TIMEOUT_MS = 750;
export const REDIS_RETRY_AFTER_MS = 30_000;

export class RedisTimeoutError extends Error {
  constructor(what: string, ms: number) {
    super(`redis ${what} timed out after ${ms}ms`);
    this.name = "RedisTimeoutError";
  }
}

export function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new RedisTimeoutError(what, ms)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export type FailFastRedis = {
  /** A ready client, or null while Redis is unset, unreachable or cooling down. */
  client(): Promise<RedisClientType | null>;
  /** Run `op` on Redis; on no client, a timeout or any Redis error, run `fallback`. */
  run<T>(op: (r: RedisClientType) => Promise<T>, fallback: () => T | Promise<T>): Promise<T>;
};

export function createFailFastRedis(label: string): FailFastRedis {
  let current: RedisClientType | null = null;
  let connecting: Promise<RedisClientType | null> | null = null;
  let downUntil = 0;

  function markDown(reason: string): void {
    downUntil = Date.now() + REDIS_RETRY_AFTER_MS;
    const stale = current;
    current = null;
    if (stale) void stale.disconnect().catch(() => {});
    console.warn(`[${label}] redis unavailable, using in-memory fallback: ${reason}`);
  }

  async function connect(url: string): Promise<RedisClientType | null> {
    const c = createClient({
      url,
      disableOfflineQueue: true,
      socket: {
        connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
        // Give up after two reconnect attempts; the cooldown decides when to
        // try again, so a dead Redis is not hammered on every request.
        reconnectStrategy: (retries: number) =>
          retries >= 2 ? new Error("redis unreachable") : 200,
      },
    }) as RedisClientType;
    c.on("error", (err: Error) => {
      console.warn(`[${label}] redis error: ${err.message}`);
    });
    try {
      await withTimeout(c.connect(), REDIS_CONNECT_TIMEOUT_MS * 2, "connect");
      console.log(`[${label}] connected to Redis`);
      return c;
    } catch (e) {
      void c.disconnect().catch(() => {});
      markDown(e instanceof Error ? e.message : String(e));
      return null;
    }
  }

  async function client(): Promise<RedisClientType | null> {
    const url = process.env.REDIS_URL;
    if (!url) return null;
    if (current?.isReady) return current;
    if (Date.now() < downUntil) return null;
    if (!connecting) {
      connecting = connect(url).then((c) => {
        current = c;
        connecting = null;
        return c;
      });
    }
    return connecting;
  }

  async function run<T>(
    op: (r: RedisClientType) => Promise<T>,
    fallback: () => T | Promise<T>,
  ): Promise<T> {
    const r = await client();
    if (!r) return fallback();
    try {
      return await withTimeout(op(r), REDIS_OP_TIMEOUT_MS, "command");
    } catch (e) {
      markDown(e instanceof Error ? e.message : String(e));
      return fallback();
    }
  }

  return { client, run };
}

/**
 * Dead-letter queue for permanently-failed write requests.
 *
 * When a write (POST/PATCH/DELETE) exhausts all retries, push the request
 * envelope here so it can be inspected and manually replayed later. Uses
 * Redis when REDIS_URL is set; falls back to a bounded in-memory ring
 * buffer otherwise so the API stays the same in dev.
 */

import { createClient, type RedisClientType } from "redis";

const REDIS_KEY = "max-mcp:dead-letter";
const MAX_ENTRIES = 500;

export type DeadLetterEntry = {
  id: string;
  timestamp: string;
  method: string;
  url: string;
  status: number | null;
  reason: string;
  bodyPreview: string | null;
  attempts: number;
};

let redis: RedisClientType | null = null;
let redisReady = false;
let redisInitPromise: Promise<void> | null = null;
const memoryRing: DeadLetterEntry[] = [];

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
        console.warn(`[dead-letter] redis error: ${err.message}`);
      });
      await client.connect();
      redis = client;
      redisReady = true;
      console.log("[dead-letter] connected to Redis");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[dead-letter] redis unavailable, using in-memory fallback: ${msg}`);
      redisReady = false;
    }
  })();
  await redisInitPromise;
  redisInitPromise = null;
  return redisReady ? redis : null;
}

export async function recordDeadLetter(entry: DeadLetterEntry): Promise<void> {
  const json = JSON.stringify(entry);
  const client = await ensureRedis();
  if (client) {
    try {
      await client.lPush(REDIS_KEY, json);
      await client.lTrim(REDIS_KEY, 0, MAX_ENTRIES - 1);
      return;
    } catch (e) {
      console.warn(`[dead-letter] redis push failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  memoryRing.unshift(entry);
  if (memoryRing.length > MAX_ENTRIES) memoryRing.length = MAX_ENTRIES;
}

export async function listDeadLetters(limit = 50): Promise<DeadLetterEntry[]> {
  const cap = Math.max(1, Math.min(limit, MAX_ENTRIES));
  const client = await ensureRedis();
  if (client) {
    try {
      const rows = await client.lRange(REDIS_KEY, 0, cap - 1);
      return rows.map((r) => JSON.parse(r) as DeadLetterEntry);
    } catch (e) {
      console.warn(`[dead-letter] redis read failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return memoryRing.slice(0, cap);
}

export async function clearDeadLetters(): Promise<number> {
  const client = await ensureRedis();
  if (client) {
    try {
      const n = await client.lLen(REDIS_KEY);
      await client.del(REDIS_KEY);
      return n;
    } catch (e) {
      console.warn(`[dead-letter] redis clear failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const n = memoryRing.length;
  memoryRing.length = 0;
  return n;
}

function shortId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function buildEntry(args: {
  method: string;
  url: string;
  status: number | null;
  reason: string;
  body: BodyInit | null | undefined;
  attempts: number;
}): DeadLetterEntry {
  let bodyPreview: string | null = null;
  if (typeof args.body === "string") {
    bodyPreview = args.body.length > 500 ? args.body.slice(0, 500) + "…" : args.body;
  }
  return {
    id: shortId(),
    timestamp: new Date().toISOString(),
    method: args.method,
    url: args.url,
    status: args.status,
    reason: args.reason,
    bodyPreview,
    attempts: args.attempts,
  };
}

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
export function isWriteMethod(method: string): boolean {
  return WRITE_METHODS.has(method.toUpperCase());
}

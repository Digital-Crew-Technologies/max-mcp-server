/**
 * Dead-letter queue for permanently-failed write requests.
 *
 * When a write (POST/PATCH/DELETE) exhausts all retries, push the request
 * envelope here so it can be inspected and manually replayed later. Uses
 * Redis when REDIS_URL is set; falls back to a bounded in-memory ring
 * buffer otherwise so the API stays the same in dev.
 */

import { createFailFastRedis } from "@/shared/redis/fail-fast";

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

// Fail-fast: an unreachable or slow Redis falls back to the in-memory ring.
const redis = createFailFastRedis("dead-letter");
const memoryRing: DeadLetterEntry[] = [];

export async function recordDeadLetter(entry: DeadLetterEntry): Promise<void> {
  const json = JSON.stringify(entry);
  await redis.run(
    async (r) => {
      await r.lPush(REDIS_KEY, json);
      await r.lTrim(REDIS_KEY, 0, MAX_ENTRIES - 1);
    },
    () => {
      memoryRing.unshift(entry);
      if (memoryRing.length > MAX_ENTRIES) memoryRing.length = MAX_ENTRIES;
    },
  );
}

export async function listDeadLetters(limit = 50): Promise<DeadLetterEntry[]> {
  const cap = Math.max(1, Math.min(limit, MAX_ENTRIES));
  return redis.run(
    async (r) => {
      const rows = await r.lRange(REDIS_KEY, 0, cap - 1);
      return rows.map((row) => JSON.parse(row) as DeadLetterEntry);
    },
    () => memoryRing.slice(0, cap),
  );
}

export async function clearDeadLetters(): Promise<number> {
  return redis.run(
    async (r) => {
      const n = await r.lLen(REDIS_KEY);
      await r.del(REDIS_KEY);
      return n;
    },
    () => {
      const n = memoryRing.length;
      memoryRing.length = 0;
      return n;
    },
  );
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

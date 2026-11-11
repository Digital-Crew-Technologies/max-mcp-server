/**
 * Per-principal rate limit for /chat.
 *
 * Pluggable: Redis-backed when REDIS_URL is set (multi-instance correctness),
 * in-memory ring otherwise (single-instance / local dev). Same graceful
 * fallback pattern as dead-letter.ts and breaker-store.ts.
 *
 * WHY: the in-memory version reset per process. On Vercel serverless, each
 * cold invocation got a fresh counter so bursts across many invocations
 * weren't capped. With Redis, the counter is shared and the cap is enforced
 * cluster-wide.
 *
 * Env:
 *   CHAT_RATE_LIMIT_PER_MINUTE  default 20
 *   CHAT_DAILY_REQUEST_CAP      default 500 (0 = disabled)
 *   REDIS_URL                   if set, use Redis; otherwise in-memory
 */

import { createHash } from "node:crypto";
import type { RedisClientType } from "redis";
import { createFailFastRedis } from "@/shared/redis/fail-fast";

export type RateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSec: number };

export type DailyCapResult = { ok: true } | { ok: false };

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

function limitPerMinute(): number {
  const n = Number(process.env.CHAT_RATE_LIMIT_PER_MINUTE ?? 20);
  return Number.isFinite(n) && n > 0 ? n : 20;
}

function dailyCap(): number {
  const n = Number(process.env.CHAT_DAILY_REQUEST_CAP ?? 500);
  return Number.isFinite(n) && n >= 0 ? n : 500;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

// ── Redis-backed (cluster-wide) ─────────────────────────────────────────────

// Fail-fast: an unreachable or slow Redis falls back to the in-memory buckets
// instead of holding /chat (ADR-005: the route never blocks on Redis).
const redis = createFailFastRedis("chat-rl");

// Redis key names are visible to anyone who can SCAN or MONITOR the instance,
// and the principal can be the shared gateway secret: keys carry its hash.
function principalId(principal: string): string {
  return createHash("sha256").update(principal).digest("hex").slice(0, 32);
}

function minuteKey(principal: string, nowMs: number): string {
  const window = Math.floor(nowMs / MINUTE_MS);
  return `max-mcp:chat:rl:${principalId(principal)}:${window}`;
}

function dayKeyRedis(principal: string): string {
  return `max-mcp:chat:rl:daily:${principalId(principal)}:${todayKey()}`;
}

async function redisCheckMinute(
  r: RedisClientType,
  principal: string,
): Promise<RateLimitResult> {
  const now = Date.now();
  const key = minuteKey(principal, now);
  const count = await r.incr(key);
  if (count === 1) {
    // TTL = remaining time in this minute window so the key auto-cleans.
    const ttlMs = MINUTE_MS - (now % MINUTE_MS);
    await r.pExpire(key, ttlMs);
  }
  const cap = limitPerMinute();
  if (count > cap) {
    const ttlMs = await r.pTTL(key);
    const retryAfterSec = Math.max(1, Math.ceil(ttlMs / 1000));
    return { ok: false, retryAfterSec };
  }
  return { ok: true };
}

async function redisCheckDaily(
  r: RedisClientType,
  principal: string,
): Promise<DailyCapResult> {
  const cap = dailyCap();
  if (cap === 0) return { ok: true }; // disabled
  const key = dayKeyRedis(principal);
  const count = await r.incr(key);
  if (count === 1) await r.pExpire(key, DAY_MS);
  if (count > cap) return { ok: false };
  return { ok: true };
}

// ── In-memory fallback (single instance / dev) ──────────────────────────────

type Bucket = { count: number; resetAt: number };
const memBuckets = new Map<string, Bucket>();

function memCheckMinute(principal: string): RateLimitResult {
  const now = Date.now();
  const cap = limitPerMinute();
  let b = memBuckets.get(principal);

  if (!b || now >= b.resetAt) {
    b = { count: 0, resetAt: now + MINUTE_MS };
    memBuckets.set(principal, b);
  }
  if (b.count >= cap) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) };
  }
  b.count += 1;
  return { ok: true };
}

function memCheckDaily(principal: string): DailyCapResult {
  const cap = dailyCap();
  if (cap === 0) return { ok: true };
  const key = `daily:${principal}:${todayKey()}`;
  const now = Date.now();
  let b = memBuckets.get(key);
  if (!b) {
    b = { count: 0, resetAt: now + DAY_MS };
    memBuckets.set(key, b);
  }
  if (b.count >= cap) return { ok: false };
  b.count += 1;
  return { ok: true };
}

// ── Public API (async; route handler awaits) ────────────────────────────────

export async function checkChatRateLimit(
  principal: string,
): Promise<RateLimitResult> {
  return redis.run(
    (r) => redisCheckMinute(r, principal),
    () => memCheckMinute(principal),
  );
}

export async function checkChatDailyCap(
  principal: string,
): Promise<DailyCapResult> {
  return redis.run(
    (r) => redisCheckDaily(r, principal),
    () => memCheckDaily(principal),
  );
}

/** Test-only: reset the in-memory buckets between cases. */
export function _resetForTests(): void {
  memBuckets.clear();
}

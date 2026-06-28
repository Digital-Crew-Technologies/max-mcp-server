/**
 * Per-principal rate limit for /chat (in-memory; resets per process instance).
 * Set CHAT_RATE_LIMIT_PER_MINUTE (default 20). Returns retry-after seconds when limited.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

function limitPerMinute(): number {
  const n = Number(process.env.CHAT_RATE_LIMIT_PER_MINUTE ?? 20);
  return Number.isFinite(n) && n > 0 ? n : 20;
}

export function checkChatRateLimit(principal: string): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  const windowMs = 60_000;
  const cap = limitPerMinute();
  let b = buckets.get(principal);

  if (!b || now >= b.resetAt) {
    b = { count: 0, resetAt: now + windowMs };
    buckets.set(principal, b);
  }

  if (b.count >= cap) {
    const retryAfterSec = Math.max(1, Math.ceil((b.resetAt - now) / 1000));
    return { ok: false, retryAfterSec };
  }

  b.count += 1;
  return { ok: true };
}

/** Rough daily cap on OpenRouter calls (CHAT_DAILY_REQUEST_CAP, default 500). */
export function checkChatDailyCap(principal: string): { ok: true } | { ok: false } {
  const cap = Number(process.env.CHAT_DAILY_REQUEST_CAP ?? 500);
  if (!Number.isFinite(cap) || cap <= 0) return { ok: true };

  const dayKey = `${principal}:${new Date().toISOString().slice(0, 10)}`;
  const daily = buckets.get(`daily:${dayKey}`);
  const count = daily?.count ?? 0;
  if (count >= cap) return { ok: false };

  buckets.set(`daily:${dayKey}`, { count: count + 1, resetAt: daily?.resetAt ?? Date.now() + 86_400_000 });
  return { ok: true };
}

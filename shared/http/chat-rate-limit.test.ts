import { describe, it, expect, beforeEach } from "vitest";
import {
  checkChatRateLimit,
  checkChatDailyCap,
  _resetForTests,
} from "@/shared/http/chat-rate-limit";

// In-memory mode (no REDIS_URL). Verifies semantics + the env-var caps;
// the Redis path is exercised by the dead-letter / breaker integration
// tests in their respective modules (same ensureRedis pattern).
describe("chat rate limit (in-memory fallback)", () => {
  beforeEach(() => {
    delete process.env.REDIS_URL;
    delete process.env.CHAT_RATE_LIMIT_PER_MINUTE;
    delete process.env.CHAT_DAILY_REQUEST_CAP;
    _resetForTests();
  });

  it("allows up to the per-minute cap, then 429s with retry-after", async () => {
    process.env.CHAT_RATE_LIMIT_PER_MINUTE = "3";
    const p = "alice";
    expect((await checkChatRateLimit(p)).ok).toBe(true);
    expect((await checkChatRateLimit(p)).ok).toBe(true);
    expect((await checkChatRateLimit(p)).ok).toBe(true);
    const fourth = await checkChatRateLimit(p);
    expect(fourth.ok).toBe(false);
    if (!fourth.ok) {
      expect(fourth.retryAfterSec).toBeGreaterThan(0);
      expect(fourth.retryAfterSec).toBeLessThanOrEqual(60);
    }
  });

  it("separates buckets per principal", async () => {
    process.env.CHAT_RATE_LIMIT_PER_MINUTE = "1";
    expect((await checkChatRateLimit("alice")).ok).toBe(true);
    expect((await checkChatRateLimit("alice")).ok).toBe(false);
    expect((await checkChatRateLimit("bob")).ok).toBe(true);
  });

  it("enforces the daily cap", async () => {
    process.env.CHAT_RATE_LIMIT_PER_MINUTE = "9999";
    process.env.CHAT_DAILY_REQUEST_CAP = "2";
    expect((await checkChatDailyCap("alice")).ok).toBe(true);
    expect((await checkChatDailyCap("alice")).ok).toBe(true);
    expect((await checkChatDailyCap("alice")).ok).toBe(false);
  });

  it("treats CHAT_DAILY_REQUEST_CAP=0 as disabled", async () => {
    process.env.CHAT_DAILY_REQUEST_CAP = "0";
    for (let i = 0; i < 100; i++) {
      expect((await checkChatDailyCap("alice")).ok).toBe(true);
    }
  });
});

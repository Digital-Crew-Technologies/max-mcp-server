import { afterEach, describe, expect, it, vi } from "vitest";

// ADR-004/005: Redis failures fall back to in-memory, and nothing blocks on
// Redis. Before the fail-fast helper, an unreachable REDIS_URL left every tool
// call and every /chat request pending forever.

afterEach(() => {
  delete process.env.REDIS_URL;
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("an unreachable Redis falls back to memory", () => {
  it("tool calls, the chat limiter and the dead-letter queue still settle", async () => {
    process.env.REDIS_URL = "redis://127.0.0.1:1";
    process.env.DIGITALCREW_API_BASE_URL = "https://max-agent.example.com";
    delete process.env.APP_ENV;
    vi.resetModules();
    const upstream: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        upstream.push(String(url));
        return new Response("{}", { status: 200 });
      }),
    );
    const { fetchWithRetry } = await import("@/features/pilot-tools/http");
    const { checkChatRateLimit, checkChatDailyCap } = await import("@/shared/http/chat-rate-limit");
    const { recordDeadLetter, listDeadLetters } = await import("@/features/pilot-tools/dead-letter");

    const started = Date.now();
    const res = await fetchWithRetry("https://max-agent.example.com/api/v1/prospects");
    expect(res.status).toBe(200);
    expect(upstream).toHaveLength(1);
    await expect(checkChatRateLimit("p")).resolves.toEqual({ ok: true });
    await expect(checkChatDailyCap("p")).resolves.toEqual({ ok: true });
    await recordDeadLetter({
      id: "1", timestamp: "t", method: "POST", url: "u", status: 500, reason: "r", bodyPreview: null, attempts: 1,
    });
    await expect(listDeadLetters()).resolves.toHaveLength(1);
    expect(Date.now() - started).toBeLessThan(8_000);
  }, 15_000);
});

// ── Redis semantics, against an in-process fake ─────────────────────────────

type Hash = Record<string, string>;
const store = new Map<string, unknown>();

function fakeClient() {
  const hashes = () => store as Map<string, Hash | Map<string, number> | number | string>;
  return {
    isReady: true,
    on: () => undefined,
    connect: async () => undefined,
    disconnect: async () => undefined,
    hGetAll: async (k: string) => ({ ...((hashes().get(k) as Hash) ?? {}) }),
    hGet: async (k: string, f: string) => ((hashes().get(k) as Hash) ?? {})[f] ?? null,
    hSet: async (k: string, v: Hash) => {
      hashes().set(k, { ...((hashes().get(k) as Hash) ?? {}), ...v });
      return 1;
    },
    set: async (k: string, v: string, opts?: { NX?: boolean }) => {
      if (opts?.NX && hashes().has(k)) return null;
      hashes().set(k, v);
      return "OK";
    },
    del: async (k: string) => (hashes().delete(k) ? 1 : 0),
    zAdd: async (k: string, m: { score: number; value: string }) => {
      const z = (hashes().get(k) as Map<string, number>) ?? new Map<string, number>();
      z.set(m.value, m.score);
      hashes().set(k, z);
      return 1;
    },
    zRemRangeByScore: async (k: string, min: number, max: number) => {
      const z = hashes().get(k) as Map<string, number> | undefined;
      if (z) for (const [v, s] of z) if (s >= min && s <= max) z.delete(v);
      return 0;
    },
    zCard: async (k: string) => ((hashes().get(k) as Map<string, number>)?.size ?? 0),
    pExpire: async () => 1,
    pTTL: async () => 60_000,
    incr: async (k: string) => {
      const n = Number(hashes().get(k) ?? 0) + 1;
      hashes().set(k, n);
      return n;
    },
    keys: async () => [...hashes().keys()],
  };
}

describe("the Redis breaker store keeps the in-memory semantics", () => {
  it("counts same-millisecond failures and is not closed by a late success", async () => {
    store.clear();
    process.env.REDIS_URL = "redis://fake";
    vi.resetModules();
    vi.doMock("redis", () => ({ createClient: () => fakeClient() }));
    vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    const { breakerStore } = await import("@/features/pilot-tools/breaker-store");

    for (let i = 0; i < 5; i++) await breakerStore.recordFailure("h", false);
    expect((await breakerStore.status()).h).toMatchObject({ state: "open", failures: 5 });

    // A request admitted before the breaker opened finishes successfully.
    await breakerStore.recordSuccess("h", false);
    expect((await breakerStore.status()).h.state).toBe("open");
    await expect(breakerStore.beforeRequest("h")).rejects.toThrow();

    vi.doUnmock("redis");
    vi.restoreAllMocks();
  });

  it("never writes the chat principal (the gateway secret) into key names", async () => {
    store.clear();
    process.env.REDIS_URL = "redis://fake";
    vi.resetModules();
    vi.doMock("redis", () => ({ createClient: () => fakeClient() }));
    const { checkChatRateLimit, checkChatDailyCap } = await import("@/shared/http/chat-rate-limit");

    await checkChatRateLimit("super-secret-gateway-key");
    await checkChatDailyCap("super-secret-gateway-key");
    const keys = [...store.keys()];
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) expect(k).not.toContain("super-secret-gateway-key");

    vi.doUnmock("redis");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWithRetry } from "./http";

// A POST may have done its work before the answer was lost (a send, a billed
// job), so it is only repeated when the upstream certainly refused it.

let hostSeq = 0;
// A fresh host per test keeps the per-host circuit breaker out of the way.
const freshUrl = () => `https://host-${++hostSeq}.example.com/api/v1/thing`;
const QUICK = { baseDelayMs: 1, maxDelayMs: 1 };

function respondWith(status: number) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calls.push(String(url));
      return new Response("{}", { status, headers: { "retry-after": "0" } });
    }),
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("fetchWithRetry: non-idempotent requests", () => {
  it("does not repeat a POST after a 504", async () => {
    const calls = respondWith(504);
    const res = await fetchWithRetry(freshUrl(), { method: "POST" }, QUICK);
    expect(res.status).toBe(504);
    expect(calls).toHaveLength(1);
  });

  it("does not repeat a POST after a network error", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(String(url));
        throw new TypeError("fetch failed (ECONNRESET)");
      }),
    );
    await expect(fetchWithRetry(freshUrl(), { method: "POST" }, QUICK)).rejects.toThrow(
      /failed after 1 attempt: /,
    );
    expect(calls).toHaveLength(1);
  });

  it("does not repeat a POST after a timeout", async () => {
    vi.useFakeTimers();
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init: RequestInit) => {
        calls.push(String(url));
        return new Promise<Response>((_, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
          );
        });
      }),
    );
    const outcome = fetchWithRetry(freshUrl(), { method: "POST" }, { ...QUICK, timeoutMs: 1000 }).then(
      () => "resolved",
      (e: Error) => e.message,
    );
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await outcome).toMatch(/failed after 1 attempt: timeout/);
    expect(calls).toHaveLength(1);
  });

  it.each([429, 503])("retries a POST the upstream refused (%s)", async (status) => {
    const calls = respondWith(status);
    await fetchWithRetry(freshUrl(), { method: "POST" }, { ...QUICK, maxRetries: 2 });
    expect(calls).toHaveLength(3);
  });

  it("retries a POST after a 504 when the caller opts in", async () => {
    const calls = respondWith(504);
    await fetchWithRetry(
      freshUrl(),
      { method: "POST" },
      { ...QUICK, maxRetries: 2, retryNonIdempotent: true },
    );
    expect(calls).toHaveLength(3);
  });
});

describe("fetchWithRetry: idempotent requests", () => {
  it("still retries a GET after a 504", async () => {
    const calls = respondWith(504);
    await fetchWithRetry(freshUrl(), {}, { ...QUICK, maxRetries: 2 });
    expect(calls).toHaveLength(3);
  });
});

describe("sends and billed jobs make a single attempt", () => {
  const setBase = () => {
    process.env.DIGITALCREW_API_BASE_URL = `https://max-${++hostSeq}.example.com`;
    delete process.env.APP_ENV;
  };

  it("LinkedIn send_message", async () => {
    setBase();
    const calls = respondWith(503);
    const repo = await import("./linkedin/repository");
    await repo.sendMessage("tok", { provider_id: "x", text: "hello" });
    expect(calls).toHaveLength(1);
  });

  it("Unibox send_new_email", async () => {
    setBase();
    const calls = respondWith(503);
    const repo = await import("./unibox/repository");
    await repo.sendNewEmail("tok", { to: "a@b.c", subject: "s", body: "b" });
    expect(calls).toHaveLength(1);
  });

  it("Claire competitor finder", async () => {
    setBase();
    const calls = respondWith(503);
    const repo = await import("./claire/repository");
    await repo.claireCompetitorFinder("tok", { url: "https://acme.com" });
    expect(calls).toHaveLength(1);
  });
});

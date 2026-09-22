import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  API_KEY_HEADER,
  API_KEY_QUERY_PARAM,
  looksLikeMaxApiKey,
  readBearerToken,
  readMaxApiKey,
  readMaxApiKeyFromUrl,
  isMaxApiKeyAuthConfigured,
  checkMaxApiKey,
  verifyMaxApiKey,
  resetMaxApiKeyCache,
} from "@/shared/auth/max-api-key";

const BASE = "https://max.local";

function jsonResponse(status: number): Response {
  return new Response(JSON.stringify({ data: { valid: status === 200 } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("looksLikeMaxApiKey", () => {
  it("accepts a max_live_ key and rejects anything else", () => {
    expect(looksLikeMaxApiKey("max_live_abc123")).toBe(true);
    expect(looksLikeMaxApiKey("max_live_")).toBe(false);
    expect(looksLikeMaxApiKey("sk-live-abc")).toBe(false);
    expect(looksLikeMaxApiKey("eyJhbGciOi.J9.sig")).toBe(false);
  });
});

describe("readBearerToken", () => {
  it("reads the token regardless of scheme casing", () => {
    expect(readBearerToken(new Headers({ Authorization: "Bearer tok" }))).toBe(
      "tok",
    );
    expect(readBearerToken(new Headers({ Authorization: "bearer tok" }))).toBe(
      "tok",
    );
  });

  it("returns undefined for a missing, empty or non-Bearer header", () => {
    expect(readBearerToken(new Headers())).toBeUndefined();
    expect(readBearerToken(new Headers({ Authorization: "Bearer  " }))).toBe(
      undefined,
    );
    expect(
      readBearerToken(new Headers({ Authorization: "Basic dXNlcjpwdw==" })),
    ).toBeUndefined();
  });
});

describe("readMaxApiKey", () => {
  const KEY = "max_live_abc123";

  it("prefers a Max key in the Authorization bearer", () => {
    expect(readMaxApiKey(new Headers({ Authorization: `Bearer ${KEY}` }))).toBe(
      KEY,
    );
  });

  it("falls back to x-api-key, raw or with a pasted Bearer prefix", () => {
    expect(API_KEY_HEADER).toBe("x-api-key");
    expect(readMaxApiKey(new Headers({ "x-api-key": KEY }))).toBe(KEY);
    expect(readMaxApiKey(new Headers({ "X-Api-Key": `Bearer ${KEY}` }))).toBe(
      KEY,
    );
  });

  it("ignores a non-Max bearer and still reads x-api-key", () => {
    const headers = new Headers({
      Authorization: "Bearer eyJhbGciOi.J9.sig",
      "x-api-key": KEY,
    });
    expect(readMaxApiKey(headers)).toBe(KEY);
  });

  it("returns undefined when neither header carries a Max key", () => {
    expect(readMaxApiKey(new Headers())).toBeUndefined();
    expect(
      readMaxApiKey(new Headers({ "x-api-key": "sk-something-else" })),
    ).toBeUndefined();
    expect(readMaxApiKey(new Headers({ "x-api-key": "  " }))).toBeUndefined();
  });
});

describe("readMaxApiKeyFromUrl", () => {
  it("reads a Max key from the documented query parameter", () => {
    expect(API_KEY_QUERY_PARAM).toBe("key");
    expect(
      readMaxApiKeyFromUrl(new URLSearchParams("key=max_live_abc123")),
    ).toBe("max_live_abc123");
  });

  it("returns undefined for a missing, blank or non-Max value", () => {
    expect(readMaxApiKeyFromUrl(new URLSearchParams(""))).toBeUndefined();
    expect(readMaxApiKeyFromUrl(new URLSearchParams("key="))).toBeUndefined();
    expect(
      readMaxApiKeyFromUrl(new URLSearchParams("key=sk-something-else")),
    ).toBeUndefined();
    expect(
      readMaxApiKeyFromUrl(new URLSearchParams("token=max_live_abc123")),
    ).toBeUndefined();
  });
});

describe("verifyMaxApiKey", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetMaxApiKeyCache();
    process.env.DIGITALCREW_API_BASE_URL = BASE;
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.DIGITALCREW_API_BASE_URL;
  });

  it("is unconfigured (and denies) without DIGITALCREW_API_BASE_URL", async () => {
    delete process.env.DIGITALCREW_API_BASE_URL;
    expect(isMaxApiKeyAuthConfigured()).toBe(false);
    expect(await verifyMaxApiKey("max_live_abc")).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts a key max-agent confirms, forwarding it as Bearer", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200));
    expect(await verifyMaxApiKey("max_live_abc")).toBe(true);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/v1/api-keys/verify`);
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer max_live_abc",
    );
  });

  it("strips a trailing slash from the configured base URL", async () => {
    process.env.DIGITALCREW_API_BASE_URL = `${BASE}/`;
    fetchMock.mockResolvedValue(jsonResponse(200));
    await verifyMaxApiKey("max_live_abc");
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/api/v1/api-keys/verify`);
  });

  it("rejects a key max-agent refuses", async () => {
    fetchMock.mockResolvedValue(jsonResponse(401));
    expect(await verifyMaxApiKey("max_live_revoked")).toBe(false);
  });

  it("memoises both verdicts so a chatty session costs one round trip", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200));
    await verifyMaxApiKey("max_live_good");
    await verifyMaxApiKey("max_live_good");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockResolvedValue(jsonResponse(401));
    await verifyMaxApiKey("max_live_bad");
    await verifyMaxApiKey("max_live_bad");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("fails closed on a network error without caching the failure", async () => {
    fetchMock.mockRejectedValueOnce(new Error("ECONNRESET"));
    expect(await verifyMaxApiKey("max_live_abc")).toBe(false);

    // max-agent recovers: the very next request must be allowed through.
    fetchMock.mockResolvedValue(jsonResponse(200));
    expect(await verifyMaxApiKey("max_live_abc")).toBe(true);
  });

  it("fails closed on a 5xx without caching the failure", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(503));
    expect(await verifyMaxApiKey("max_live_abc")).toBe(false);

    fetchMock.mockResolvedValue(jsonResponse(200));
    expect(await verifyMaxApiKey("max_live_abc")).toBe(true);
  });

  it("keeps verdicts per key", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200));
    expect(await verifyMaxApiKey("max_live_good")).toBe(true);
    fetchMock.mockResolvedValueOnce(jsonResponse(401));
    expect(await verifyMaxApiKey("max_live_bad")).toBe(false);
  });
});

// A client treats 401 as "this credential is dead" and drops the server's
// tools. Only max-agent refusing the key may produce that verdict.
describe("checkMaxApiKey — refused vs. unreachable", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const T0 = 1_700_000_000_000;
  const MIN = 60_000;

  beforeEach(() => {
    resetMaxApiKeyCache();
    process.env.DIGITALCREW_API_BASE_URL = BASE;
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(Date, "now").mockReturnValue(T0);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.DIGITALCREW_API_BASE_URL;
  });

  it("reports an unreachable max-agent as unavailable, not invalid", async () => {
    fetchMock.mockRejectedValueOnce(new Error("The operation was aborted due to timeout"));
    expect(await checkMaxApiKey("max_live_abc")).toBe("unavailable");

    fetchMock.mockResolvedValueOnce(jsonResponse(502));
    expect(await checkMaxApiKey("max_live_abc")).toBe("unavailable");

    fetchMock.mockResolvedValueOnce(jsonResponse(401));
    expect(await checkMaxApiKey("max_live_abc")).toBe("invalid");
  });

  it("keeps admitting a recently confirmed key while max-agent is unreachable", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200));
    expect(await checkMaxApiKey("max_live_abc")).toBe("valid");

    // The 5-minute verdict has expired and max-agent is mid-deploy.
    vi.mocked(Date.now).mockReturnValue(T0 + 20 * MIN);
    fetchMock.mockRejectedValue(new Error("ECONNRESET"));
    expect(await checkMaxApiKey("max_live_abc")).toBe("valid");
    expect(await verifyMaxApiKey("max_live_abc")).toBe(true);
  });

  it("stops the grace once it is too old", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200));
    await checkMaxApiKey("max_live_abc");

    vi.mocked(Date.now).mockReturnValue(T0 + 2 * 60 * MIN);
    fetchMock.mockRejectedValue(new Error("ECONNRESET"));
    expect(await checkMaxApiKey("max_live_abc")).toBe("unavailable");
  });

  it("gives a revoked key no grace", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200));
    await checkMaxApiKey("max_live_abc");

    vi.mocked(Date.now).mockReturnValue(T0 + 6 * MIN);
    fetchMock.mockResolvedValueOnce(jsonResponse(401));
    expect(await checkMaxApiKey("max_live_abc")).toBe("invalid");

    // If max-agent then goes down, the earlier confirmation must not
    // resurrect the key: it is unverifiable (503), never admitted.
    vi.mocked(Date.now).mockReturnValue(T0 + 7 * MIN);
    fetchMock.mockRejectedValueOnce(new Error("ECONNRESET"));
    expect(await checkMaxApiKey("max_live_abc")).toBe("unavailable");
  });
});

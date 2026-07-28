import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  looksLikeMaxApiKey,
  readBearerToken,
  isMaxApiKeyAuthConfigured,
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

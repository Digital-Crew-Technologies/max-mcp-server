import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";
import { resetMaxApiKeyCache } from "@/shared/auth/max-api-key";

const SECRET = "gateway-secret";
const BASE = "https://max.local";
const KEY = "max_live_abcdef123456";

function request(
  path: string,
  headers: Record<string, string> = {},
): NextRequest {
  return new NextRequest(`https://max-mcp.local${path}`, {
    method: "POST",
    headers,
  });
}

async function messageOf(res: Response): Promise<string> {
  const body = (await res.json()) as { error?: { message?: string } };
  return body.error?.message ?? "";
}

describe("gateway middleware", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetMaxApiKeyCache();
    delete process.env.MCP_GATEWAY_SECRET;
    delete process.env.DIGITALCREW_API_BASE_URL;
    delete process.env.HERMES_CALLER_SECRET;
    fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lets preflight through untouched", async () => {
    const res = await middleware(
      new NextRequest("https://max-mcp.local/mcp", { method: "OPTIONS" }),
    );
    expect(res.status).toBe(200);
  });

  it("503s when neither auth path is configured", async () => {
    const res = await middleware(request("/mcp"));
    expect(res.status).toBe(503);
  });

  describe("shared gateway secret", () => {
    beforeEach(() => {
      process.env.MCP_GATEWAY_SECRET = SECRET;
    });

    it("admits a matching X-MCP-Gateway-Key", async () => {
      const res = await middleware(
        request("/mcp", { "X-MCP-Gateway-Key": SECRET }),
      );
      expect(res.status).toBe(200);
    });

    it("rejects a wrong or missing key", async () => {
      expect(
        (await middleware(request("/mcp", { "X-MCP-Gateway-Key": "nope" })))
          .status,
      ).toBe(401);
      expect((await middleware(request("/mcp"))).status).toBe(401);
    });
  });

  describe("Max API key on /mcp", () => {
    beforeEach(() => {
      process.env.DIGITALCREW_API_BASE_URL = BASE;
    });

    it("admits a key max-agent confirms, with no gateway secret deployed", async () => {
      const res = await middleware(
        request("/mcp", { Authorization: `Bearer ${KEY}` }),
      );
      expect(res.status).toBe(200);
      expect(fetchMock).toHaveBeenCalledWith(
        `${BASE}/api/v1/api-keys/verify`,
        expect.anything(),
      );
    });

    it("admits a key even when a gateway secret is also configured", async () => {
      process.env.MCP_GATEWAY_SECRET = SECRET;
      const res = await middleware(
        request("/mcp", { Authorization: `Bearer ${KEY}` }),
      );
      expect(res.status).toBe(200);
    });

    it("rejects a key max-agent refuses", async () => {
      fetchMock.mockResolvedValue(new Response("{}", { status: 401 }));
      const res = await middleware(
        request("/mcp", { Authorization: `Bearer ${KEY}` }),
      );
      expect(res.status).toBe(401);
    });

    it("answers 503 (retryable), not 401, when max-agent cannot be reached", async () => {
      // A 401 makes Claude/ChatGPT drop the connector's tools mid-conversation.
      fetchMock.mockRejectedValue(new Error("The operation was aborted due to timeout"));
      const res = await middleware(
        request("/mcp", { Authorization: `Bearer ${KEY}` }),
      );
      expect(res.status).toBe(503);
      expect(res.headers.get("Retry-After")).toBe("5");
      expect(await messageOf(res)).toMatch(/temporarily unreachable/);
    });

    it("answers 503 when max-agent's verify route errors", async () => {
      fetchMock.mockResolvedValue(new Response("{}", { status: 500 }));
      const res = await middleware(
        request("/mcp", { "x-api-key": KEY }),
      );
      expect(res.status).toBe(503);
    });

    it("does not call max-agent for a bearer that isn't a Max API key", async () => {
      const res = await middleware(
        request("/mcp", { Authorization: "Bearer eyJhbGciOi.J9.sig" }),
      );
      expect(res.status).toBe(401);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("names both credentials in the denial so the fix is obvious", async () => {
      const res = await middleware(request("/mcp"));
      const message = await messageOf(res);
      expect(message).toContain("Authorization: Bearer max_live_");
      expect(message).toContain("X-MCP-Gateway-Key");
    });

    it("covers nested /mcp paths", async () => {
      const res = await middleware(
        request("/mcp/message", { Authorization: `Bearer ${KEY}` }),
      );
      expect(res.status).toBe(200);
    });

    // Claude's connector dialog reserves `Authorization` for OAuth, so a key
    // from a Claude app can only ever arrive under another name.
    describe("as x-api-key", () => {
      it("admits the key and re-issues it as the bearer the tools read", async () => {
        const res = await middleware(request("/mcp", { "x-api-key": KEY }));
        expect(res.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledWith(
          `${BASE}/api/v1/api-keys/verify`,
          expect.anything(),
        );
        // NextResponse.next({ request: { headers } }) carries the override to
        // the route handler as x-middleware-request-* headers.
        expect(res.headers.get("x-middleware-request-authorization")).toBe(
          `Bearer ${KEY}`,
        );
      });

      it("tolerates a pasted Bearer prefix", async () => {
        const res = await middleware(
          request("/mcp", { "x-api-key": `Bearer ${KEY}` }),
        );
        expect(res.status).toBe(200);
        expect(res.headers.get("x-middleware-request-authorization")).toBe(
          `Bearer ${KEY}`,
        );
      });

      it("forwards a genuine Authorization bearer unchanged", async () => {
        const res = await middleware(
          request("/mcp", { Authorization: `Bearer ${KEY}` }),
        );
        expect(res.status).toBe(200);
        // Every request header is echoed as x-middleware-request-*; the point
        // is that the original bearer is what arrives, not a rewritten one.
        expect(res.headers.get("x-middleware-request-authorization")).toBe(
          `Bearer ${KEY}`,
        );
      });

      it("does not call max-agent for a value that isn't a Max API key", async () => {
        const res = await middleware(
          request("/mcp", { "x-api-key": "sk-something-else" }),
        );
        expect(res.status).toBe(401);
        expect(fetchMock).not.toHaveBeenCalled();
      });

      it("rejects a key max-agent refuses", async () => {
        fetchMock.mockResolvedValue(new Response("{}", { status: 401 }));
        const res = await middleware(request("/mcp", { "x-api-key": KEY }));
        expect(res.status).toBe(401);
        expect(res.headers.get("x-middleware-request-authorization")).toBeNull();
      });

      it("is named in the denial next to the bearer form", async () => {
        const message = await messageOf(await middleware(request("/mcp")));
        expect(message).toContain("x-api-key: max_live_");
      });
    });

    // ChatGPT's connector form offers OAuth or nothing, so the URL is the only
    // place its users can carry a credential.
    describe("as ?key= on the URL", () => {
      it("admits the key, re-issues it as the bearer and strips it from the URL", async () => {
        const res = await middleware(request(`/mcp?key=${KEY}`));
        expect(res.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledWith(
          `${BASE}/api/v1/api-keys/verify`,
          expect.anything(),
        );
        expect(res.headers.get("x-middleware-request-authorization")).toBe(
          `Bearer ${KEY}`,
        );
        // NextResponse.rewrite() names the URL the handler will see.
        const rewrite = res.headers.get("x-middleware-rewrite");
        expect(rewrite).toBeTruthy();
        expect(rewrite).not.toContain(KEY);
        expect(new URL(rewrite!).pathname).toBe("/mcp");
      });

      it("keeps other query parameters when stripping the key", async () => {
        const res = await middleware(request(`/mcp?sessionId=abc&key=${KEY}`));
        expect(res.status).toBe(200);
        const rewrite = new URL(res.headers.get("x-middleware-rewrite")!);
        expect(rewrite.searchParams.get("sessionId")).toBe("abc");
        expect(rewrite.searchParams.has("key")).toBe(false);
      });

      it("yields to a header credential when both are present", async () => {
        const res = await middleware(
          request(`/mcp?key=max_live_fromurl`, { "x-api-key": KEY }),
        );
        expect(res.status).toBe(200);
        expect(res.headers.get("x-middleware-request-authorization")).toBe(
          `Bearer ${KEY}`,
        );
        // Header path taken → plain next(), no rewrite.
        expect(res.headers.get("x-middleware-rewrite")).toBeNull();
      });

      it("does not call max-agent for a value that isn't a Max API key", async () => {
        const res = await middleware(request("/mcp?key=sk-something-else"));
        expect(res.status).toBe(401);
        expect(fetchMock).not.toHaveBeenCalled();
      });

      it("rejects a key max-agent refuses", async () => {
        fetchMock.mockResolvedValue(new Response("{}", { status: 401 }));
        const res = await middleware(request(`/mcp?key=${KEY}`));
        expect(res.status).toBe(401);
        expect(res.headers.get("x-middleware-rewrite")).toBeNull();
      });

      it("is named in the denial", async () => {
        const message = await messageOf(await middleware(request("/mcp")));
        expect(message).toContain("?key=max_live_");
      });
    });
  });

  describe("/chat stays shared-secret only", () => {
    beforeEach(() => {
      process.env.DIGITALCREW_API_BASE_URL = BASE;
    });

    it("503s on /chat when only API-key auth is configured", async () => {
      const res = await middleware(request("/chat"));
      expect(res.status).toBe(503);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rejects a Max API key on /chat when a secret is configured", async () => {
      process.env.MCP_GATEWAY_SECRET = SECRET;
      const res = await middleware(
        request("/chat", { Authorization: `Bearer ${KEY}` }),
      );
      expect(res.status).toBe(401);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rejects x-api-key on /chat too", async () => {
      process.env.MCP_GATEWAY_SECRET = SECRET;
      const res = await middleware(request("/chat", { "x-api-key": KEY }));
      expect(res.status).toBe(401);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rejects ?key= on /chat too", async () => {
      process.env.MCP_GATEWAY_SECRET = SECRET;
      const res = await middleware(request(`/chat?key=${KEY}`));
      expect(res.status).toBe(401);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});

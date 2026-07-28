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
  });
});

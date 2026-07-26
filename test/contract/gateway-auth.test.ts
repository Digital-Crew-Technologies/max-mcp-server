// Gate contract for middleware.ts.
//
// The gate has two accepted paths and a lot of ways to get it wrong, so the
// cases that matter are pinned here: a wrong shared secret must NEVER fall
// through to the API-key path, /chat must stay shared-secret only, and an
// unverifiable key must fail closed.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

const GATEWAY_SECRET = "test-gateway-secret";
const API_BASE = "https://max.example.test";
const VALID_KEY = "max_live_validkeyvalidkeyvalidkey01";
const INVALID_KEY = "max_live_revokedrevokedrevokedrev01";

/** Fresh module per test — the middleware caches key verdicts in isolate state. */
async function loadMiddleware() {
  vi.resetModules();
  return (await import("@/middleware")).middleware;
}

function request(
  path: string,
  headers: Record<string, string> = {},
): NextRequest {
  return new NextRequest(`https://mcp.example.test${path}`, {
    method: "POST",
    headers,
  });
}

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  process.env.MCP_GATEWAY_SECRET = GATEWAY_SECRET;
  process.env.DIGITALCREW_API_BASE_URL = API_BASE;
  delete process.env.HERMES_CALLER_SECRET;

  fetchSpy = vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input.toString();
    const auth = url.includes("/api/v1/workspace");
    return new Response(null, { status: auth ? 200 : 404 });
  });
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("gateway auth — service path", () => {
  it("admits a correct X-MCP-Gateway-Key", async () => {
    const middleware = await loadMiddleware();
    const res = await middleware(
      request("/mcp", { "x-mcp-gateway-key": GATEWAY_SECRET }),
    );
    expect(res.status).toBe(200);
  });

  it("rejects a wrong gateway key even when a valid API key rides along", async () => {
    // Regression guard: a presented-but-wrong secret must be terminal, not a
    // fall-through into the end-user path.
    const middleware = await loadMiddleware();
    const res = await middleware(
      request("/mcp", {
        "x-mcp-gateway-key": "wrong-secret",
        authorization: `Bearer ${VALID_KEY}`,
      }),
    );
    expect(res.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("gateway auth — end-user Max API key path", () => {
  it("admits a valid max_live_ key on /mcp with no gateway key", async () => {
    const middleware = await loadMiddleware();
    const res = await middleware(
      request("/mcp", { authorization: `Bearer ${VALID_KEY}` }),
    );
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("caches a verdict so repeat calls skip the upstream check", async () => {
    const middleware = await loadMiddleware();
    await middleware(request("/mcp", { authorization: `Bearer ${VALID_KEY}` }));
    await middleware(request("/mcp", { authorization: `Bearer ${VALID_KEY}` }));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("rejects a key max-agent does not recognize", async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 401 }));
    const middleware = await loadMiddleware();
    const res = await middleware(
      request("/mcp", { authorization: `Bearer ${INVALID_KEY}` }),
    );
    expect(res.status).toBe(401);
  });

  it("fails closed when max-agent is unreachable", async () => {
    fetchSpy.mockRejectedValue(new Error("ECONNREFUSED"));
    const middleware = await loadMiddleware();
    const res = await middleware(
      request("/mcp", { authorization: `Bearer ${VALID_KEY}` }),
    );
    expect(res.status).toBe(401);
  });

  it("does not accept an API key on /chat — shared secret only", async () => {
    const middleware = await loadMiddleware();
    const res = await middleware(
      request("/chat", { authorization: `Bearer ${VALID_KEY}` }),
    );
    expect(res.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects a non-Max bearer (e.g. a Supabase JWT) with no gateway key", async () => {
    const middleware = await loadMiddleware();
    const res = await middleware(
      request("/mcp", { authorization: "Bearer eyJhbGciOiJIUzI1NiJ9.x.y" }),
    );
    expect(res.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects when no credential is presented at all", async () => {
    const middleware = await loadMiddleware();
    const res = await middleware(request("/mcp"));
    expect(res.status).toBe(401);
  });
});

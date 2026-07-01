import { describe, it, expect, beforeEach } from "vitest";
import { runWithMcpRequest } from "@/shared/auth/request-context";
import { hasAdminScope, requireAdmin } from "@/shared/auth/gateway-scope";

describe("gateway admin scope", () => {
  beforeEach(() => {
    delete process.env.MCP_ADMIN_GATEWAY_KEY;
  });

  it("denies admin when MCP_ADMIN_GATEWAY_KEY is unset", () => {
    expect(hasAdminScope()).toBe(false);
    expect(() => requireAdmin()).toThrow(/Forbidden/);
  });

  it("grants admin when gateway key matches MCP_ADMIN_GATEWAY_KEY", () => {
    process.env.MCP_ADMIN_GATEWAY_KEY = "admin-secret";
    const req = new Request("https://mcp.local", {
      headers: { "X-MCP-Gateway-Key": "admin-secret" },
    });
    runWithMcpRequest(req, () => {
      expect(hasAdminScope()).toBe(true);
      expect(() => requireAdmin()).not.toThrow();
    });
  });

  it("denies admin when gateway key does not match", () => {
    process.env.MCP_ADMIN_GATEWAY_KEY = "admin-secret";
    const req = new Request("https://mcp.local", {
      headers: { "X-MCP-Gateway-Key": "regular-secret" },
    });
    runWithMcpRequest(req, () => {
      expect(hasAdminScope()).toBe(false);
    });
  });
});

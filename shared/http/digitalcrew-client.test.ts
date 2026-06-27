import { describe, it, expect, beforeEach } from "vitest";
import { resolveBearerToken } from "@/shared/http/digitalcrew-client";
import { runWithMcpRequest } from "@/shared/auth/request-context";

// resolveBearerToken decides WHICH upstream token to use, in a precedence order.
// Getting this wrong is a security bug, so we pin the order with tests.
describe("resolveBearerToken — precedence order", () => {
  beforeEach(() => {
    // Tests share one process, so clear env between them to avoid bleed.
    delete process.env.DIGITALCREW_API_TOKEN;
    delete process.env.DIGITALCREW_BEARER_TOKEN;
  });

  it("prefers the explicit override argument over everything else", () => {
    process.env.DIGITALCREW_API_TOKEN = "env-token";
    expect(resolveBearerToken("arg-token")).toBe("arg-token");
  });

  it("uses the MCP Authorization header when there is no override", () => {
    process.env.DIGITALCREW_API_TOKEN = "env-token"; // present, but header wins
    const req = new Request("https://mcp.local", {
      headers: { Authorization: "Bearer header-token" },
    });
    runWithMcpRequest(req, () => {
      expect(resolveBearerToken()).toBe("header-token");
    });
  });

  it("falls back to DIGITALCREW_API_TOKEN", () => {
    process.env.DIGITALCREW_API_TOKEN = "env-token";
    expect(resolveBearerToken()).toBe("env-token");
  });

  it("falls back to DIGITALCREW_BEARER_TOKEN when API_TOKEN is unset", () => {
    process.env.DIGITALCREW_BEARER_TOKEN = "fallback-token";
    expect(resolveBearerToken()).toBe("fallback-token");
  });

  it("throws a clear error when no token is available anywhere", () => {
    expect(() => resolveBearerToken()).toThrow(/Bearer token missing/);
  });
});

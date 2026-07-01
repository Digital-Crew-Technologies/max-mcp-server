import { describe, it, expect, beforeEach } from "vitest";
import { resolveBearerToken } from "@/shared/http/digitalcrew-client";
import { runWithMcpRequest } from "@/shared/auth/request-context";

describe("resolveBearerToken — precedence order", () => {
  beforeEach(() => {
    delete process.env.DIGITALCREW_API_TOKEN;
    delete process.env.DIGITALCREW_BEARER_TOKEN;
    delete process.env.ALLOW_ENV_TOKEN_FALLBACK;
  });

  it("prefers the explicit override argument over everything else", () => {
    process.env.ALLOW_ENV_TOKEN_FALLBACK = "true";
    process.env.DIGITALCREW_API_TOKEN = "env-token";
    expect(resolveBearerToken("arg-token")).toBe("arg-token");
  });

  it("uses the MCP Authorization header when there is no override", () => {
    const req = new Request("https://mcp.local", {
      headers: { Authorization: "Bearer header-token" },
    });
    runWithMcpRequest(req, () => {
      expect(resolveBearerToken()).toBe("header-token");
    });
  });

  it("does not use env tokens unless ALLOW_ENV_TOKEN_FALLBACK=true", () => {
    process.env.DIGITALCREW_API_TOKEN = "env-token";
    expect(() => resolveBearerToken()).toThrow(/Bearer token missing/);
  });

  it("falls back to env tokens when ALLOW_ENV_TOKEN_FALLBACK=true", () => {
    process.env.ALLOW_ENV_TOKEN_FALLBACK = "true";
    process.env.DIGITALCREW_API_TOKEN = "env-token";
    expect(resolveBearerToken()).toBe("env-token");
  });

  it("falls back to DIGITALCREW_BEARER_TOKEN when API_TOKEN is unset", () => {
    process.env.ALLOW_ENV_TOKEN_FALLBACK = "true";
    process.env.DIGITALCREW_BEARER_TOKEN = "fallback-token";
    expect(resolveBearerToken()).toBe("fallback-token");
  });

  it("throws a clear error when no token is available anywhere", () => {
    expect(() => resolveBearerToken()).toThrow(/Bearer token missing/);
  });
});

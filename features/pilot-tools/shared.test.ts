import { describe, it, expect } from "vitest";
import {
  authHeaders,
  buildQuery,
  omitKey,
  strip,
} from "@/features/pilot-tools/shared";
import { runWithMcpRequest } from "@/shared/auth/request-context";
import { VERIFIED_HERMES_CALLER_HEADER } from "@/shared/auth/hermes-caller";

describe("buildQuery", () => {
  it("skips undefined, null, and empty-string values", () => {
    expect(buildQuery({ a: 1, b: undefined, c: null, d: "" })).toBe("?a=1");
  });

  it("repeats array values as multiple params", () => {
    expect(buildQuery({ ids: ["x", "y"] })).toBe("?ids=x&ids=y");
  });

  it("returns an empty string when there is nothing to encode", () => {
    expect(buildQuery({})).toBe("");
    expect(buildQuery({ a: undefined })).toBe("");
  });
});

describe("strip", () => {
  it("removes the given keys and does NOT mutate the input", () => {
    const input = { id: "1", name: "x", bearer_token: "secret" };
    const out = strip(input, "bearer_token");
    expect(out).toEqual({ id: "1", name: "x" });
    expect(input).toHaveProperty("bearer_token");
  });
});

describe("omitKey", () => {
  it("removes keys with correct typing", () => {
    const input = { page: 1, bearer_token: "t" };
    expect(omitKey(input, "bearer_token")).toEqual({ page: 1 });
  });
});

describe("authHeaders — verified Hermes caller forwarding", () => {
  const CALLER_JSON = JSON.stringify({
    tenantId: "ws_1",
    agentId: "max",
    capability: "vexa.bot.dispatch",
    nonce: "n",
    exp: 9999999999,
  });

  it("always sets Authorization + Content-Type", () => {
    const h = authHeaders("tok");
    expect(h.Authorization).toBe("Bearer tok");
    expect(h["Content-Type"]).toBe("application/json");
  });

  it("omits the verified caller header when there is no request context", () => {
    expect(authHeaders("tok")[VERIFIED_HERMES_CALLER_HEADER]).toBeUndefined();
  });

  it("omits it when the request carries no verified caller header", () => {
    const req = new Request("https://mcp.local", {
      headers: { Authorization: "Bearer x" },
    });
    runWithMcpRequest(req, () => {
      expect(authHeaders("tok")[VERIFIED_HERMES_CALLER_HEADER]).toBeUndefined();
    });
  });

  it("forwards the verified caller header verbatim when present", () => {
    const req = new Request("https://mcp.local", {
      headers: { [VERIFIED_HERMES_CALLER_HEADER]: CALLER_JSON },
    });
    runWithMcpRequest(req, () => {
      const h = authHeaders("tok");
      expect(h[VERIFIED_HERMES_CALLER_HEADER]).toBe(CALLER_JSON);
      // bearer stays authoritative
      expect(h.Authorization).toBe("Bearer tok");
    });
  });
});

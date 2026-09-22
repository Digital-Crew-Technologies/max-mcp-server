import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { McpServer } from "@/features/pilot-tools/shared";
import { registerOrganizationTools } from "@/features/pilot-tools/organizations/tools";

type Captured = {
  name: string;
  config: Record<string, unknown>;
  handler: (input: Record<string, unknown>) => Promise<{
    content: Array<{ type: "text"; text: string }>;
    isError?: boolean;
  }>;
};

function capture(): Captured[] {
  const tools: Captured[] = [];
  const server: McpServer = {
    registerTool(name, config, handler) {
      tools.push({ name, config, handler });
    },
  };
  registerOrganizationTools(server);
  return tools;
}

function tool(name: string): Captured {
  const found = capture().find((t) => t.name === name);
  if (!found) throw new Error(`tool "${name}" was not registered`);
  return found;
}

function mockFetch(body: unknown, init: { status?: number } = {}) {
  const fetchMock = vi.fn(
    async (_url: string, _init?: RequestInit) =>
      new Response(typeof body === "string" ? body : JSON.stringify(body), {
        status: init.status ?? 200,
        headers: { "Content-Type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function calledUrl(fetchMock: ReturnType<typeof mockFetch>): URL {
  return new URL(fetchMock.mock.calls[0][0]);
}

function calledMethod(fetchMock: ReturnType<typeof mockFetch>): string {
  return fetchMock.mock.calls[0][1]?.method ?? "GET";
}

const ORG = "44444444-4444-4444-4444-444444444444";

beforeEach(() => {
  process.env.DIGITALCREW_API_BASE_URL = "https://api.test";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("organization tool registration", () => {
  it("registers the new organization tools", () => {
    const names = capture().map((t) => t.name);
    for (const name of [
      "get_organization_geo_stats",
      "get_organization_geo_points",
      "get_organization_share_link",
      "create_organization_share_link",
      "revoke_organization_share_link",
    ]) {
      expect(names).toContain(name);
    }
    expect(new Set(names).size).toBe(names.length);
  });

  it("marks revoke destructive and the geo reads read-only", () => {
    const hints = (name: string) =>
      (tool(name).config.annotations ?? {}) as Record<string, boolean>;
    expect(hints("revoke_organization_share_link").destructiveHint).toBe(true);
    expect(hints("get_organization_geo_stats").readOnlyHint).toBe(true);
    expect(hints("get_organization_geo_points").readOnlyHint).toBe(true);
    expect(String(tool("create_organization_share_link").config.description)).toMatch(/PUBLISHES/);
  });
});

describe("organization handlers", () => {
  it("get_organization_geo_stats → GET /organizations/geo-stats", async () => {
    const fetchMock = mockFetch({ total: 0 });
    const res = await tool("get_organization_geo_stats").handler({ bearer_token: "t" });
    expect(res.isError).toBeUndefined();
    expect(calledMethod(fetchMock)).toBe("GET");
    expect(calledUrl(fetchMock).pathname).toBe("/api/v1/organizations/geo-stats");
    expect(calledUrl(fetchMock).search).toBe("");
  });

  it("get_organization_geo_points → GET /organizations/geo-points", async () => {
    const fetchMock = mockFetch({ points: [], capped: false });
    await tool("get_organization_geo_points").handler({ bearer_token: "t" });
    expect(calledUrl(fetchMock).pathname).toBe("/api/v1/organizations/geo-points");
  });

  it("share link tools hit GET/POST/DELETE /organizations/{id}/share-link", async () => {
    for (const [name, method] of [
      ["get_organization_share_link", "GET"],
      ["create_organization_share_link", "POST"],
      ["revoke_organization_share_link", "DELETE"],
    ] as const) {
      const fetchMock = mockFetch({ data: null });
      await tool(name).handler({ bearer_token: "t", id: ORG });
      expect(calledMethod(fetchMock)).toBe(method);
      expect(calledUrl(fetchMock).pathname).toBe(`/api/v1/organizations/${ORG}/share-link`);
      vi.unstubAllGlobals();
    }
  });
});

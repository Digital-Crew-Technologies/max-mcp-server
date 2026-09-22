import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { z } from "zod";
import type { McpServer } from "@/features/pilot-tools/shared";
import { registerEmailAnalyticsTools } from "@/features/pilot-tools/email-analytics/tools";

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
  registerEmailAnalyticsTools(server);
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

function calledBody(fetchMock: ReturnType<typeof mockFetch>): Record<string, unknown> {
  return JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
}

const UUID = "11111111-1111-1111-1111-111111111111";
const UUID2 = "22222222-2222-2222-2222-222222222222";

beforeEach(() => {
  process.env.DIGITALCREW_API_BASE_URL = "https://api.test";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const FROM = "2026-01-01T00:00:00Z";
const TO = "2026-03-31T23:59:59Z";

describe("workspace analytics tools", () => {
  it("get_analytics_overview GETs with period, repeated campaign_ids and compare", async () => {
    const fetchMock = mockFetch({ totals: {} });
    await tool("get_analytics_overview").handler({
      bearer_token: "t",
      from: FROM,
      to: TO,
      campaign_ids: [UUID, UUID2],
      compare: "prior_year",
    });
    const url = calledUrl(fetchMock);
    expect(calledMethod(fetchMock)).toBe("GET");
    expect(url.pathname).toBe("/api/v1/analytics/overview");
    expect(url.searchParams.get("from")).toBe(FROM);
    expect(url.searchParams.get("to")).toBe(TO);
    expect(url.searchParams.getAll("campaign_ids")).toEqual([UUID, UUID2]);
    expect(url.searchParams.get("compare")).toBe("prior_year");
    expect(url.searchParams.has("bearer_token")).toBe(false);
  });

  it("list_conversation_analytics GETs with the period", async () => {
    const fetchMock = mockFetch({ data: { totals: {} } });
    await tool("list_conversation_analytics").handler({ bearer_token: "t", from: FROM });
    const url = calledUrl(fetchMock);
    expect(url.pathname).toBe("/api/v1/analytics/conversations");
    expect(url.searchParams.get("from")).toBe(FROM);
    expect(url.searchParams.has("to")).toBe(false);
  });

  it("get_entity_analytics GETs with type and id", async () => {
    const fetchMock = mockFetch({ entity: {} });
    await tool("get_entity_analytics").handler({
      bearer_token: "t",
      type: "organization",
      id: UUID,
    });
    const url = calledUrl(fetchMock);
    expect(url.pathname).toBe("/api/v1/analytics/entity");
    expect(url.searchParams.get("type")).toBe("organization");
    expect(url.searchParams.get("id")).toBe(UUID);
  });

  it("rejects a non-ISO period bound instead of silently querying all time", () => {
    const schema = tool("get_analytics_overview").config.inputSchema as z.ZodTypeAny;
    expect(schema.safeParse({ from: "last month" }).success).toBe(false);
    expect(schema.safeParse({ from: FROM }).success).toBe(true);
  });

  it("marks the new analytics tools read-only", () => {
    for (const name of [
      "get_analytics_overview",
      "list_conversation_analytics",
      "get_entity_analytics",
    ]) {
      const annotations = tool(name).config.annotations as { readOnlyHint?: boolean };
      expect(annotations.readOnlyHint, name).toBe(true);
    }
  });

  it("get_campaign_engagement_summary passes campaign_id as a query param", async () => {
    const fetchMock = mockFetch({});
    await tool("get_campaign_engagement_summary").handler({ bearer_token: "t", campaign_id: UUID });
    const url = calledUrl(fetchMock);
    expect(url.pathname).toBe("/api/v1/analytics/campaign-summary");
    expect(url.searchParams.get("campaign_id")).toBe(UUID);
  });
});

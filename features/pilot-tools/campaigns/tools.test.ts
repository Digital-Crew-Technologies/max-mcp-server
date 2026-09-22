import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { McpServer } from "@/features/pilot-tools/shared";
import { registerCampaignTools } from "@/features/pilot-tools/campaigns/tools";
import { registerAsGroup } from "@/features/pilot-tools/mcp/group-adapter";

type Captured = {
  name: string;
  config: Record<string, unknown>;
  handler: (input: Record<string, unknown>) => Promise<{
    content: Array<{ type: "text"; text: string }>;
    isError?: boolean;
  }>;
};

function capture(register: (server: McpServer) => void = registerCampaignTools): Captured[] {
  const tools: Captured[] = [];
  const server: McpServer = {
    registerTool(name, config, handler) {
      tools.push({ name, config, handler });
    },
  };
  register(server);
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

function calledBody(fetchMock: ReturnType<typeof mockFetch>): unknown {
  const raw = fetchMock.mock.calls[0][1]?.body;
  return raw === undefined ? undefined : JSON.parse(raw as string);
}

const CAMPAIGN = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";
const LIST = "33333333-3333-3333-3333-333333333333";

beforeEach(() => {
  process.env.DIGITALCREW_API_BASE_URL = "https://api.test";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("campaign tool registration", () => {
  it("registers every new campaign tool with 'campaign' in its name", () => {
    const names = capture().map((t) => t.name);
    for (const name of [
      "get_campaign_ab_tests",
      "update_campaign_ab_test",
      "get_campaign_audience",
      "list_campaign_audience_prospects",
      "add_campaign_audience_prospects",
      "remove_campaign_audience_prospects",
      "attach_campaign_audience_list",
      "detach_campaign_audience_list",
      "sync_campaign_audience",
      "list_campaign_conversations",
      "get_campaign_feed",
      "get_campaign_launch_preflight",
      "duplicate_campaign",
      "bulk_get_campaign_node_run_counts",
      "get_campaign_share_link",
      "create_campaign_share_link",
      "revoke_campaign_share_link",
    ]) {
      expect(names).toContain(name);
      expect(name).toContain("campaign");
    }
    expect(new Set(names).size).toBe(names.length);
  });

  it("marks share-link revoke and audience removal destructive, reads read-only", () => {
    const hints = (name: string) =>
      (tool(name).config.annotations ?? {}) as Record<string, boolean>;
    expect(hints("revoke_campaign_share_link").destructiveHint).toBe(true);
    expect(hints("remove_campaign_audience_prospects").destructiveHint).toBe(true);
    expect(hints("get_campaign_audience").readOnlyHint).toBe(true);
    expect(hints("create_campaign_share_link").readOnlyHint).toBeUndefined();
    expect(String(tool("create_campaign_share_link").config.description)).toMatch(/PUBLISHES/);
  });

  it("still groups cleanly (no field collides with the group's `action`)", async () => {
    const grouped = capture((s) => registerAsGroup(s, "campaigns", "blurb", registerCampaignTools));
    expect(grouped).toHaveLength(1);
    expect(grouped[0].name).toBe("campaigns");

    const fetchMock = mockFetch({ ok: true });
    const res = await grouped[0].handler({
      action: "update_campaign_ab_test",
      bearer_token: "t",
      id: CAMPAIGN,
      operation: "pause",
      node_id: "node-1",
      variant_id: "b",
    });
    expect(res.isError).toBeUndefined();
    expect(calledBody(fetchMock)).toEqual({ action: "pause", node_id: "node-1", variant_id: "b" });
  });
});

describe("campaign handlers", () => {
  it("get_campaign_audience → GET /campaigns/{id}/audience", async () => {
    const fetchMock = mockFetch({ lists: [] });
    const res = await tool("get_campaign_audience").handler({ bearer_token: "t", id: CAMPAIGN });
    expect(res.isError).toBeUndefined();
    expect(calledMethod(fetchMock)).toBe("GET");
    expect(calledUrl(fetchMock).pathname).toBe(`/api/v1/campaigns/${CAMPAIGN}/audience`);
  });

  it("list_campaign_audience_prospects forwards filters as query params", async () => {
    const fetchMock = mockFetch({ data: [] });
    await tool("list_campaign_audience_prospects").handler({
      bearer_token: "t",
      id: CAMPAIGN,
      page: 2,
      pageSize: 50,
      enrollment_status: "removed",
      source: "manual",
    });
    const url = calledUrl(fetchMock);
    expect(url.pathname).toBe(`/api/v1/campaigns/${CAMPAIGN}/audience/prospects`);
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("pageSize")).toBe("50");
    expect(url.searchParams.get("status")).toBe("removed");
    expect(url.searchParams.get("source")).toBe("manual");
    expect(url.searchParams.has("id")).toBe(false);
    expect(url.searchParams.has("bearer_token")).toBe(false);
  });

  it("add_campaign_audience_prospects → POST with only the audience fields", async () => {
    const fetchMock = mockFetch({ result: {} });
    await tool("add_campaign_audience_prospects").handler({
      bearer_token: "t",
      id: CAMPAIGN,
      prospect_ids: [OTHER],
      stage_keys: ["qualified"],
    });
    expect(calledMethod(fetchMock)).toBe("POST");
    expect(calledUrl(fetchMock).pathname).toBe(`/api/v1/campaigns/${CAMPAIGN}/audience/prospects`);
    // max-agent's body schema is .strict(): no id/bearer_token may leak into it.
    expect(calledBody(fetchMock)).toEqual({ prospect_ids: [OTHER], stage_keys: ["qualified"] });
  });

  it("remove_campaign_audience_prospects → POST .../audience/prospects/remove", async () => {
    const fetchMock = mockFetch({ result: {} });
    await tool("remove_campaign_audience_prospects").handler({
      bearer_token: "t",
      id: CAMPAIGN,
      prospect_ids: [OTHER],
    });
    expect(calledMethod(fetchMock)).toBe("POST");
    expect(calledUrl(fetchMock).pathname).toBe(
      `/api/v1/campaigns/${CAMPAIGN}/audience/prospects/remove`,
    );
    expect(calledBody(fetchMock)).toEqual({ prospect_ids: [OTHER] });
  });

  it("detach_campaign_audience_list → DELETE .../audience/lists/{listId}", async () => {
    const fetchMock = mockFetch({ message: "ok" });
    await tool("detach_campaign_audience_list").handler({
      bearer_token: "t",
      id: CAMPAIGN,
      list_id: LIST,
    });
    expect(calledMethod(fetchMock)).toBe("DELETE");
    expect(calledUrl(fetchMock).pathname).toBe(
      `/api/v1/campaigns/${CAMPAIGN}/audience/lists/${LIST}`,
    );
  });

  it("update_campaign_ab_test maps `operation` to the API's `action`", async () => {
    const fetchMock = mockFetch({ ok: true });
    await tool("update_campaign_ab_test").handler({
      bearer_token: "t",
      id: CAMPAIGN,
      operation: "set_weights",
      node_id: "node-1",
      weights: { a: 70, b: 30 },
    });
    expect(calledMethod(fetchMock)).toBe("PATCH");
    expect(calledUrl(fetchMock).pathname).toBe(`/api/v1/campaigns/${CAMPAIGN}/ab-tests`);
    expect(calledBody(fetchMock)).toEqual({
      action: "set_weights",
      node_id: "node-1",
      weights: { a: 70, b: 30 },
    });
  });

  it("duplicate_campaign → POST .../duplicate, empty body without a name", async () => {
    const fetchMock = mockFetch({ campaign: {} }, { status: 201 });
    await tool("duplicate_campaign").handler({ bearer_token: "t", id: CAMPAIGN });
    expect(calledMethod(fetchMock)).toBe("POST");
    expect(calledUrl(fetchMock).pathname).toBe(`/api/v1/campaigns/${CAMPAIGN}/duplicate`);
    expect(calledBody(fetchMock)).toEqual({});
  });

  it("get_campaign_feed forwards limit", async () => {
    const fetchMock = mockFetch({ data: [] });
    await tool("get_campaign_feed").handler({ bearer_token: "t", id: CAMPAIGN, limit: 5 });
    const url = calledUrl(fetchMock);
    expect(url.pathname).toBe(`/api/v1/campaigns/${CAMPAIGN}/feed`);
    expect(url.searchParams.get("limit")).toBe("5");
  });

  it("get_campaign_launch_preflight → GET .../launch/preflight", async () => {
    const fetchMock = mockFetch({ audience: 0 });
    await tool("get_campaign_launch_preflight").handler({ bearer_token: "t", id: CAMPAIGN });
    expect(calledUrl(fetchMock).pathname).toBe(
      `/api/v1/campaigns/${CAMPAIGN}/launch/preflight`,
    );
  });

  it("bulk_get_campaign_node_run_counts repeats ?id= per campaign", async () => {
    const fetchMock = mockFetch({ nodeRunCounts: {} });
    await tool("bulk_get_campaign_node_run_counts").handler({
      bearer_token: "t",
      ids: [CAMPAIGN, OTHER],
    });
    const url = calledUrl(fetchMock);
    expect(url.pathname).toBe("/api/v1/campaigns/node-run-counts");
    expect(url.searchParams.getAll("id")).toEqual([CAMPAIGN, OTHER]);
  });

  it("share link tools hit GET/POST/DELETE .../share-link", async () => {
    for (const [name, method] of [
      ["get_campaign_share_link", "GET"],
      ["create_campaign_share_link", "POST"],
      ["revoke_campaign_share_link", "DELETE"],
    ] as const) {
      const fetchMock = mockFetch({ data: null });
      await tool(name).handler({ bearer_token: "t", id: CAMPAIGN });
      expect(calledMethod(fetchMock)).toBe(method);
      expect(calledUrl(fetchMock).pathname).toBe(`/api/v1/campaigns/${CAMPAIGN}/share-link`);
      vi.unstubAllGlobals();
    }
  });

  it("surfaces upstream errors as isError", async () => {
    mockFetch({ error: "Forbidden" }, { status: 403 });
    const res = await tool("create_campaign_share_link").handler({ bearer_token: "t", id: CAMPAIGN });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/403/);
  });
});

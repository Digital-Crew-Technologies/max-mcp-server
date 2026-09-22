import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { z } from "zod";
import type { McpServer } from "@/features/pilot-tools/shared";
import { registerDealTools } from "@/features/pilot-tools/deals/tools";
import { registerAsGroup } from "@/features/pilot-tools/mcp/group-adapter";

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
  registerDealTools(server);
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

const DEAL = "11111111-1111-4111-8111-111111111111";
const STAGE = "22222222-2222-4222-8222-222222222222";
const PIPE = "33333333-3333-4333-8333-333333333333";
const OTHER = "44444444-4444-4444-8444-444444444444";

beforeEach(() => {
  process.env.DIGITALCREW_API_BASE_URL = "https://api.test";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("deal tool registration", () => {
  it("registers unique names that all say deal or sales (never crm_)", () => {
    const names = capture().map((t) => t.name);
    expect(names.length).toBe(35);
    expect(new Set(names).size).toBe(names.length);
    for (const n of names) {
      expect(n).toMatch(/deal|sales/);
      expect(n).not.toMatch(/^crm_/);
    }
  });

  it("marks reads read-only and deletes destructive", () => {
    const hints = (n: string) =>
      (tool(n).config.annotations ?? {}) as Record<string, boolean>;
    expect(hints("list_deals").readOnlyHint).toBe(true);
    expect(hints("get_sales_workspace").readOnlyHint).toBe(true);
    expect(hints("delete_deal").destructiveHint).toBe(true);
    expect(hints("remove_deal_line_item").destructiveHint).toBe(true);
    expect(hints("create_deal").readOnlyHint).toBeUndefined();
  });

  it("groups cleanly: no action field collides with the group discriminator", () => {
    // The stage-rule API field is literally `action`; the grouped tool uses
    // `action` as its discriminator. It must be exposed as `rule_action`.
    const server: McpServer & { tools: Captured[] } = {
      tools: [],
      registerTool(name, config, handler) {
        this.tools.push({ name, config, handler });
      },
    };
    expect(() => registerAsGroup(server, "deals", "Deals", registerDealTools)).not.toThrow();
    const strict = server.tools[0].config._strictInputSchema as z.ZodTypeAny;
    expect(
      strict.safeParse({ action: "create_deal_stage_rule", stage_id: STAGE, rule_action: "notify" }).success,
    ).toBe(true);
  });
});

describe("deal handlers hit the right max-agent routes", () => {
  it("list_deals → GET /api/v1/deals with filters as query params", async () => {
    const f = mockFetch({ data: [], count: 0 });
    await tool("list_deals").handler({
      bearer_token: "t",
      pipeline_id: PIPE,
      status: "open",
      has_close_date: false,
      pageSize: 50,
    });
    const url = calledUrl(f);
    expect(calledMethod(f)).toBe("GET");
    expect(url.pathname).toBe("/api/v1/deals");
    expect(url.searchParams.get("pipeline_id")).toBe(PIPE);
    expect(url.searchParams.get("status")).toBe("open");
    expect(url.searchParams.get("has_close_date")).toBe("false");
    expect(url.searchParams.get("pageSize")).toBe("50");
    expect(url.searchParams.has("bearer_token")).toBe(false);
    expect(fetchMockAuth(f)).toBe("Bearer t");
  });

  it("create_deal → POST /api/v1/deals with the body, never retried", async () => {
    const f = mockFetch({ error: "boom" }, { status: 503 });
    const res = await tool("create_deal").handler({
      bearer_token: "t",
      name: "Acme renewal",
      amount: 1200,
      prospect_ids: [OTHER],
    });
    expect(res.isError).toBe(true);
    expect(f).toHaveBeenCalledTimes(1);
    expect(calledMethod(f)).toBe("POST");
    expect(calledUrl(f).pathname).toBe("/api/v1/deals");
    expect(calledBody(f)).toEqual({ name: "Acme renewal", amount: 1200, prospect_ids: [OTHER] });
  });

  it("update_deal → PATCH /api/v1/deals/{id} without the path param in the body", async () => {
    const f = mockFetch({ data: {} });
    await tool("update_deal").handler({ bearer_token: "t", deal_id: DEAL, amount: 5 });
    expect(calledMethod(f)).toBe("PATCH");
    expect(calledUrl(f).pathname).toBe(`/api/v1/deals/${DEAL}`);
    expect(calledBody(f)).toEqual({ amount: 5 });
  });

  it("move_deal → POST /api/v1/deals/{id}/move {stage_id}", async () => {
    const f = mockFetch({ data: {} });
    await tool("move_deal").handler({ bearer_token: "t", deal_id: DEAL, stage_id: STAGE });
    expect(calledMethod(f)).toBe("POST");
    expect(calledUrl(f).pathname).toBe(`/api/v1/deals/${DEAL}/move`);
    expect(calledBody(f)).toEqual({ stage_id: STAGE });
  });

  it("remove_deal_prospect → DELETE /api/v1/deals/{id}/prospects/{prospectId}", async () => {
    const f = mockFetch({ success: true });
    await tool("remove_deal_prospect").handler({ bearer_token: "t", deal_id: DEAL, prospect_id: OTHER });
    expect(calledMethod(f)).toBe("DELETE");
    expect(calledUrl(f).pathname).toBe(`/api/v1/deals/${DEAL}/prospects/${OTHER}`);
  });

  it("list_deal_pipelines → GET /api/v1/deals/pipelines?includeArchived=true", async () => {
    const f = mockFetch({ data: [] });
    await tool("list_deal_pipelines").handler({ bearer_token: "t", includeArchived: true });
    expect(calledUrl(f).pathname).toBe("/api/v1/deals/pipelines");
    expect(calledUrl(f).searchParams.get("includeArchived")).toBe("true");
  });

  it("delete_deal_stage → DELETE /api/v1/deals/stages/{id}?reassignTo=", async () => {
    const f = mockFetch({ success: true });
    await tool("delete_deal_stage").handler({ bearer_token: "t", stage_id: STAGE, reassignTo: OTHER });
    expect(calledMethod(f)).toBe("DELETE");
    expect(calledUrl(f).pathname).toBe(`/api/v1/deals/stages/${STAGE}`);
    expect(calledUrl(f).searchParams.get("reassignTo")).toBe(OTHER);
  });

  it("create_deal_stage_rule maps rule_action → action", async () => {
    const f = mockFetch({ data: {} }, { status: 201 });
    await tool("create_deal_stage_rule").handler({
      bearer_token: "t",
      stage_id: STAGE,
      rule_action: "enroll_campaign",
      config: { campaign_id: OTHER },
    });
    expect(calledMethod(f)).toBe("POST");
    expect(calledUrl(f).pathname).toBe(`/api/v1/deals/stages/${STAGE}/rules`);
    expect(calledBody(f)).toEqual({ action: "enroll_campaign", config: { campaign_id: OTHER } });
  });

  it("update_deal_stage_rule omits action when rule_action is not given", async () => {
    const f = mockFetch({ data: {} });
    await tool("update_deal_stage_rule").handler({ bearer_token: "t", rule_id: OTHER, is_enabled: false });
    expect(calledMethod(f)).toBe("PATCH");
    expect(calledUrl(f).pathname).toBe(`/api/v1/deals/rules/${OTHER}`);
    expect(calledBody(f)).toEqual({ is_enabled: false });
  });
});

describe("sales workspace & catalog handlers", () => {
  it("get_sales_workspace → GET /api/v1/sales-workspace?limit=", async () => {
    const f = mockFetch({ nodes: [], edges: [], notices: [], updatedAt: "x" });
    await tool("get_sales_workspace").handler({ bearer_token: "t", limit: 10 });
    expect(calledUrl(f).pathname).toBe("/api/v1/sales-workspace");
    expect(calledUrl(f).searchParams.get("limit")).toBe("10");
  });

  it("update_sales_catalog_item → PATCH /api/v1/sales-catalog/{id}", async () => {
    const f = mockFetch({ data: {} });
    await tool("update_sales_catalog_item").handler({
      bearer_token: "t",
      catalog_item_id: OTHER,
      name: "Onboarding",
      kind: "service",
      expected_updated_at: "2026-09-01T00:00:00Z",
    });
    expect(calledMethod(f)).toBe("PATCH");
    expect(calledUrl(f).pathname).toBe(`/api/v1/sales-catalog/${OTHER}`);
    expect(calledBody(f)).toEqual({
      name: "Onboarding",
      kind: "service",
      expected_updated_at: "2026-09-01T00:00:00Z",
    });
  });

  it("add_deal_line_item → POST /api/v1/sales-catalog/deals/{dealId}/items with a generated id", async () => {
    const f = mockFetch({ data: {} }, { status: 201 });
    await tool("add_deal_line_item").handler({
      bearer_token: "t",
      deal_id: DEAL,
      offering_id: OTHER,
      unit_price: 99.5,
      currency: "EUR",
    });
    expect(calledMethod(f)).toBe("POST");
    expect(calledUrl(f).pathname).toBe(`/api/v1/sales-catalog/deals/${DEAL}/items`);
    const body = calledBody(f);
    expect(body).toMatchObject({ offering_id: OTHER, unit_price: 99.5, currency: "EUR" });
    expect(z.string().uuid().safeParse(body.id).success).toBe(true);
    expect(body).not.toHaveProperty("deal_id");
  });

  it("add_deal_line_item keeps a caller-supplied id", async () => {
    const f = mockFetch({ data: {} }, { status: 201 });
    await tool("add_deal_line_item").handler({
      bearer_token: "t",
      deal_id: DEAL,
      offering_id: OTHER,
      unit_price: 1,
      currency: "EUR",
      id: STAGE,
    });
    expect(calledBody(f).id).toBe(STAGE);
  });

  it("remove_deal_line_item → DELETE /api/v1/sales-catalog/deals/{dealId}/items/{itemId}", async () => {
    const f = mockFetch({ data: { id: OTHER } });
    await tool("remove_deal_line_item").handler({ bearer_token: "t", deal_id: DEAL, line_item_id: OTHER });
    expect(calledMethod(f)).toBe("DELETE");
    expect(calledUrl(f).pathname).toBe(`/api/v1/sales-catalog/deals/${DEAL}/items/${OTHER}`);
  });
});

function fetchMockAuth(fetchMock: ReturnType<typeof mockFetch>): string | undefined {
  const headers = fetchMock.mock.calls[0][1]?.headers as Record<string, string> | undefined;
  return headers?.Authorization;
}

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { McpServer } from "@/features/pilot-tools/shared";
import {
  registerDealsTools,
  DEALS_CAPABILITIES,
} from "@/features/pilot-tools/deals/tools";
import * as repo from "@/features/pilot-tools/deals/repository";

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
  registerDealsTools(server);
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

function calledBody(fetchMock: ReturnType<typeof mockFetch>): Record<string, unknown> {
  return JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
}

beforeEach(() => {
  process.env.DIGITALCREW_API_BASE_URL = "https://api.test";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const DEAL_ID = "11111111-1111-1111-1111-111111111111";
const STAGE_ID = "22222222-2222-2222-2222-222222222222";
const PROSPECT_ID = "33333333-3333-3333-3333-333333333333";
const PIPELINE_ID = "44444444-4444-4444-4444-444444444444";

describe("deals tool registration", () => {
  it("registers ONE grouped `deals` tool and nothing flat", () => {
    expect(capture().map((t) => t.name)).toEqual(["deals"]);
  });

  it("rejects an unknown action rather than silently doing nothing", async () => {
    const res = await tool("deals").handler({
      action: "not_a_real_action",
      bearer_token: "t",
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("Unknown action");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The surface is deliberately partial: no delete, no board management. A
// delete action would erase history from a tool; pipeline/stage/rule layout is
// workspace configuration owned by humans in settings.
// ─────────────────────────────────────────────────────────────────────────────

describe("deals surface boundaries", () => {
  it("offers no delete action and no pipeline/stage management", async () => {
    for (const action of [
      "delete",
      "delete_deal",
      "create_pipeline",
      "update_pipeline",
      "delete_pipeline",
      "create_stage",
      "update_stage",
      "delete_stage",
      "reorder_stages",
      "create_rule",
    ]) {
      const res = await tool("deals").handler({ action, bearer_token: "t" });
      expect(res.isError, `action "${action}" exists`).toBe(true);
    }
  });

  it("exports no delete or pipeline-mutation function from the repository", () => {
    for (const name of Object.keys(repo)) {
      expect(name).not.toMatch(/delete|remove(?!Contact)|createPipeline|createStage/i);
    }
  });
});

describe("deals tenancy", () => {
  it("has no workspace/tenant argument on any tool — the bearer decides", () => {
    for (const t of capture()) {
      const schema = JSON.stringify(t.config.inputSchema ?? {});
      expect(schema, `${t.name} exposes a tenant selector`).not.toMatch(
        /workspace_?[Ii]d|tenant_?[Ii]d/,
      );
    }
  });
});

describe("deals capability names", () => {
  it("covers every action with read/write split", () => {
    expect(DEALS_CAPABILITIES).toEqual({
      "deals.list": "deals.read",
      "deals.get": "deals.read",
      "deals.create": "deals.write",
      "deals.update": "deals.write",
      "deals.move_stage": "deals.write",
      "deals.win": "deals.write",
      "deals.lose": "deals.write",
      "deals.list_stage_events": "deals.read",
      "deals.add_contact": "deals.write",
      "deals.remove_contact": "deals.write",
      "deals.board_totals": "deals.read",
      "deals.list_pipelines": "deals.read",
    });
  });
});

describe("deals reads", () => {
  it("maps snake_case list args onto the API's mixed-case query params", async () => {
    const fetchMock = mockFetch({ data: [], count: 0, page: 1, pageSize: 20 });
    await tool("deals").handler({
      action: "list",
      bearer_token: "t",
      pipeline_id: PIPELINE_ID,
      status: "open",
      page: 2,
      page_size: 50,
      sort_by: "amount",
      sort_order: "asc",
    });
    const url = calledUrl(fetchMock);
    expect(url.pathname).toBe("/api/v1/deals");
    expect(url.searchParams.get("pipeline_id")).toBe(PIPELINE_ID);
    expect(url.searchParams.get("status")).toBe("open");
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("pageSize")).toBe("50");
    expect(url.searchParams.get("sortBy")).toBe("amount");
    expect(url.searchParams.get("sortOrder")).toBe("asc");
  });

  it("sends prospect_id as a filter param, not a tenant selector", async () => {
    const fetchMock = mockFetch({ data: [], count: 0, page: 1, pageSize: 20 });
    await tool("deals").handler({
      action: "list",
      bearer_token: "t",
      prospect_id: PROSPECT_ID,
    });
    expect(calledUrl(fetchMock).searchParams.get("prospect_id")).toBe(PROSPECT_ID);
  });

  it("reads one deal, its stage history, board totals and pipelines", async () => {
    for (const [input, path] of [
      [{ action: "get", id: DEAL_ID }, `/api/v1/deals/${DEAL_ID}`],
      [
        { action: "list_stage_events", id: DEAL_ID },
        `/api/v1/deals/${DEAL_ID}/stage-events`,
      ],
      [
        { action: "board_totals", pipeline_id: PIPELINE_ID },
        "/api/v1/deals/board-totals",
      ],
      [{ action: "list_pipelines" }, "/api/v1/deals/pipelines"],
    ] as const) {
      const fetchMock = mockFetch({ data: {} });
      await tool("deals").handler({ ...input, bearer_token: "t" });
      expect(calledUrl(fetchMock).pathname).toBe(path);
      vi.unstubAllGlobals();
    }
  });
});

describe("deals writes", () => {
  it("creates with the caller's fields and never leaks bearer_token", async () => {
    const fetchMock = mockFetch({ data: { id: DEAL_ID } }, { status: 201 });
    await tool("deals").handler({
      action: "create",
      bearer_token: "secret-token",
      name: "Acme renewal",
      amount: 12000,
      currency: "EUR",
      prospect_ids: [PROSPECT_ID],
    });
    const body = calledBody(fetchMock);
    expect(body.name).toBe("Acme renewal");
    expect(body.amount).toBe(12000);
    expect(body.prospect_ids).toEqual([PROSPECT_ID]);
    expect(body).not.toHaveProperty("bearer_token");
    expect(body).not.toHaveProperty("action");
  });

  it("preserves an explicit null on update (clears the field) but drops unsent keys", async () => {
    const fetchMock = mockFetch({ data: { id: DEAL_ID } });
    await tool("deals").handler({
      action: "update",
      bearer_token: "t",
      id: DEAL_ID,
      close_date: null,
    });
    const body = calledBody(fetchMock);
    expect(body).toEqual({ close_date: null });
  });

  it("does not accept a stage move through update — move_stage owns that", async () => {
    const fetchMock = mockFetch({ data: { id: DEAL_ID } });
    await tool("deals").handler({
      action: "update",
      bearer_token: "t",
      id: DEAL_ID,
      name: "x",
      stage_id: STAGE_ID,
    });
    expect(calledBody(fetchMock)).not.toHaveProperty("stage_id");
  });

  it("moves, wins and loses through the dedicated routes", async () => {
    let fetchMock = mockFetch({ data: { id: DEAL_ID } });
    await tool("deals").handler({
      action: "move_stage",
      bearer_token: "t",
      id: DEAL_ID,
      stage_id: STAGE_ID,
    });
    expect(calledUrl(fetchMock).pathname).toBe(`/api/v1/deals/${DEAL_ID}/move`);
    expect(calledBody(fetchMock)).toEqual({ stage_id: STAGE_ID });
    vi.unstubAllGlobals();

    fetchMock = mockFetch({ data: { id: DEAL_ID } });
    await tool("deals").handler({ action: "win", bearer_token: "t", id: DEAL_ID });
    expect(calledUrl(fetchMock).pathname).toBe(`/api/v1/deals/${DEAL_ID}/win`);
    vi.unstubAllGlobals();

    fetchMock = mockFetch({ data: { id: DEAL_ID } });
    await tool("deals").handler({
      action: "lose",
      bearer_token: "t",
      id: DEAL_ID,
      lost_reason: "Went with a competitor",
    });
    expect(calledUrl(fetchMock).pathname).toBe(`/api/v1/deals/${DEAL_ID}/lose`);
    expect(calledBody(fetchMock)).toEqual({ lost_reason: "Went with a competitor" });
  });

  it("adds and removes contacts on the association routes", async () => {
    let fetchMock = mockFetch({ data: {} }, { status: 201 });
    await tool("deals").handler({
      action: "add_contact",
      bearer_token: "t",
      id: DEAL_ID,
      prospect_id: PROSPECT_ID,
      role: "Champion",
    });
    expect(calledUrl(fetchMock).pathname).toBe(`/api/v1/deals/${DEAL_ID}/prospects`);
    expect(calledBody(fetchMock)).toEqual({
      prospect_id: PROSPECT_ID,
      role: "Champion",
    });
    vi.unstubAllGlobals();

    fetchMock = mockFetch({ success: true });
    await tool("deals").handler({
      action: "remove_contact",
      bearer_token: "t",
      id: DEAL_ID,
      prospect_id: PROSPECT_ID,
    });
    expect(calledUrl(fetchMock).pathname).toBe(
      `/api/v1/deals/${DEAL_ID}/prospects/${PROSPECT_ID}`,
    );
    expect(fetchMock.mock.calls[0][1]?.method).toBe("DELETE");
  });
});

describe("deals error handling", () => {
  it("surfaces a 409 (no won stage) as an error, not an empty result", async () => {
    mockFetch({ error: "Pipeline has no won stage" }, { status: 409 });
    const res = await tool("deals").handler({
      action: "win",
      bearer_token: "t",
      id: DEAL_ID,
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("409");
  });

  it("never echoes bearer material out of an upstream error body", async () => {
    mockFetch("upstream said: Authorization: Bearer sk-live-supersecret", {
      status: 500,
    });
    const res = await tool("deals").handler({
      action: "list",
      bearer_token: "t",
    });
    expect(res.content[0].text).not.toContain("sk-live-supersecret");
    expect(res.content[0].text).toContain("[redacted]");
  });
});

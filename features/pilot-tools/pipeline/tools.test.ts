import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { z } from "zod";
import type { McpServer } from "@/features/pilot-tools/shared";
import { registerPipelineTools } from "@/features/pilot-tools/pipeline/tools";
import { registerAsGroup } from "@/features/pilot-tools/mcp/group-adapter";
import * as S from "@/features/pilot-tools/pipeline/schema";

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
  registerPipelineTools(server);
  return tools;
}

/** The registered tool, with a bearer token supplied unless the test passes one. */
function tool(name: string): Captured {
  const found = capture().find((t) => t.name === name);
  if (!found) throw new Error(`tool "${name}" was not registered`);
  return { ...found, handler: (input) => found.handler({ bearer_token: "t", ...input }) };
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

const calledUrl = (f: ReturnType<typeof mockFetch>) => new URL(f.mock.calls[0][0]);
const calledMethod = (f: ReturnType<typeof mockFetch>) => f.mock.calls[0][1]?.method ?? "GET";
const calledBody = (f: ReturnType<typeof mockFetch>) =>
  JSON.parse(f.mock.calls[0][1]?.body as string) as Record<string, unknown>;

const UUID = "11111111-1111-1111-1111-111111111111";
const UUID2 = "22222222-2222-2222-2222-222222222222";
const FINGERPRINT = "a".repeat(64);

beforeEach(() => {
  process.env.DIGITALCREW_API_BASE_URL = "https://api.test";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("pipeline tool registration", () => {
  it("registers only pipeline_-prefixed tools, none for webhooks or transfer destinations", () => {
    const names = capture().map((t) => t.name);
    expect(names.length).toBeGreaterThan(30);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) {
      expect(name).toMatch(/^pipeline_[a-z_]+$/);
      expect(name).not.toMatch(/webhook|transfer/);
    }
  });

  it("never declares a top-level `action` arg (reserved for the grouped discriminator)", () => {
    for (const t of capture()) {
      const shape = (t.config.inputSchema as z.AnyZodObject).shape;
      expect(Object.keys(shape), t.name).not.toContain("action");
    }
  });

  it("annotates reads as read-only and deletes / publish / rollback as destructive", () => {
    const hints = (name: string) =>
      (tool(name).config.annotations ?? {}) as Record<string, boolean>;
    expect(hints("pipeline_get_canvas").readOnlyHint).toBe(true);
    expect(hints("pipeline_list_stages").readOnlyHint).toBe(true);
    for (const name of [
      "pipeline_delete_pipeline",
      "pipeline_delete_stage",
      "pipeline_delete_stage_rule",
      "pipeline_delete_link",
      "pipeline_delete_campaign_route",
      "pipeline_delete_canvas_draft",
      "pipeline_publish_canvas_draft",
      "pipeline_rollback_canvas_publication",
    ]) {
      expect(hints(name).destructiveHint, name).toBe(true);
    }
  });
});

describe("grouped registration", () => {
  it("collapses into one `pipeline` tool whose strict union keeps rule_action", async () => {
    const grouped: Captured[] = [];
    registerAsGroup(
      { registerTool: (name, config, handler) => grouped.push({ name, config, handler }) },
      "pipeline",
      "Pipelines",
      registerPipelineTools,
    );
    expect(grouped.map((t) => t.name)).toEqual(["pipeline"]);
    const strict = grouped[0].config._strictInputSchema as z.ZodTypeAny;
    const input = {
      action: "pipeline_create_stage_rule",
      stage_id: UUID,
      rule_action: "notify",
      config: {},
    };
    expect(strict.safeParse(input).success).toBe(true);

    const f = mockFetch({ data: {} }, { status: 201 });
    const res = await grouped[0].handler({ ...input, bearer_token: "t" });
    expect(res.isError).toBeUndefined();
    expect(calledUrl(f).pathname).toBe(`/api/v1/pipeline/stages/${UUID}/rules`);
    expect(calledBody(f)).toEqual({ action: "notify", config: {} });
  });
});

describe("pipeline handlers", () => {
  it("pipeline_list_pipelines → GET /pipeline/pipelines?includeArchived", async () => {
    const f = mockFetch({ data: [] });
    const res = await tool("pipeline_list_pipelines").handler({ include_archived: true });
    expect(res.isError).toBeUndefined();
    expect(calledMethod(f)).toBe("GET");
    expect(calledUrl(f).pathname).toBe("/api/v1/pipeline/pipelines");
    expect(calledUrl(f).searchParams.get("includeArchived")).toBe("true");
  });

  it("pipeline_list_stages maps pipeline_id to the pipelineId query param", async () => {
    const f = mockFetch({ data: [] });
    await tool("pipeline_list_stages").handler({ pipeline_id: UUID });
    expect(calledUrl(f).pathname).toBe("/api/v1/pipeline/stages");
    expect(calledUrl(f).searchParams.get("pipelineId")).toBe(UUID);
    expect(calledUrl(f).searchParams.has("includeArchived")).toBe(false);
  });

  it("pipeline_update_stage → PATCH /stages/:id with the patch only", async () => {
    const f = mockFetch({ data: {} });
    await tool("pipeline_update_stage").handler({
      bearer_token: "tok",
      stage_id: UUID,
      label: "Qualified",
      color: "teal",
    });
    expect(calledMethod(f)).toBe("PATCH");
    expect(calledUrl(f).pathname).toBe(`/api/v1/pipeline/stages/${UUID}`);
    expect(calledBody(f)).toEqual({ label: "Qualified", color: "teal" });
  });

  it("pipeline_delete_stage passes reassign_to as reassignTo", async () => {
    const f = mockFetch({ success: true });
    await tool("pipeline_delete_stage").handler({ stage_id: UUID, reassign_to: UUID2 });
    expect(calledMethod(f)).toBe("DELETE");
    expect(calledUrl(f).pathname).toBe(`/api/v1/pipeline/stages/${UUID}`);
    expect(calledUrl(f).searchParams.get("reassignTo")).toBe(UUID2);
  });

  it("pipeline_reorder_stages → PATCH /stages/reorder", async () => {
    const f = mockFetch({ data: [] });
    await tool("pipeline_reorder_stages").handler({ ordered_ids: [UUID2, UUID] });
    expect(calledMethod(f)).toBe("PATCH");
    expect(calledUrl(f).pathname).toBe("/api/v1/pipeline/stages/reorder");
    expect(calledBody(f)).toEqual({ ordered_ids: [UUID2, UUID] });
  });

  it("pipeline_create_stage_rule sends rule_action as the API's `action` field", async () => {
    const f = mockFetch({ data: {} }, { status: 201 });
    await tool("pipeline_create_stage_rule").handler({
      stage_id: UUID,
      rule_action: "enroll_campaign",
      config: { campaign_id: UUID2 },
    });
    expect(calledMethod(f)).toBe("POST");
    expect(calledUrl(f).pathname).toBe(`/api/v1/pipeline/stages/${UUID}/rules`);
    expect(calledBody(f)).toEqual({ action: "enroll_campaign", config: { campaign_id: UUID2 } });
  });

  it("pipeline_update_stage_rule omits `action` when rule_action is not given", async () => {
    const f = mockFetch({ data: {} });
    await tool("pipeline_update_stage_rule").handler({ rule_id: UUID, is_enabled: false });
    expect(calledMethod(f)).toBe("PATCH");
    expect(calledUrl(f).pathname).toBe(`/api/v1/pipeline/rules/${UUID}`);
    expect(calledBody(f)).toEqual({ is_enabled: false });
  });

  it("pipeline_preview_rule_assignment → GET /rules/:id/assignment-preview?at", async () => {
    const f = mockFetch({ data: {} });
    await tool("pipeline_preview_rule_assignment").handler({
      rule_id: UUID,
      at: "2026-09-28T09:00:00Z",
    });
    expect(calledUrl(f).pathname).toBe(`/api/v1/pipeline/rules/${UUID}/assignment-preview`);
    expect(calledUrl(f).searchParams.get("at")).toBe("2026-09-28T09:00:00Z");
  });

  it("pipeline_delete_placement addresses the node by kind + ref_id query", async () => {
    const f = mockFetch({ success: true });
    await tool("pipeline_delete_placement").handler({ kind: "campaign", ref_id: UUID });
    expect(calledMethod(f)).toBe("DELETE");
    expect(calledUrl(f).pathname).toBe("/api/v1/pipeline/placements");
    expect(calledUrl(f).searchParams.get("kind")).toBe("campaign");
    expect(calledUrl(f).searchParams.get("ref_id")).toBe(UUID);
  });

  it("pipeline_create_campaign_route → POST /campaign-routes", async () => {
    const f = mockFetch({ data: {} }, { status: 201 });
    await tool("pipeline_create_campaign_route").handler({
      campaign_id: UUID,
      outcome: "replied",
      to_stage_id: UUID2,
    });
    expect(calledMethod(f)).toBe("POST");
    expect(calledUrl(f).pathname).toBe("/api/v1/pipeline/campaign-routes");
    expect(calledBody(f)).toEqual({ campaign_id: UUID, outcome: "replied", to_stage_id: UUID2 });
  });

  it("pipeline_get_prospect_journey → GET /journey?prospect_id", async () => {
    const f = mockFetch({ data: {} });
    await tool("pipeline_get_prospect_journey").handler({ prospect_id: UUID });
    expect(calledUrl(f).pathname).toBe("/api/v1/pipeline/journey");
    expect(calledUrl(f).searchParams.get("prospect_id")).toBe(UUID);
  });

  it("surfaces upstream errors as isError", async () => {
    mockFetch({ error: "Pipeline not found" }, { status: 404 });
    const res = await tool("pipeline_get_pipeline").handler({ pipeline_id: UUID });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("404");
  });
});

describe("change-set (canvas draft) tools", () => {
  it("keeps each operation's type-specific fields through schema parsing", async () => {
    const parsed = S.updateCanvasDraftSchema.parse({
      draft_id: UUID,
      expected_revision: 3,
      definition: {
        version: 2,
        scope: "production_topology",
        base: { fingerprint: FINGERPRINT, captured_at: "2026-09-22T10:00:00.000Z" },
        changes: [
          {
            operation_id: UUID2,
            type: "stage.update",
            stage_id: UUID,
            patch: { label: "Hot" },
          },
        ],
      },
    });
    const f = mockFetch({ data: {} });
    await tool("pipeline_update_canvas_draft").handler(parsed);
    expect(calledMethod(f)).toBe("PATCH");
    expect(calledUrl(f).pathname).toBe(`/api/v1/pipeline/canvas-drafts/${UUID}`);
    const body = calledBody(f) as {
      expected_revision: number;
      definition: { changes: Array<Record<string, unknown>> };
    };
    expect(body.expected_revision).toBe(3);
    expect(body).not.toHaveProperty("draft_id");
    expect(body.definition.changes[0]).toEqual({
      operation_id: UUID2,
      type: "stage.update",
      stage_id: UUID,
      patch: { label: "Hot" },
    });
  });

  it("rejects an unknown operation type", () => {
    const res = S.updateCanvasDraftSchema.safeParse({
      draft_id: UUID,
      expected_revision: 1,
      definition: {
        version: 2,
        scope: "production_topology",
        base: { fingerprint: FINGERPRINT, captured_at: "2026-09-22T10:00:00.000Z" },
        changes: [{ operation_id: UUID2, type: "pipeline.delete" }],
      },
    });
    expect(res.success).toBe(false);
  });

  it("pipeline_publish_canvas_draft → POST /canvas-drafts/:id/publish", async () => {
    const f = mockFetch({ data: { status: "published" } });
    await tool("pipeline_publish_canvas_draft").handler({
      draft_id: UUID,
      expected_revision: 4,
      idempotency_key: UUID2,
      reason: "Route replies to Hot",
    });
    expect(calledMethod(f)).toBe("POST");
    expect(calledUrl(f).pathname).toBe(`/api/v1/pipeline/canvas-drafts/${UUID}/publish`);
    expect(calledBody(f)).toEqual({
      expected_revision: 4,
      idempotency_key: UUID2,
      reason: "Route replies to Hot",
    });
  });

  it("pipeline_rollback_canvas_publication → POST .../publications/:pid/rollback", async () => {
    const f = mockFetch({ data: {} }, { status: 201 });
    await tool("pipeline_rollback_canvas_publication").handler({
      draft_id: UUID,
      publication_id: UUID2,
    });
    expect(calledMethod(f)).toBe("POST");
    expect(calledUrl(f).pathname).toBe(
      `/api/v1/pipeline/canvas-drafts/${UUID}/publications/${UUID2}/rollback`,
    );
  });

  it("pipeline_create_canvas_draft is not retried (a retry would duplicate it)", async () => {
    const f = mockFetch({ error: "busy" }, { status: 503 });
    const res = await tool("pipeline_create_canvas_draft").handler({ name: "Q4 routing" });
    expect(res.isError).toBe(true);
    expect(f).toHaveBeenCalledTimes(1);
  });
});

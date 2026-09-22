import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { z } from "zod";
import type { McpServer } from "@/features/pilot-tools/shared";
import { registerPipelineWebhookTools } from "@/features/pilot-tools/pipeline-webhooks/tools";

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
  registerPipelineWebhookTools(server);
  return tools;
}

function tool(name: string): Captured {
  const found = capture().find((t) => t.name === name);
  if (!found) throw new Error(`tool "${name}" was not registered`);
  return found;
}

function schemaOf(name: string): z.ZodTypeAny {
  return tool(name).config.inputSchema as z.ZodTypeAny;
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

function calledMethod(fetchMock: ReturnType<typeof mockFetch>): string | undefined {
  return fetchMock.mock.calls[0][1]?.method;
}

const WEBHOOK = "11111111-1111-1111-1111-111111111111";
const STAGE = "22222222-2222-2222-2222-222222222222";
const ROUTE = "33333333-3333-3333-3333-333333333333";
const DELIVERY = "44444444-4444-4444-4444-444444444444";
const T = { bearer_token: "tok" };

beforeEach(() => {
  process.env.DIGITALCREW_API_BASE_URL = "https://api.test";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("registration", () => {
  it("registers exactly the pipeline webhook + route tools", () => {
    expect(capture().map((t) => t.name).sort()).toEqual(
      [
        "pipeline_webhook_create",
        "pipeline_webhook_delete",
        "pipeline_webhook_get",
        "pipeline_webhook_list",
        "pipeline_webhook_list_deliveries",
        "pipeline_webhook_replay_delivery",
        "pipeline_webhook_rotate",
        "pipeline_webhook_route_create",
        "pipeline_webhook_route_delete",
        "pipeline_webhook_route_list",
        "pipeline_webhook_route_reorder",
        "pipeline_webhook_route_update",
        "pipeline_webhook_test",
        "pipeline_webhook_update",
      ].sort(),
    );
  });

  it("exposes no outbound-subscription tool (max-agent refuses API keys there)", () => {
    for (const t of capture()) {
      expect(t.name).not.toMatch(/^webhook_/);
    }
  });

  it("marks reads read-only and deletes/rotation destructive", () => {
    const hints = (name: string) =>
      (tool(name).config.annotations ?? {}) as Record<string, boolean>;
    expect(hints("pipeline_webhook_list").readOnlyHint).toBe(true);
    expect(hints("pipeline_webhook_list_deliveries").readOnlyHint).toBe(true);
    expect(hints("pipeline_webhook_delete").destructiveHint).toBe(true);
    expect(hints("pipeline_webhook_rotate").destructiveHint).toBe(true);
    expect(hints("pipeline_webhook_route_delete").destructiveHint).toBe(true);
  });

  it("warns that secret-returning tools show the secret once", () => {
    for (const name of [
      "pipeline_webhook_create",
      "pipeline_webhook_update",
      "pipeline_webhook_rotate",
    ]) {
      expect(String(tool(name).config.description)).toMatch(/ONLY in this response/);
    }
  });
});

describe("pipeline webhook endpoints", () => {
  it("pipeline_webhook_list → GET /api/v1/pipeline/webhooks", async () => {
    const fetchMock = mockFetch({ data: [] });
    const res = await tool("pipeline_webhook_list").handler(T);
    expect(res.isError).toBeUndefined();
    expect(calledMethod(fetchMock) ?? "GET").toBe("GET");
    expect(calledUrl(fetchMock).pathname).toBe("/api/v1/pipeline/webhooks");
  });

  it("pipeline_webhook_get → GET /pipeline/webhooks/:id", async () => {
    const fetchMock = mockFetch({ data: {} });
    await tool("pipeline_webhook_get").handler({ ...T, webhook_id: WEBHOOK });
    expect(calledUrl(fetchMock).pathname).toBe(`/api/v1/pipeline/webhooks/${WEBHOOK}`);
  });

  it("pipeline_webhook_create → POST body without bearer_token", async () => {
    const fetchMock = mockFetch({ data: { secret: "s" } }, { status: 201 });
    await tool("pipeline_webhook_create").handler({
      ...T,
      name: "Website form",
      auth_mode: "token",
      to_stage_id: STAGE,
    });
    expect(calledMethod(fetchMock)).toBe("POST");
    expect(calledUrl(fetchMock).pathname).toBe("/api/v1/pipeline/webhooks");
    expect(calledBody(fetchMock)).toEqual({
      name: "Website form",
      auth_mode: "token",
      to_stage_id: STAGE,
    });
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({
      Authorization: "Bearer tok",
    });
  });

  it("pipeline_webhook_update → PATCH /:id with the id stripped from the body", async () => {
    const fetchMock = mockFetch({ data: {} });
    await tool("pipeline_webhook_update").handler({
      ...T,
      webhook_id: WEBHOOK,
      is_enabled: false,
      field_mapping: { email: "data.contact.email" },
    });
    expect(calledMethod(fetchMock)).toBe("PATCH");
    expect(calledUrl(fetchMock).pathname).toBe(`/api/v1/pipeline/webhooks/${WEBHOOK}`);
    expect(calledBody(fetchMock)).toEqual({
      is_enabled: false,
      field_mapping: { email: "data.contact.email" },
    });
  });

  it("pipeline_webhook_delete → DELETE /:id", async () => {
    const fetchMock = mockFetch({ data: { id: WEBHOOK } });
    await tool("pipeline_webhook_delete").handler({ ...T, webhook_id: WEBHOOK });
    expect(calledMethod(fetchMock)).toBe("DELETE");
    expect(calledUrl(fetchMock).pathname).toBe(`/api/v1/pipeline/webhooks/${WEBHOOK}`);
  });

  it("pipeline_webhook_rotate → POST /:id/rotate with target", async () => {
    const fetchMock = mockFetch({ data: { secret: "s" } });
    await tool("pipeline_webhook_rotate").handler({ ...T, webhook_id: WEBHOOK, target: "url" });
    expect(calledMethod(fetchMock)).toBe("POST");
    expect(calledUrl(fetchMock).pathname).toBe(`/api/v1/pipeline/webhooks/${WEBHOOK}/rotate`);
    expect(calledBody(fetchMock)).toEqual({ target: "url" });
  });

  it("rotate only accepts auth modes that carry material", () => {
    const schema = schemaOf("pipeline_webhook_rotate");
    expect(schema.safeParse({ webhook_id: WEBHOOK, auth_mode: "hmac" }).success).toBe(true);
    expect(schema.safeParse({ webhook_id: WEBHOOK, auth_mode: "none" }).success).toBe(false);
  });

  it("pipeline_webhook_test → POST /:id/test with payload and dry_run", async () => {
    const fetchMock = mockFetch({ data: { dry_run: true } });
    await tool("pipeline_webhook_test").handler({
      ...T,
      webhook_id: WEBHOOK,
      payload: { email: "jane@acme.com" },
      dry_run: true,
    });
    expect(calledMethod(fetchMock)).toBe("POST");
    expect(calledUrl(fetchMock).pathname).toBe(`/api/v1/pipeline/webhooks/${WEBHOOK}/test`);
    expect(calledBody(fetchMock)).toEqual({
      payload: { email: "jane@acme.com" },
      dry_run: true,
    });
  });

  it("pipeline_webhook_list_deliveries → GET /:id/deliveries with query", async () => {
    const fetchMock = mockFetch({ data: [], count: 0 });
    await tool("pipeline_webhook_list_deliveries").handler({
      ...T,
      webhook_id: WEBHOOK,
      page: 2,
      pageSize: 50,
      status: "unmatched",
    });
    const url = calledUrl(fetchMock);
    expect(url.pathname).toBe(`/api/v1/pipeline/webhooks/${WEBHOOK}/deliveries`);
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("pageSize")).toBe("50");
    expect(url.searchParams.get("status")).toBe("unmatched");
    expect(url.searchParams.has("webhook_id")).toBe(false);
  });

  it("pipeline_webhook_replay_delivery → POST /:id/deliveries/:deliveryId/replay", async () => {
    const fetchMock = mockFetch({ data: {} });
    await tool("pipeline_webhook_replay_delivery").handler({
      ...T,
      webhook_id: WEBHOOK,
      delivery_id: DELIVERY,
      dry_run: true,
    });
    expect(calledMethod(fetchMock)).toBe("POST");
    expect(calledUrl(fetchMock).pathname).toBe(
      `/api/v1/pipeline/webhooks/${WEBHOOK}/deliveries/${DELIVERY}/replay`,
    );
    expect(calledBody(fetchMock)).toEqual({ dry_run: true });
  });

  it.each([
    ["pipeline_webhook_create", { name: "x" }],
    ["pipeline_webhook_update", { webhook_id: WEBHOOK, auth_mode: "hmac" }],
    ["pipeline_webhook_rotate", { webhook_id: WEBHOOK }],
    ["pipeline_webhook_test", { webhook_id: WEBHOOK, payload: {}, dry_run: false }],
    ["pipeline_webhook_replay_delivery", { webhook_id: WEBHOOK, delivery_id: DELIVERY }],
  ])("%s is never retried (one-time secret / prospect writes)", async (name, input) => {
    const fetchMock = mockFetch({ error: "slow down" }, { status: 429 });
    const res = await tool(name).handler({ ...T, ...input });
    expect(res.isError).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("pipeline webhook routes", () => {
  it("pipeline_webhook_route_list → GET /pipeline/webhook-routes?webhook_id=", async () => {
    const fetchMock = mockFetch({ data: [] });
    await tool("pipeline_webhook_route_list").handler({ ...T, webhook_id: WEBHOOK });
    const url = calledUrl(fetchMock);
    expect(url.pathname).toBe("/api/v1/pipeline/webhook-routes");
    expect(url.searchParams.get("webhook_id")).toBe(WEBHOOK);
  });

  it("pipeline_webhook_route_create → POST with filter", async () => {
    const fetchMock = mockFetch({ data: {} }, { status: 201 });
    const filter = {
      match: "all",
      conditions: [{ path: "plan", operator: "equals", value: "enterprise" }],
    };
    await tool("pipeline_webhook_route_create").handler({
      ...T,
      webhook_id: WEBHOOK,
      to_stage_id: STAGE,
      filter,
    });
    expect(calledMethod(fetchMock)).toBe("POST");
    expect(calledUrl(fetchMock).pathname).toBe("/api/v1/pipeline/webhook-routes");
    expect(calledBody(fetchMock)).toEqual({ webhook_id: WEBHOOK, to_stage_id: STAGE, filter });
  });

  it("pipeline_webhook_route_reorder → PUT with ordered_ids", async () => {
    const fetchMock = mockFetch({ data: [] });
    await tool("pipeline_webhook_route_reorder").handler({
      ...T,
      webhook_id: WEBHOOK,
      ordered_ids: [ROUTE],
    });
    expect(calledMethod(fetchMock)).toBe("PUT");
    expect(calledUrl(fetchMock).pathname).toBe("/api/v1/pipeline/webhook-routes");
    expect(calledBody(fetchMock)).toEqual({ webhook_id: WEBHOOK, ordered_ids: [ROUTE] });
  });

  it("pipeline_webhook_route_update → PATCH /:id without route_id in body", async () => {
    const fetchMock = mockFetch({ data: {} });
    await tool("pipeline_webhook_route_update").handler({
      ...T,
      route_id: ROUTE,
      is_enabled: false,
      label: null,
    });
    expect(calledMethod(fetchMock)).toBe("PATCH");
    expect(calledUrl(fetchMock).pathname).toBe(`/api/v1/pipeline/webhook-routes/${ROUTE}`);
    expect(calledBody(fetchMock)).toEqual({ is_enabled: false, label: null });
  });

  it("pipeline_webhook_route_delete → DELETE /:id", async () => {
    const fetchMock = mockFetch({ data: { id: ROUTE } });
    await tool("pipeline_webhook_route_delete").handler({ ...T, route_id: ROUTE });
    expect(calledMethod(fetchMock)).toBe("DELETE");
    expect(calledUrl(fetchMock).pathname).toBe(`/api/v1/pipeline/webhook-routes/${ROUTE}`);
  });

  it("filter conditions mirror max-agent's operator set and limits", () => {
    const schema = schemaOf("pipeline_webhook_route_create");
    const base = { webhook_id: WEBHOOK, to_stage_id: STAGE };
    expect(
      schema.safeParse({
        ...base,
        filter: { conditions: [{ path: "utm_source", operator: "is_truthy" }] },
      }).success,
    ).toBe(true);
    expect(
      schema.safeParse({
        ...base,
        filter: { conditions: [{ path: "plan", operator: "like", value: "x" }] },
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        ...base,
        filter: {
          conditions: Array.from({ length: 13 }, () => ({ path: "a", operator: "is_empty" })),
        },
      }).success,
    ).toBe(false);
  });
});

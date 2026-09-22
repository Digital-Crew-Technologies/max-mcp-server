import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { z } from "zod";
import type { McpServer } from "@/features/pilot-tools/shared";
import { registerAutomationTools } from "@/features/pilot-tools/automations/tools";
import { registerAsGroup } from "@/features/pilot-tools/mcp/group-adapter";
import * as S from "@/features/pilot-tools/automations/schema";

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
  registerAutomationTools(server);
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

const DEFINITION = {
  trigger: { type: "record_event", entity: "prospect", event: "updated", field: "status", to_value: "replied" },
  steps: [
    { id: "s1", kind: "action", action: "create_task", config: { title: "Call {{record.full_name}}" } },
    { id: "s2", kind: "delay", duration_seconds: 3600 },
  ],
};

beforeEach(() => {
  process.env.DIGITALCREW_API_BASE_URL = "https://api.test";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("automation tool registration", () => {
  it("registers automation_-prefixed tools and no credential or cron tool", () => {
    const names = capture().map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "automation_list",
        "automation_get",
        "automation_create",
        "automation_save_draft",
        "automation_activate",
        "automation_deactivate",
        "automation_run",
        "automation_cancel_run",
      ]),
    );
    for (const name of names) {
      expect(name).toMatch(/^automation_[a-z_]+$/);
      expect(name).not.toMatch(/token|rotate|cron|process/);
    }
  });

  it("marks delete / discard / pause / cancel destructive and reads read-only", () => {
    const hints = (name: string) =>
      (tool(name).config.annotations ?? {}) as Record<string, boolean>;
    for (const name of [
      "automation_delete",
      "automation_discard_draft",
      "automation_deactivate",
      "automation_cancel_run",
    ]) {
      expect(hints(name).destructiveHint, name).toBe(true);
    }
    for (const name of ["automation_list", "automation_get", "automation_list_runs", "automation_get_run"]) {
      expect(hints(name).readOnlyHint, name).toBe(true);
    }
  });
});

describe("grouped registration", () => {
  it("collapses into one `automations` tool; a nested step `action` does not clash", () => {
    const grouped: Captured[] = [];
    registerAsGroup(
      { registerTool: (name, config, handler) => grouped.push({ name, config, handler }) },
      "automations",
      "Automations",
      registerAutomationTools,
    );
    expect(grouped.map((t) => t.name)).toEqual(["automations"]);
    const strict = grouped[0].config._strictInputSchema as z.ZodTypeAny;
    expect(
      strict.safeParse({ action: "automation_save_draft", automation_id: UUID, definition: DEFINITION })
        .success,
    ).toBe(true);
    expect(strict.safeParse({ action: "automation_rotate_webhook_token", automation_id: UUID }).success)
      .toBe(false);
  });
});

describe("automation handlers", () => {
  it("automation_list → GET /api/v1/automations", async () => {
    const f = mockFetch({ data: [] });
    await tool("automation_list").handler({});
    expect(calledMethod(f)).toBe("GET");
    expect(calledUrl(f).pathname).toBe("/api/v1/automations");
  });

  it("automation_create keeps the definition's step config through schema parsing", async () => {
    const parsed = S.createAutomationSchema.parse({ name: "Replied → task", definition: DEFINITION });
    const f = mockFetch({ data: {} }, { status: 201 });
    await tool("automation_create").handler(parsed);
    expect(calledMethod(f)).toBe("POST");
    expect(calledUrl(f).pathname).toBe("/api/v1/automations");
    expect(calledBody(f)).toEqual({ name: "Replied → task", definition: DEFINITION });
  });

  it("automation_save_draft → PUT /:id/draft with only the definition", async () => {
    const f = mockFetch({ data: {} });
    await tool("automation_save_draft").handler({
      bearer_token: "tok",
      automation_id: UUID,
      definition: DEFINITION,
    });
    expect(calledMethod(f)).toBe("PUT");
    expect(calledUrl(f).pathname).toBe(`/api/v1/automations/${UUID}/draft`);
    expect(calledBody(f)).toEqual({ definition: DEFINITION });
  });

  it("automation_update → PATCH /:id without the path id in the body", async () => {
    const f = mockFetch({ data: {} });
    await tool("automation_update").handler({ automation_id: UUID, description: null });
    expect(calledMethod(f)).toBe("PATCH");
    expect(calledUrl(f).pathname).toBe(`/api/v1/automations/${UUID}`);
    expect(calledBody(f)).toEqual({ description: null });
  });

  it("automation_run → POST /:id/run with prospect_id, never retried", async () => {
    const f = mockFetch({ data: { status: "succeeded" } }, { status: 201 });
    await tool("automation_run").handler({ automation_id: UUID, prospect_id: UUID2 });
    expect(calledMethod(f)).toBe("POST");
    expect(calledUrl(f).pathname).toBe(`/api/v1/automations/${UUID}/run`);
    expect(calledBody(f)).toEqual({ prospect_id: UUID2 });

    const failing = mockFetch({ error: "busy" }, { status: 503 });
    const res = await tool("automation_run").handler({ automation_id: UUID });
    expect(res.isError).toBe(true);
    expect(failing).toHaveBeenCalledTimes(1);
  });

  it("automation_list_runs → GET /:id/runs?page", async () => {
    const f = mockFetch({ data: [], count: 0 });
    await tool("automation_list_runs").handler({ automation_id: UUID, page: 2 });
    expect(calledUrl(f).pathname).toBe(`/api/v1/automations/${UUID}/runs`);
    expect(calledUrl(f).searchParams.get("page")).toBe("2");
  });

  it("automation_cancel_run → POST /runs/:id/cancel", async () => {
    const f = mockFetch({ data: {} });
    await tool("automation_cancel_run").handler({ run_id: UUID });
    expect(calledMethod(f)).toBe("POST");
    expect(calledUrl(f).pathname).toBe(`/api/v1/automations/runs/${UUID}/cancel`);
  });
});

describe("webhook credential redaction", () => {
  it("automation_activate never returns the plaintext webhook token", async () => {
    const secret = "whk_live_4f9c2d8e1b7a6f3c";
    const f = mockFetch({ data: { id: UUID, status: "active", webhook_token: secret } });
    const res = await tool("automation_activate").handler({ automation_id: UUID });
    expect(calledMethod(f)).toBe("POST");
    expect(calledUrl(f).pathname).toBe(`/api/v1/automations/${UUID}/activate`);
    expect(res.isError).toBeUndefined();
    expect(res.content[0].text).not.toContain(secret);
    const body = JSON.parse(res.content[0].text) as { data: Record<string, unknown> };
    expect(body.data.status).toBe("active");
    expect(String(body.data.webhook_token)).toContain("redacted");
  });

  it("leaves a null webhook_token untouched", async () => {
    mockFetch({ data: { id: UUID, webhook_token: null } });
    const res = await tool("automation_resume").handler({ automation_id: UUID });
    expect(JSON.parse(res.content[0].text)).toEqual({ data: { id: UUID, webhook_token: null } });
  });
});

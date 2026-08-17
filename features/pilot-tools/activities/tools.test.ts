import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { McpServer } from "@/features/pilot-tools/shared";
import {
  registerActivitiesTools,
  ACTIVITIES_CAPABILITIES,
} from "@/features/pilot-tools/activities/tools";
import * as repo from "@/features/pilot-tools/activities/repository";

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
  registerActivitiesTools(server);
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

const PROSPECT_ID = "11111111-1111-1111-1111-111111111111";
const DEAL_ID = "22222222-2222-2222-2222-222222222222";
const ACTIVITY_ID = "33333333-3333-3333-3333-333333333333";

describe("activities tool registration", () => {
  it("registers ONE grouped `activities` tool", () => {
    expect(capture().map((t) => t.name)).toEqual(["activities"]);
  });

  it("rejects an unknown action rather than silently doing nothing", async () => {
    const res = await tool("activities").handler({
      action: "not_a_real_action",
      bearer_token: "t",
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("Unknown action");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The timeline stays honest: notes and manual calls are the only writable
// types, and nothing can be deleted. A tool that could write "the prospect
// replied" (email/linkedin/whatsapp/meeting/stage_change) or erase history
// would make the timeline fiction.
// ─────────────────────────────────────────────────────────────────────────────

describe("activities write boundaries", () => {
  it("offers exactly list, create_note, log_call, update", async () => {
    for (const action of [
      "delete",
      "delete_activity",
      "create_email",
      "create_message",
      "create_meeting",
      "create_stage_change",
      "create_activity",
    ]) {
      const res = await tool("activities").handler({ action, bearer_token: "t" });
      expect(res.isError, `action "${action}" exists`).toBe(true);
    }
  });

  it("exports no delete function from the repository", () => {
    for (const name of Object.keys(repo)) {
      expect(name).not.toMatch(/delete|remove/i);
    }
  });
});

describe("activities tenancy", () => {
  it("has no workspace/tenant argument on any tool — the bearer decides", () => {
    for (const t of capture()) {
      const schema = JSON.stringify(t.config.inputSchema ?? {});
      expect(schema, `${t.name} exposes a tenant selector`).not.toMatch(
        /workspace_?[Ii]d|tenant_?[Ii]d/,
      );
    }
  });
});

describe("activities capability names", () => {
  it("covers every action with read/write split", () => {
    expect(ACTIVITIES_CAPABILITIES).toEqual({
      "activities.list": "activities.read",
      "activities.create_note": "activities.write",
      "activities.log_call": "activities.write",
      "activities.update": "activities.write",
    });
  });
});

describe("activities reads", () => {
  it("maps snake_case list args onto the API's mixed-case query params", async () => {
    const fetchMock = mockFetch({ data: [], count: 0, page: 1, pageSize: 30 });
    await tool("activities").handler({
      action: "list",
      bearer_token: "t",
      prospect_id: PROSPECT_ID,
      type: "note",
      page: 2,
      page_size: 100,
    });
    const url = calledUrl(fetchMock);
    expect(url.pathname).toBe("/api/v1/activities");
    expect(url.searchParams.get("prospect_id")).toBe(PROSPECT_ID);
    expect(url.searchParams.get("type")).toBe("note");
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("pageSize")).toBe("100");
  });
});

describe("activities writes", () => {
  it("writes a note with its entity links and never leaks bearer_token", async () => {
    const fetchMock = mockFetch({ data: { id: ACTIVITY_ID } }, { status: 201 });
    await tool("activities").handler({
      action: "create_note",
      bearer_token: "secret-token",
      body: "Spoke at the conference — wants a demo in September.",
      prospect_id: PROSPECT_ID,
      deal_id: DEAL_ID,
    });
    expect(calledUrl(fetchMock).pathname).toBe("/api/v1/activities/notes");
    const body = calledBody(fetchMock);
    expect(body.body).toContain("wants a demo");
    expect(body.prospect_id).toBe(PROSPECT_ID);
    expect(body.deal_id).toBe(DEAL_ID);
    expect(body).not.toHaveProperty("bearer_token");
    expect(body).not.toHaveProperty("action");
  });

  it("logs a call with outcome, direction and backdated occurred_at", async () => {
    const fetchMock = mockFetch({ data: { id: ACTIVITY_ID } }, { status: 201 });
    await tool("activities").handler({
      action: "log_call",
      bearer_token: "t",
      prospect_id: PROSPECT_ID,
      outcome: "connected",
      direction: "outbound",
      duration_seconds: 420,
      occurred_at: "2026-08-14T09:30:00+02:00",
    });
    expect(calledUrl(fetchMock).pathname).toBe("/api/v1/activities/calls");
    const body = calledBody(fetchMock);
    expect(body.outcome).toBe("connected");
    expect(body.duration_seconds).toBe(420);
    expect(body.occurred_at).toBe("2026-08-14T09:30:00+02:00");
  });

  it("edits a note / pins through PATCH, preserving an explicit null subject", async () => {
    const fetchMock = mockFetch({ data: { id: ACTIVITY_ID } });
    await tool("activities").handler({
      action: "update",
      bearer_token: "t",
      id: ACTIVITY_ID,
      subject: null,
      is_pinned: true,
    });
    expect(calledUrl(fetchMock).pathname).toBe(`/api/v1/activities/${ACTIVITY_ID}`);
    expect(fetchMock.mock.calls[0][1]?.method).toBe("PATCH");
    expect(calledBody(fetchMock)).toEqual({ subject: null, is_pinned: true });
  });
});

describe("activities error handling", () => {
  it("surfaces the 400 for a list with no entity filter, not an empty result", async () => {
    mockFetch({ error: "Pass prospect_id, organization_id or deal_id" }, { status: 400 });
    const res = await tool("activities").handler({
      action: "list",
      bearer_token: "t",
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("400");
  });

  it("never echoes bearer material out of an upstream error body", async () => {
    mockFetch("upstream said: Authorization: Bearer sk-live-supersecret", {
      status: 500,
    });
    const res = await tool("activities").handler({
      action: "list",
      bearer_token: "t",
      prospect_id: PROSPECT_ID,
    });
    expect(res.content[0].text).not.toContain("sk-live-supersecret");
    expect(res.content[0].text).toContain("[redacted]");
  });
});

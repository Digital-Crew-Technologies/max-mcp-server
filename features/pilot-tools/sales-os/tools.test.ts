import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { z } from "zod";
import type { McpServer } from "@/features/pilot-tools/shared";
import { registerAsGroup } from "@/features/pilot-tools/mcp/group-adapter";
import { registerPilotMcpTools } from "@/features/pilot-tools/mcp/register";
import { registerSalesOsTools } from "@/features/pilot-tools/sales-os/tools";
import * as repo from "@/features/pilot-tools/sales-os/repository";

type Handler = (input: Record<string, unknown>) => Promise<{
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}>;

type Captured = { name: string; config: Record<string, unknown>; handler: Handler };

function recorder(tools: Captured[]): McpServer {
  return {
    registerTool(name, config, handler) {
      tools.push({ name, config, handler });
    },
  };
}

function capture(): Captured[] {
  const tools: Captured[] = [];
  registerSalesOsTools(recorder(tools));
  return tools;
}

function tool(name: string): Captured {
  const found = capture().find((t) => t.name === name);
  if (!found) throw new Error(`tool "${name}" was not registered`);
  return found;
}

const schemaOf = (name: string) => tool(name).config.inputSchema as z.ZodTypeAny;

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

const url = (m: ReturnType<typeof mockFetch>) => new URL(m.mock.calls[0][0]);
const method = (m: ReturnType<typeof mockFetch>) => m.mock.calls[0][1]?.method ?? "GET";
const body = (m: ReturnType<typeof mockFetch>) =>
  JSON.parse(m.mock.calls[0][1]?.body as string) as Record<string, unknown>;
const authorization = (m: ReturnType<typeof mockFetch>) =>
  (m.mock.calls[0][1]?.headers as Record<string, string>).Authorization;

const WORKER = "55555555-5555-4555-8555-555555555555";

beforeEach(() => {
  process.env.DIGITALCREW_API_BASE_URL = "https://api.test";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("sales os tools: registration", () => {
  it("registers the four Sales OS tools", () => {
    expect(capture().map((t) => t.name).sort()).toEqual(
      [
        "add_sales_os_desktop_item",
        "list_sales_os_crew",
        "list_sales_os_desktop_items",
        "sales_os_crew_check_in",
      ].sort(),
    );
  });

  it("marks the reads read-only, the check-in idempotent and the add as a plain write", () => {
    expect(tool("list_sales_os_crew").config.annotations).toEqual({ readOnlyHint: true });
    expect(tool("list_sales_os_desktop_items").config.annotations).toEqual({ readOnlyHint: true });
    expect(tool("sales_os_crew_check_in").config.annotations).toEqual({ idempotentHint: true });
    expect(tool("add_sales_os_desktop_item").config.annotations).toBeUndefined();
  });

  it("is the salesos group, registered right after workspace in the default catalog", () => {
    vi.stubEnv("GROUPED_TOOLS", "");
    const tools: Captured[] = [];
    registerPilotMcpTools(recorder(tools));
    const names = tools.map((t) => t.name);
    expect(names.indexOf("salesos")).toBe(names.indexOf("workspace") + 1);
    const group = tools.find((t) => t.name === "salesos")!;
    for (const action of [
      "list_sales_os_crew",
      "sales_os_crew_check_in",
      "list_sales_os_desktop_items",
      "add_sales_os_desktop_item",
    ]) {
      expect(group.config.description).toContain(`• ${action} — `);
    }
    // One write in the group: the grouped tool is neither read-only nor idempotent.
    expect(group.config.annotations).toEqual({
      readOnlyHint: false,
      idempotentHint: false,
      destructiveHint: false,
    });
  });

  it("registers every tool flat when GROUPED_TOOLS=false", () => {
    vi.stubEnv("GROUPED_TOOLS", "false");
    const tools: Captured[] = [];
    registerPilotMcpTools(recorder(tools));
    const names = tools.map((t) => t.name);
    expect(names).not.toContain("salesos");
    expect(names).toContain("list_sales_os_crew");
    expect(names).toContain("add_sales_os_desktop_item");
  });
});

describe("list_sales_os_crew", () => {
  it("GETs /sales-os/crew with no query by default", async () => {
    const f = mockFetch({ data: { members: [], counts: {}, live: {}, generatedAt: "x" } });
    const res = await tool("list_sales_os_crew").handler({ bearer_token: "t" });
    expect(method(f)).toBe("GET");
    expect(url(f).pathname).toBe("/api/v1/sales-os/crew");
    expect(url(f).search).toBe("");
    expect(authorization(f)).toBe("Bearer t");
    expect(res.isError).toBeUndefined();
  });

  it("sends include_ai=false for a people-only roster", async () => {
    const f = mockFetch({ data: {} });
    await tool("list_sales_os_crew").handler({ bearer_token: "t", include_ai: false });
    expect(url(f).searchParams.get("include_ai")).toBe("false");
  });

  it("accepts only a boolean include_ai", () => {
    expect(schemaOf("list_sales_os_crew").safeParse({ include_ai: "no" }).success).toBe(false);
    expect(schemaOf("list_sales_os_crew").safeParse({}).success).toBe(true);
  });
});

describe("sales_os_crew_check_in", () => {
  it("POSTs the check-in with client mcp and without the token", async () => {
    const f = mockFetch({ data: { recorded: true, member: { key: "agent:k:research-agent" } } });
    await tool("sales_os_crew_check_in").handler({
      bearer_token: "t",
      name: "Research agent",
      state: "busy",
      activity: "Researching Acme Corp",
    });
    expect(method(f)).toBe("POST");
    expect(url(f).pathname).toBe("/api/v1/sales-os/crew/check-in");
    expect(body(f)).toEqual({
      name: "Research agent",
      state: "busy",
      activity: "Researching Acme Corp",
      client: "mcp",
    });
  });

  it("checks in as a digital worker with worker_id", async () => {
    const f = mockFetch({ data: { recorded: true } });
    await tool("sales_os_crew_check_in").handler({ bearer_token: "t", name: "Claire", worker_id: WORKER });
    expect(body(f)).toEqual({ name: "Claire", worker_id: WORKER, client: "mcp" });
  });

  it("sends only the check-in fields and always client mcp, whatever else the raw input carries", async () => {
    // Grouped mode hands a handler the caller's raw input; max-agent's body is strict.
    const f = mockFetch({ data: { recorded: false } });
    await tool("sales_os_crew_check_in").handler({
      bearer_token: "t",
      name: "Research agent",
      state: "offline",
      client: "api",
      workspace_id: "other",
      user_id: "someone",
    });
    expect(body(f)).toEqual({ name: "Research agent", state: "offline", client: "mcp" });
  });

  it("validates name, state, activity and worker_id before any request", () => {
    const schema = schemaOf("sales_os_crew_check_in");
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ name: "   " }).success).toBe(false);
    expect(schema.safeParse({ name: "x".repeat(41) }).success).toBe(false);
    expect(schema.safeParse({ name: "Agent", state: "away" }).success).toBe(false);
    expect(schema.safeParse({ name: "Agent", activity: "x".repeat(121) }).success).toBe(false);
    expect(schema.safeParse({ name: "Agent", worker_id: "claire" }).success).toBe(false);
    expect(schema.safeParse({ name: "Agent", state: "offline" }).success).toBe(true);
    expect(schema.safeParse({ name: "Agent", worker_id: WORKER, state: "busy", activity: "Drafting" }).success).toBe(true);
  });

  it("does not let the caller choose the client", () => {
    const shape = (schemaOf("sales_os_crew_check_in") as unknown as { shape: Record<string, unknown> }).shape;
    expect(Object.keys(shape)).not.toContain("client");
  });

  it("never retries: a 429 rate limit is surfaced after one call", async () => {
    const f = mockFetch({ error: "Too many check-ins; slow down.", code: "RATE_LIMITED" }, { status: 429 });
    const res = await tool("sales_os_crew_check_in").handler({ bearer_token: "t", name: "Agent" });
    expect(f).toHaveBeenCalledTimes(1);
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("429");
    expect(res.content[0].text).toContain("RATE_LIMITED");
  });

  it("surfaces a paused digital worker (409 WORKER_PAUSED)", async () => {
    mockFetch({ error: "This digital worker is paused.", code: "WORKER_PAUSED" }, { status: 409 });
    const res = await tool("sales_os_crew_check_in").handler({ bearer_token: "t", name: "Kate", worker_id: WORKER });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("WORKER_PAUSED");
  });
});

describe("list_sales_os_desktop_items", () => {
  it("GETs /sales-os/items, with folder_id when given", async () => {
    const f = mockFetch({ data: { revision: 3, folderId: null, items: [], widgets: [] } });
    await tool("list_sales_os_desktop_items").handler({ bearer_token: "t" });
    expect(method(f)).toBe("GET");
    expect(url(f).pathname).toBe("/api/v1/sales-os/items");
    expect(url(f).search).toBe("");

    const g = mockFetch({ data: { revision: 3, folderId: "f_1", items: [] } });
    await tool("list_sales_os_desktop_items").handler({ bearer_token: "t", folder_id: "f_1" });
    expect(url(g).searchParams.get("folder_id")).toBe("f_1");
  });

  it("accepts root or a node id, nothing else", () => {
    const schema = schemaOf("list_sales_os_desktop_items");
    expect(schema.safeParse({ folder_id: "root" }).success).toBe(true);
    expect(schema.safeParse({ folder_id: "abc_DEF-123" }).success).toBe(true);
    expect(schema.safeParse({ folder_id: "../etc" }).success).toBe(false);
    expect(schema.safeParse({ folder_id: "x".repeat(65) }).success).toBe(false);
  });

  it("surfaces the shared-key refusal so the model can ask for a personal key", async () => {
    mockFetch(
      {
        error:
          'The shared "Max MCP" key belongs to the whole workspace, so it can\'t open a person\'s desktop. Create a personal API key with the sales_os scopes instead.',
        code: "PERSONAL_KEY_REQUIRED",
      },
      { status: 403 },
    );
    const res = await tool("list_sales_os_desktop_items").handler({ bearer_token: "t" });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("403");
    expect(res.content[0].text).toContain("PERSONAL_KEY_REQUIRED");
  });
});

describe("add_sales_os_desktop_item", () => {
  it("POSTs a sticky note", async () => {
    const f = mockFetch({ data: { id: "n_1", created: true, revision: 4 } }, { status: 201 });
    const res = await tool("add_sales_os_desktop_item").handler({
      bearer_token: "t",
      type: "note",
      text: "Call Acme back on Friday",
      color: "pink",
    });
    expect(method(f)).toBe("POST");
    expect(url(f).pathname).toBe("/api/v1/sales-os/items");
    expect(body(f)).toEqual({ type: "note", text: "Call Acme back on Friday", color: "pink" });
    expect(res.isError).toBeUndefined();
  });

  it("POSTs a shortcut into a folder", async () => {
    const f = mockFetch({ data: { id: "s_1", created: true, revision: 5 } }, { status: 201 });
    await tool("add_sales_os_desktop_item").handler({
      bearer_token: "t",
      type: "shortcut",
      href: "/campaigns/42",
      name: "Q4 outbound",
      folder_id: "f_1",
    });
    expect(body(f)).toEqual({ type: "shortcut", href: "/campaigns/42", name: "Q4 outbound", folder_id: "f_1" });
  });

  it("POSTs a folder and drops keys max-agent would refuse", async () => {
    const f = mockFetch({ data: { id: "f_2", created: true, revision: 6 } }, { status: 201 });
    await tool("add_sales_os_desktop_item").handler({
      bearer_token: "t",
      type: "folder",
      name: "Accounts to call",
      color: "teal",
      workspace_id: "other",
      revision: 1,
    });
    expect(body(f)).toEqual({ type: "folder", name: "Accounts to call", color: "teal" });
  });

  it.each([
    [{ type: "note" }, "needs text"],
    [{ type: "shortcut", name: "Deals" }, "needs href"],
    [{ type: "folder", color: "blue" }, "needs name"],
    [{ type: "note", text: "x", href: "/deals" }, "href does not apply"],
    [{ type: "shortcut", href: "/deals", color: "blue" }, "color does not apply"],
    [{ type: "folder", name: "x", text: "y" }, "text does not apply"],
    [{ type: "note", text: "x", color: "teal" }, "color for type note"],
    [{ type: "folder", name: "x", color: "red" }, undefined],
  ])("checks %j against its type before any request", async (args, problem) => {
    const f = mockFetch({ data: { id: "x", created: true, revision: 1 } }, { status: 201 });
    const res = await tool("add_sales_os_desktop_item").handler({ bearer_token: "t", ...args });
    if (problem) {
      expect(res.isError).toBe(true);
      expect(res.content[0].text).toContain(problem);
      expect(f).not.toHaveBeenCalled();
    } else {
      expect(res.isError).toBeUndefined();
      expect(f).toHaveBeenCalledTimes(1);
    }
  });

  it("validates lengths, colours and Max routes in the schema", () => {
    const schema = schemaOf("add_sales_os_desktop_item");
    expect(schema.safeParse({ type: "widget" }).success).toBe(false);
    expect(schema.safeParse({ type: "note", text: "   " }).success).toBe(false);
    expect(schema.safeParse({ type: "note", text: "x".repeat(2001) }).success).toBe(false);
    expect(schema.safeParse({ type: "folder", name: "x".repeat(81) }).success).toBe(false);
    expect(schema.safeParse({ type: "folder", name: "x", color: "magenta" }).success).toBe(false);
    for (const href of ["https://evil.example", "campaigns", "//evil.example/x", "/\\evil", "/ spaced"]) {
      expect(schema.safeParse({ type: "shortcut", href }).success, href).toBe(false);
    }
    for (const href of ["/campaigns", "/campaigns/123?tab=stats", "/deals?deal=abc#notes"]) {
      expect(schema.safeParse({ type: "shortcut", href }).success, href).toBe(true);
    }
  });

  it("never retries: a 503 is surfaced after one call", async () => {
    // A retry after a slow success would put a second note on the desktop.
    const f = mockFetch({ error: "Service unavailable" }, { status: 503 });
    const res = await tool("add_sales_os_desktop_item").handler({ bearer_token: "t", type: "note", text: "x" });
    expect(f).toHaveBeenCalledTimes(1);
    expect(res.isError).toBe(true);
  });

  it("surfaces 409 REVISION_CONFLICT after one call", async () => {
    const f = mockFetch(
      { error: "Your desktop kept changing. Try again in a moment.", code: "REVISION_CONFLICT" },
      { status: 409 },
    );
    const res = await tool("add_sales_os_desktop_item").handler({ bearer_token: "t", type: "folder", name: "x" });
    expect(f).toHaveBeenCalledTimes(1);
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("REVISION_CONFLICT");
  });

  it("surfaces 413 DESKTOP_FULL", async () => {
    mockFetch({ error: "The desktop is full. Remove some items first.", code: "DESKTOP_FULL" }, { status: 413 });
    const res = await tool("add_sales_os_desktop_item").handler({ bearer_token: "t", type: "note", text: "x" });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("DESKTOP_FULL");
  });
});

describe("sales os tools in grouped mode", () => {
  function group(): Captured {
    const tools: Captured[] = [];
    registerAsGroup(recorder(tools), "salesos", "Sales OS", registerSalesOsTools);
    expect(tools.map((t) => t.name)).toEqual(["salesos"]);
    return tools[0];
  }

  it("dispatches a check-in by its flat name and still sends client mcp", async () => {
    const f = mockFetch({ data: { recorded: true } });
    const res = await group().handler({
      action: "sales_os_crew_check_in",
      bearer_token: "t",
      name: "Research agent",
      activity: "Scoring leads",
    });
    expect(res.isError).toBeUndefined();
    expect(body(f)).toEqual({ name: "Research agent", activity: "Scoring leads", client: "mcp" });
  });

  it("rejects a desktop add with a bad href before any request", async () => {
    const f = mockFetch({ data: {} });
    const res = await group().handler({
      action: "add_sales_os_desktop_item",
      type: "shortcut",
      href: "https://evil.example",
    });
    expect(res.isError).toBe(true);
    expect(f).not.toHaveBeenCalled();
  });
});

describe("sales os tenancy and secrets", () => {
  it("has no workspace, tenant or user argument on any tool — the bearer decides", () => {
    for (const t of capture()) {
      const schema = JSON.stringify(t.config.inputSchema ?? {});
      expect(schema, `${t.name} exposes a tenant selector`).not.toMatch(
        /workspace_?[Ii]d|tenant_?[Ii]d|user_?[Ii]d/,
      );
      const shape = (t.config.inputSchema as { shape: Record<string, unknown> }).shape;
      for (const key of Object.keys(shape)) {
        expect(key).not.toMatch(/^(workspace|tenant|user|member)(_?id)?$/i);
        expect(key).not.toBe("action");
      }
    }
  });

  it("exposes no token tool and no token function", () => {
    for (const t of capture()) expect(t.name).not.toMatch(/token|presence/i);
    for (const name of Object.keys(repo)) expect(name).not.toMatch(/token|presence/i);
  });

  it("never echoes bearer material out of an upstream error body", async () => {
    mockFetch("failed for Authorization: Bearer sk-live-supersecret", { status: 400 });
    const res = await tool("list_sales_os_crew").handler({ bearer_token: "t" });
    expect(res.content[0].text).not.toContain("sk-live-supersecret");
    expect(res.content[0].text).toContain("[redacted]");
  });
});

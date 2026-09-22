import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { z } from "zod";
import type { McpServer } from "@/features/pilot-tools/shared";
import { registerViewTools } from "@/features/pilot-tools/views/tools";

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
  registerViewTools(server);
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
      new Response(JSON.stringify(body), {
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

const VIEW = "44444444-4444-4444-4444-444444444444";

beforeEach(() => {
  process.env.DIGITALCREW_API_BASE_URL = "https://api.test";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("saved view tools", () => {
  it("registers the five saved-view tools", () => {
    expect(capture().map((t) => t.name).sort()).toEqual(
      [
        "create_saved_view",
        "delete_saved_view",
        "get_saved_view",
        "list_saved_views",
        "update_saved_view",
      ].sort(),
    );
  });

  it("list_saved_views requires an object surface and sends it as ?object=", async () => {
    const schema = tool("list_saved_views").config.inputSchema as z.ZodTypeAny;
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ object: "users" }).success).toBe(false);

    const f = mockFetch({ data: [] });
    await tool("list_saved_views").handler({ bearer_token: "t", object: "prospect-lists" });
    expect(method(f)).toBe("GET");
    expect(url(f).pathname).toBe("/api/v1/views");
    expect(url(f).searchParams.get("object")).toBe("prospect-lists");
  });

  it("create_saved_view POSTs object_key, name and config", async () => {
    const f = mockFetch({ data: { id: VIEW } }, { status: 201 });
    const config = { sorting: [{ id: "created_at", desc: true }], pageSize: 50 };
    await tool("create_saved_view").handler({
      bearer_token: "t",
      object_key: "prospects",
      name: "US ops",
      visibility: "private",
      config,
    });
    expect(method(f)).toBe("POST");
    expect(url(f).pathname).toBe("/api/v1/views");
    expect(body(f)).toEqual({ object_key: "prospects", name: "US ops", visibility: "private", config });
  });

  it("update_saved_view PATCHes /views/:id without the id in the body", async () => {
    const f = mockFetch({ data: { id: VIEW } });
    await tool("update_saved_view").handler({ bearer_token: "t", view_id: VIEW, position: 2 });
    expect(method(f)).toBe("PATCH");
    expect(url(f).pathname).toBe(`/api/v1/views/${VIEW}`);
    expect(body(f)).toEqual({ position: 2 });
  });

  it("delete_saved_view DELETEs /views/:id and is marked destructive", async () => {
    expect(tool("delete_saved_view").config.annotations).toEqual({ destructiveHint: true });
    const f = mockFetch({ data: { id: VIEW } });
    await tool("delete_saved_view").handler({ bearer_token: "t", view_id: VIEW });
    expect(method(f)).toBe("DELETE");
    expect(url(f).pathname).toBe(`/api/v1/views/${VIEW}`);
  });

  it("surfaces the upstream 403 for a view the key's owner did not create", async () => {
    mockFetch(
      { error: "Only the view's creator or a workspace admin can change this shared view." },
      { status: 403 },
    );
    const res = await tool("update_saved_view").handler({
      bearer_token: "t",
      view_id: VIEW,
      name: "x",
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("403");
  });
});

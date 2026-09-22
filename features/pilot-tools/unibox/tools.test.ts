import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { McpServer } from "@/features/pilot-tools/shared";
import { registerUniboxTools } from "@/features/pilot-tools/unibox/tools";

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
  registerUniboxTools(server);
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

const ACCOUNT = "77777777-7777-7777-7777-777777777777";
const CHAT = "88888888-8888-8888-8888-888888888888";
const MESSAGE = "99999999-9999-9999-9999-999999999999";

beforeEach(() => {
  process.env.DIGITALCREW_API_BASE_URL = "https://api.test";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("unibox tool registration", () => {
  it("registers the channel, rules, suggestion, message and sync tools", () => {
    const names = capture().map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining([
      "list_unibox_channels", "get_channel_sync_rules", "set_channel_sync_rules",
      "suggest_chat_replies", "get_unibox_message", "sync_unibox", "get_unibox_sync_progress",
    ]));
    expect(new Set(names).size).toBe(names.length);
  });

  it("warns that reply suggestions cost a credit", () => {
    expect(String(tool("suggest_chat_replies").config.description)).toMatch(/Charges 1 automation credit/);
  });
});

describe("unibox handlers", () => {
  it("list_unibox_channels → GET /unibox/channels", async () => {
    const fetchMock = mockFetch({ data: [] });
    const res = await tool("list_unibox_channels").handler({ bearer_token: "t" });
    expect(res.isError).toBeUndefined();
    expect(calledMethod(fetchMock)).toBe("GET");
    expect(calledUrl(fetchMock).pathname).toBe("/api/v1/unibox/channels");
  });

  it("set_channel_sync_rules → PUT /unibox/channels/{accountId}/rules with {rules}", async () => {
    const fetchMock = mockFetch({ data: [] });
    const rules = [{ name: "Inbound only", direction: "inbound", max_age_days: 90 }];
    await tool("set_channel_sync_rules").handler({ bearer_token: "t", account_id: ACCOUNT, rules });
    expect(calledMethod(fetchMock)).toBe("PUT");
    expect(calledUrl(fetchMock).pathname).toBe(`/api/v1/unibox/channels/${ACCOUNT}/rules`);
    expect(calledBody(fetchMock)).toEqual({ rules });
  });

  it("get_channel_sync_rules → GET /unibox/channels/{accountId}/rules", async () => {
    const fetchMock = mockFetch({ data: [] });
    await tool("get_channel_sync_rules").handler({ bearer_token: "t", account_id: ACCOUNT });
    expect(calledMethod(fetchMock)).toBe("GET");
    expect(calledUrl(fetchMock).pathname).toBe(`/api/v1/unibox/channels/${ACCOUNT}/rules`);
  });

  it("suggest_chat_replies → POST /unibox/chats/{id}/reply-suggestions, never retried", async () => {
    process.env.DIGITALCREW_API_BASE_URL = "https://suggest-no-retry.test";
    const fetchMock = mockFetch({ error: "unavailable" }, { status: 503 });
    const res = await tool("suggest_chat_replies").handler({ bearer_token: "t", chat_id: CHAT });
    expect(res.isError).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(calledMethod(fetchMock)).toBe("POST");
    expect(calledUrl(fetchMock).pathname).toBe(`/api/v1/unibox/chats/${CHAT}/reply-suggestions`);
  });

  it("get_unibox_message → GET /unibox/messages/{messageId}", async () => {
    const fetchMock = mockFetch({ data: {} });
    await tool("get_unibox_message").handler({ bearer_token: "t", message_id: MESSAGE });
    expect(calledMethod(fetchMock)).toBe("GET");
    expect(calledUrl(fetchMock).pathname).toBe(`/api/v1/unibox/messages/${MESSAGE}`);
  });

  it("sync_unibox → POST /unibox/sync mapping account_id to accountId", async () => {
    const fetchMock = mockFetch({ data: { partial: false } });
    await tool("sync_unibox").handler({ bearer_token: "t", account_id: ACCOUNT });
    expect(calledMethod(fetchMock)).toBe("POST");
    expect(calledUrl(fetchMock).pathname).toBe("/api/v1/unibox/sync");
    expect(calledBody(fetchMock)).toEqual({ accountId: ACCOUNT });
  });

  it("sync_unibox without account_id sends an empty body (all accounts)", async () => {
    const fetchMock = mockFetch({ data: { partial: false } });
    await tool("sync_unibox").handler({ bearer_token: "t" });
    expect(calledBody(fetchMock)).toEqual({});
  });

  it("get_unibox_sync_progress → GET /unibox/sync/progress", async () => {
    const fetchMock = mockFetch({ data: {} });
    await tool("get_unibox_sync_progress").handler({ bearer_token: "t" });
    expect(calledUrl(fetchMock).pathname).toBe("/api/v1/unibox/sync/progress");
  });
});

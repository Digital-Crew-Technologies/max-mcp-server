import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { z } from "zod";
import type { McpServer } from "@/features/pilot-tools/shared";
import { registerIntentTools } from "@/features/pilot-tools/intent/tools";

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
  registerIntentTools(server);
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

const UUID = "11111111-1111-1111-1111-111111111111";
const UUID2 = "22222222-2222-2222-2222-222222222222";

beforeEach(() => {
  process.env.DIGITALCREW_API_BASE_URL = "https://api.test";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("intent trigger bulk + attach tools", () => {
  it("bulk_create_intent_triggers POSTs the monitor config", async () => {
    const fetchMock = mockFetch(
      { data: { created: 2, skipped: [], truncated: false } },
      { status: 201 },
    );
    await tool("bulk_create_intent_triggers").handler({
      bearer_token: "t",
      signal_type: "hiring",
      organization_ids: [UUID, UUID2],
      platform: "linkedin",
      campaign_ids: [UUID],
    });
    expect(calledMethod(fetchMock)).toBe("POST");
    expect(calledUrl(fetchMock).pathname).toBe("/api/v1/intent/triggers/bulk");
    expect(calledBody(fetchMock)).toEqual({
      signal_type: "hiring",
      organization_ids: [UUID, UUID2],
      platform: "linkedin",
      campaign_ids: [UUID],
    });
  });

  it("does not retry a bulk create (a retry would duplicate monitors)", async () => {
    const fetchMock = mockFetch({ error: "unavailable" }, { status: 503 });
    await tool("bulk_create_intent_triggers").handler({
      bearer_token: "t",
      signal_type: "news",
      prospect_list_id: UUID,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("caps organization_ids at 200", () => {
    const schema = tool("bulk_create_intent_triggers").config.inputSchema as z.ZodTypeAny;
    const ids = Array.from({ length: 201 }, () => UUID);
    expect(schema.safeParse({ signal_type: "news", organization_ids: ids }).success).toBe(false);
  });

  it("attach_campaign_to_intent_trigger POSTs campaign_id + trigger_ids", async () => {
    const fetchMock = mockFetch({ data: { attached: 1, requested: 1 } });
    await tool("attach_campaign_to_intent_trigger").handler({
      bearer_token: "t",
      campaign_id: UUID,
      trigger_ids: [UUID2],
    });
    expect(calledMethod(fetchMock)).toBe("POST");
    expect(calledUrl(fetchMock).pathname).toBe("/api/v1/intent/triggers/attach-campaign");
    expect(calledBody(fetchMock)).toEqual({ campaign_id: UUID, trigger_ids: [UUID2] });
  });

  it("list_intent_signals passes the active filter as a query param", async () => {
    const fetchMock = mockFetch({ data: [] });
    await tool("list_intent_signals").handler({ bearer_token: "t", active: true });
    expect(calledMethod(fetchMock)).toBe("GET");
    expect(calledUrl(fetchMock).pathname).toBe("/api/v1/intent/triggers");
    expect(calledUrl(fetchMock).searchParams.get("active")).toBe("true");
  });
});

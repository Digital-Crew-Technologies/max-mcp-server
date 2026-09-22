import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { McpServer } from "@/features/pilot-tools/shared";
import { registerAiAgentTools } from "@/features/pilot-tools/ai-agent/tools";

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
  registerAiAgentTools(server);
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

describe("ai-agent tools", () => {
  it("suggest_campaign_ideas POSTs only the documented fields", async () => {
    const fetchMock = mockFetch({ data: { ideas: [] } });
    await tool("suggest_campaign_ideas").handler({
      bearer_token: "t",
      audience_summary: "VPs of Sales at SaaS companies",
      list_name: "Q3 SaaS",
      limit: 5,
    });
    expect(calledMethod(fetchMock)).toBe("POST");
    expect(calledUrl(fetchMock).pathname).toBe("/api/v1/ai-agent/suggest-campaign-ideas");
    // Upstream schema is .strict(): a leaked bearer_token would be a 400.
    expect(calledBody(fetchMock)).toEqual({
      audience_summary: "VPs of Sales at SaaS companies",
      list_name: "Q3 SaaS",
      limit: 5,
    });
  });

  it("does not retry a billed suggestion call", async () => {
    const fetchMock = mockFetch({ error: "unavailable" }, { status: 503 });
    const res = await tool("suggest_campaign_ideas").handler({ bearer_token: "t" });
    expect(res.isError).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("generate_workflow POSTs to generate-workflow", async () => {
    const fetchMock = mockFetch({ data: {} });
    await tool("generate_workflow").handler({ bearer_token: "t", prompt: "3-step email" });
    expect(calledUrl(fetchMock).pathname).toBe("/api/v1/ai-agent/generate-workflow");
    expect(calledBody(fetchMock)).toEqual({ prompt: "3-step email" });
  });
});

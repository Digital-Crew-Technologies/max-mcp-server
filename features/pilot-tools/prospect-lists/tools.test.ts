import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { z } from "zod";
import type { McpServer } from "@/features/pilot-tools/shared";
import { registerProspectListTools } from "@/features/pilot-tools/prospect-lists/tools";

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
  registerProspectListTools(server);
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

function calledMethod(fetchMock: ReturnType<typeof mockFetch>): string | undefined {
  return fetchMock.mock.calls[0][1]?.method ?? "GET";
}

const LIST = "33333333-3333-3333-3333-333333333333";
const ACCOUNT = "44444444-4444-4444-4444-444444444444";
const ORG = "55555555-5555-5555-5555-555555555555";

beforeEach(() => {
  process.env.DIGITALCREW_API_BASE_URL = "https://api.test";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("prospect list tool registration", () => {
  it("registers the new prospect list tools", () => {
    const names = capture().map((t) => t.name);
    for (const n of [
      "list_prospect_list_organizations",
      "list_prospect_list_member_ids",
      "get_prospect_list_share_link",
      "create_prospect_list_share_link",
      "revoke_prospect_list_share_link",
      "create_linkedin_prospect_list",
    ]) {
      expect(names).toContain(n);
    }
    expect(new Set(names).size).toBe(names.length);
  });

  it("does not expose the lead-owned auto/talk endpoints", () => {
    const names = capture().map((t) => t.name);
    expect(names.some((n) => /auto|talk/.test(n))).toBe(false);
  });

  it("requires a LinkedIn account id on create_linkedin_prospect_list", () => {
    const schema = tool("create_linkedin_prospect_list").config.inputSchema as z.ZodTypeAny;
    expect(
      schema.safeParse({ list_name: "x", criteria: { jobTitles: ["CTO"], linkedin: {} } }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        list_name: "x",
        criteria: { jobTitles: ["CTO"], linkedin: { accountId: ACCOUNT } },
      }).success,
    ).toBe(true);
  });

  it("marks the share-link revoke destructive", () => {
    const hints = tool("revoke_prospect_list_share_link").config.annotations as Record<string, boolean>;
    expect(hints.destructiveHint).toBe(true);
  });
});

describe("prospect list tool handlers", () => {
  it("list_prospect_list_organizations → GET with paging/sort query", async () => {
    const f = mockFetch({ data: [], count: 0 });
    await tool("list_prospect_list_organizations").handler({
      bearer_token: "tok",
      id: LIST,
      page: 2,
      pageSize: 50,
      sortBy: "name",
      sortOrder: "asc",
    });
    const url = calledUrl(f);
    expect(calledMethod(f)).toBe("GET");
    expect(url.pathname).toBe(`/api/v1/prospect-lists/${LIST}/organizations`);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      page: "2",
      pageSize: "50",
      sortBy: "name",
      sortOrder: "asc",
    });
  });

  it("list_prospect_list_member_ids → repeated array params and booleans", async () => {
    const f = mockFetch({ ids: [], count: 0, truncated: false });
    await tool("list_prospect_list_member_ids").handler({
      bearer_token: "tok",
      id: LIST,
      status: ["prospect", "interested"],
      organization_ids: [ORG],
      has_email: true,
      limit: 100,
    });
    const url = calledUrl(f);
    expect(url.pathname).toBe(`/api/v1/prospect-lists/${LIST}/prospects/ids`);
    expect(url.searchParams.getAll("status")).toEqual(["prospect", "interested"]);
    expect(url.searchParams.getAll("organization_ids")).toEqual([ORG]);
    expect(url.searchParams.get("has_email")).toBe("true");
    expect(url.searchParams.get("limit")).toBe("100");
    expect(url.searchParams.has("id")).toBe(false);
  });

  it("create_prospect_list_share_link → POST /prospect-lists/:id/share-link", async () => {
    const f = mockFetch({ data: { token: "t", enabled: true } });
    await tool("create_prospect_list_share_link").handler({ bearer_token: "tok", id: LIST });
    expect(calledMethod(f)).toBe("POST");
    expect(calledUrl(f).pathname).toBe(`/api/v1/prospect-lists/${LIST}/share-link`);
  });

  it("create_linkedin_prospect_list → POST body as-is, no retry", async () => {
    const f = mockFetch({ error: "boom" }, { status: 503 });
    const input = {
      list_name: "CTOs in Paris",
      criteria: {
        jobTitles: ["CTO"],
        personLocations: ["Paris"],
        linkedin: { accountId: ACCOUNT, api: "classic", networkDistance: [2, 3] },
      },
      idempotency_key: "k1",
    };
    const res = await tool("create_linkedin_prospect_list").handler({ bearer_token: "tok", ...input });
    expect(res.isError).toBe(true);
    expect(f).toHaveBeenCalledTimes(1);
    expect(calledMethod(f)).toBe("POST");
    expect(calledUrl(f).pathname).toBe("/api/v1/prospect-lists/linkedin/create-list");
    expect(calledBody(f)).toEqual(input);
  });
});

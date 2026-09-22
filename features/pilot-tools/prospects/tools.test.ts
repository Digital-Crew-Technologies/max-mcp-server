import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { z } from "zod";
import type { McpServer } from "@/features/pilot-tools/shared";
import { registerProspectTools } from "@/features/pilot-tools/prospects/tools";

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
  registerProspectTools(server);
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

const PID = "11111111-1111-1111-1111-111111111111";
const HOOK = "22222222-2222-2222-2222-222222222222";

beforeEach(() => {
  process.env.DIGITALCREW_API_BASE_URL = "https://api.test";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("prospect tool registration", () => {
  it("registers the new prospect sub-resource tools", () => {
    const names = capture().map((t) => t.name);
    for (const n of [
      "list_prospect_campaigns",
      "get_prospect_qualification",
      "list_prospect_profile_activities",
      "list_prospect_profile_hooks",
      "create_prospect_profile_hook",
      "update_prospect_profile_hook",
      "delete_prospect_profile_hook",
      "run_prospect_profile_hook",
      "enrich_prospect_with_claire",
      "create_prospect_intelligence_watchers",
      "refresh_prospect_images",
      "refresh_prospect_social_profiles",
      "get_prospect_share_link",
      "create_prospect_share_link",
      "revoke_prospect_share_link",
      "get_people_share_link",
      "create_people_share_link",
      "revoke_people_share_link",
      "search_workspace",
    ]) {
      expect(names).toContain(n);
    }
    expect(new Set(names).size).toBe(names.length);
  });

  it("marks share-link revokes and hook delete destructive, GETs read-only", () => {
    const hints = (n: string) =>
      (tool(n).config.annotations ?? {}) as Record<string, boolean | undefined>;
    expect(hints("revoke_prospect_share_link").destructiveHint).toBe(true);
    expect(hints("revoke_people_share_link").destructiveHint).toBe(true);
    expect(hints("delete_prospect_profile_hook").destructiveHint).toBe(true);
    expect(hints("get_prospect_share_link").readOnlyHint).toBe(true);
    expect(hints("search_workspace").readOnlyHint).toBe(true);
    expect(hints("create_prospect_share_link").readOnlyHint).toBeUndefined();
  });

  it("rejects an unknown hook provider", () => {
    const schema = tool("create_prospect_profile_hook").config.inputSchema as z.ZodTypeAny;
    expect(schema.safeParse({ id: PID, provider: "claire" }).success).toBe(true);
    expect(schema.safeParse({ id: PID, provider: "apollo" }).success).toBe(false);
  });
});

describe("prospect tool handlers", () => {
  it("list_prospect_campaigns → GET /prospects/:id/campaigns", async () => {
    const f = mockFetch({ data: [] });
    const res = await tool("list_prospect_campaigns").handler({ bearer_token: "tok", id: PID });
    expect(res.isError).toBeUndefined();
    expect(calledMethod(f)).toBe("GET");
    expect(calledUrl(f).pathname).toBe(`/api/v1/prospects/${PID}/campaigns`);
  });

  it("create_prospect_profile_hook → POST body without path params or token", async () => {
    const f = mockFetch({ data: { id: HOOK } }, { status: 201 });
    await tool("create_prospect_profile_hook").handler({
      bearer_token: "tok",
      id: PID,
      provider: "scrapecreators",
      source: "linkedin",
      frequency: "weekly",
    });
    expect(calledMethod(f)).toBe("POST");
    expect(calledUrl(f).pathname).toBe(`/api/v1/prospects/${PID}/profile-hooks`);
    expect(calledBody(f)).toEqual({ provider: "scrapecreators", source: "linkedin", frequency: "weekly" });
    const headers = f.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer tok");
  });

  it("update_prospect_profile_hook → PATCH /profile-hooks/:hookId", async () => {
    const f = mockFetch({ data: {} });
    await tool("update_prospect_profile_hook").handler({ bearer_token: "tok", id: PID, hook_id: HOOK, active: false });
    expect(calledMethod(f)).toBe("PATCH");
    expect(calledUrl(f).pathname).toBe(`/api/v1/prospects/${PID}/profile-hooks/${HOOK}`);
    expect(calledBody(f)).toEqual({ active: false });
  });

  it("run_prospect_profile_hook → POST /profile-hooks/:hookId/run, no retry on failure", async () => {
    const f = mockFetch({ error: "upstream" }, { status: 502 });
    const res = await tool("run_prospect_profile_hook").handler({ bearer_token: "tok", id: PID, hook_id: HOOK });
    expect(res.isError).toBe(true);
    expect(f).toHaveBeenCalledTimes(1);
    expect(calledMethod(f)).toBe("POST");
    expect(calledUrl(f).pathname).toBe(`/api/v1/prospects/${PID}/profile-hooks/${HOOK}/run`);
  });

  it("enrich_prospect_with_claire → POST /claire-enrich (billed, never retried)", async () => {
    const f = mockFetch({ error: "Insufficient credits" }, { status: 402 });
    const res = await tool("enrich_prospect_with_claire").handler({ bearer_token: "tok", id: PID });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("402");
    expect(f).toHaveBeenCalledTimes(1);
    expect(calledUrl(f).pathname).toBe(`/api/v1/prospects/${PID}/claire-enrich`);
  });

  it("revoke_prospect_share_link → DELETE /prospects/:id/share-link", async () => {
    const f = mockFetch({ success: true });
    await tool("revoke_prospect_share_link").handler({ bearer_token: "tok", id: PID });
    expect(calledMethod(f)).toBe("DELETE");
    expect(calledUrl(f).pathname).toBe(`/api/v1/prospects/${PID}/share-link`);
  });

  it("create_people_share_link → POST /workspace/people-share-link", async () => {
    const f = mockFetch({ data: { token: "t" } });
    await tool("create_people_share_link").handler({ bearer_token: "tok" });
    expect(calledMethod(f)).toBe("POST");
    expect(calledUrl(f).pathname).toBe("/api/v1/workspace/people-share-link");
  });

  it("search_workspace → GET /search with repeated types", async () => {
    const f = mockFetch({ query: "acme", groups: [] });
    await tool("search_workspace").handler({
      bearer_token: "tok",
      q: "acme",
      types: ["person", "organization"],
      limit: 10,
    });
    const url = calledUrl(f);
    expect(calledMethod(f)).toBe("GET");
    expect(url.pathname).toBe("/api/v1/search");
    expect(url.searchParams.get("q")).toBe("acme");
    expect(url.searchParams.getAll("types")).toEqual(["person", "organization"]);
    expect(url.searchParams.get("limit")).toBe("10");
    expect(url.searchParams.has("bearer_token")).toBe(false);
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { z } from "zod";
import type { McpServer } from "@/features/pilot-tools/shared";
import { registerIcpTools } from "@/features/pilot-tools/icp/tools";

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
  registerIcpTools(server);
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

const ICP = "11111111-1111-1111-1111-111111111111";
const LINK = "22222222-2222-2222-2222-222222222222";
const REC = "33333333-3333-3333-3333-333333333333";

beforeEach(() => {
  process.env.DIGITALCREW_API_BASE_URL = "https://api.test";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("icp tool registration", () => {
  it("registers the ICP tools with read-only hints on GETs", () => {
    const tools = capture();
    expect(tools.map((t) => t.name).sort()).toEqual(
      [
        "create_icp",
        "delete_icp",
        "generate_icp",
        "get_icp",
        "link_icp",
        "list_icp_links",
        "list_icps",
        "list_icps_for_record",
        "unlink_icp",
        "update_icp",
      ].sort(),
    );
    for (const name of ["list_icps", "get_icp", "list_icp_links", "list_icps_for_record"]) {
      expect(tool(name).config.annotations).toEqual({ readOnlyHint: true });
    }
    expect(tool("delete_icp").config.annotations).toEqual({ destructiveHint: true });
  });
});

describe("icp handlers", () => {
  it("list_icps sends status/search as query", async () => {
    const f = mockFetch({ data: [] });
    await tool("list_icps").handler({ bearer_token: "t", status: "all", search: "saas" });
    expect(method(f)).toBe("GET");
    expect(url(f).pathname).toBe("/api/v1/icp");
    expect(url(f).searchParams.get("status")).toBe("all");
    expect(url(f).searchParams.get("search")).toBe("saas");
    expect(url(f).searchParams.has("bearer_token")).toBe(false);
  });

  it("create_icp POSTs the body without the bearer", async () => {
    const f = mockFetch({ data: { id: ICP } }, { status: 201 });
    const res = await tool("create_icp").handler({
      bearer_token: "t",
      name: "Mid-market SaaS",
      criteria: { jobTitles: ["COO"], seniorities: ["vp"] },
      is_default: true,
    });
    expect(res.isError).toBeUndefined();
    expect(method(f)).toBe("POST");
    expect(url(f).pathname).toBe("/api/v1/icp");
    expect(body(f)).toEqual({
      name: "Mid-market SaaS",
      criteria: { jobTitles: ["COO"], seniorities: ["vp"] },
      is_default: true,
    });
  });

  it("update_icp PATCHes /icp/:id and keeps the id out of the body", async () => {
    const f = mockFetch({ data: { id: ICP } });
    await tool("update_icp").handler({ bearer_token: "t", icp_id: ICP, status: "archived" });
    expect(method(f)).toBe("PATCH");
    expect(url(f).pathname).toBe(`/api/v1/icp/${ICP}`);
    expect(body(f)).toEqual({ status: "archived" });
  });

  it("link_icp POSTs to /icp/:id/links", async () => {
    const f = mockFetch({ data: { id: LINK } }, { status: 201 });
    await tool("link_icp").handler({
      bearer_token: "t",
      icp_id: ICP,
      entity_type: "prospect",
      entity_id: REC,
      fit_score: 80,
    });
    expect(method(f)).toBe("POST");
    expect(url(f).pathname).toBe(`/api/v1/icp/${ICP}/links`);
    expect(body(f)).toEqual({ entity_type: "prospect", entity_id: REC, fit_score: 80 });
  });

  it("unlink_icp DELETEs /icp/:id/links/:linkId", async () => {
    const f = mockFetch({ data: { id: LINK } });
    await tool("unlink_icp").handler({ bearer_token: "t", icp_id: ICP, link_id: LINK });
    expect(method(f)).toBe("DELETE");
    expect(url(f).pathname).toBe(`/api/v1/icp/${ICP}/links/${LINK}`);
  });

  it("list_icps_for_record reads the reverse index", async () => {
    const f = mockFetch({ data: [] });
    await tool("list_icps_for_record").handler({
      bearer_token: "t",
      entity_type: "deal",
      entity_id: REC,
    });
    expect(url(f).pathname).toBe("/api/v1/icp/links");
    expect(url(f).searchParams.get("entity_type")).toBe("deal");
    expect(url(f).searchParams.get("entity_id")).toBe(REC);
  });

  it("generate_icp POSTs once and does not retry a failure", async () => {
    const f = mockFetch({ error: "upstream" }, { status: 503 });
    const res = await tool("generate_icp").handler({
      bearer_token: "t",
      instructions: "Belgian construction SMEs",
    });
    expect(res.isError).toBe(true);
    expect(f).toHaveBeenCalledTimes(1);
    expect(url(f).pathname).toBe("/api/v1/icp/generate");
    expect(body(f)).toEqual({ instructions: "Belgian construction SMEs" });
  });
});

describe("icp schemas", () => {
  it("rejects a non-uuid icp_id and an out-of-range fit_score", () => {
    const schema = tool("link_icp").config.inputSchema as z.ZodTypeAny;
    expect(
      schema.safeParse({ icp_id: "nope", entity_type: "deal", entity_id: REC }).success,
    ).toBe(false);
    expect(
      schema.safeParse({ icp_id: ICP, entity_type: "deal", entity_id: REC, fit_score: 101 })
        .success,
    ).toBe(false);
    expect(
      schema.safeParse({ icp_id: ICP, entity_type: "deal", entity_id: REC, fit_score: 50 })
        .success,
    ).toBe(true);
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { z } from "zod";
import type { McpServer } from "@/features/pilot-tools/shared";
import {
  registerLinkedinTools,
  registerLinkedinToolsGrouped,
} from "@/features/pilot-tools/linkedin/tools";

type Captured = {
  name: string;
  config: Record<string, unknown>;
  handler: (input: Record<string, unknown>) => Promise<{
    content: Array<{ type: "text"; text: string }>;
    isError?: boolean;
  }>;
};

function capture(register: (server: McpServer) => void): Captured[] {
  const tools: Captured[] = [];
  const server: McpServer = {
    registerTool(name, config, handler) {
      tools.push({ name, config, handler });
    },
  };
  register(server);
  return tools;
}

function flatTool(name: string): Captured {
  const found = capture(registerLinkedinTools).find((t) => t.name === name);
  if (!found) throw new Error(`tool "${name}" was not registered`);
  return found;
}

/** The grouped `linkedin` tool's discriminated-union input schema. */
function groupedSchema(): z.ZodTypeAny {
  const found = capture(registerLinkedinToolsGrouped).find(
    (t) => t.name === "linkedin",
  );
  if (!found) throw new Error("grouped linkedin tool was not registered");
  return found.config.inputSchema as z.ZodTypeAny;
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

const TOKEN = "max_live_test_token";

beforeEach(() => {
  process.env.DIGITALCREW_API_BASE_URL = "https://api.test";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("linkedin search tool registration", () => {
  it("registers the search tools in flat mode", () => {
    const names = capture(registerLinkedinTools).map((t) => t.name);
    expect(names).toContain("linkedin_search_people");
    expect(names).toContain("linkedin_search_parameters");
    expect(names).toContain("linkedin_get_search_quota");
    expect(names).toContain("linkedin_save_search_list");
  });

  it("accepts the search actions in grouped mode", () => {
    for (const input of [
      { action: "search_people", keywords: "CTO" },
      { action: "search_parameters", type: "LOCATION", keywords: "paris" },
      { action: "get_search_quota" },
      {
        action: "save_search_list",
        list_name: "Paris CTOs",
        items: [{ id: "PID1", name: "Jane Doe" }],
      },
    ]) {
      const parsed = groupedSchema().safeParse(input);
      expect(parsed.success, `action "${input.action}" should be valid`).toBe(true);
    }
  });
});

describe("search_people schema", () => {
  const shape = () =>
    flatTool("linkedin_search_people").config.inputSchema as Record<
      string,
      z.ZodTypeAny
    >;

  it("accepts keywords-only, cursor-only, and filters-only inputs (grouped)", () => {
    const s = groupedSchema();
    expect(s.safeParse({ action: "search_people", keywords: "CTO" }).success).toBe(true);
    expect(s.safeParse({ action: "search_people", cursor: "NEXT" }).success).toBe(true);
    expect(
      s.safeParse({
        action: "search_people",
        location: ["102277331"],
        industry: ["4"],
        network_distance: [1, 2],
      }).success,
    ).toBe(true);
  });

  it("bounds limit to 1..50 and network_distance to 1..3", () => {
    const s = groupedSchema();
    expect(s.safeParse({ action: "search_people", keywords: "x", limit: 0 }).success).toBe(false);
    expect(s.safeParse({ action: "search_people", keywords: "x", limit: 51 }).success).toBe(false);
    expect(
      s.safeParse({ action: "search_people", keywords: "x", network_distance: [4] }).success,
    ).toBe(false);
  });

  it("accepts only known api values", () => {
    const s = groupedSchema();
    for (const api of ["classic", "sales_navigator", "recruiter"]) {
      expect(s.safeParse({ action: "search_people", keywords: "x", api }).success).toBe(true);
    }
    expect(
      s.safeParse({ action: "search_people", keywords: "x", api: "premium" }).success,
    ).toBe(false);
  });

  it("declares every documented filter in the flat schema", () => {
    expect(Object.keys(shape())).toEqual(
      expect.arrayContaining([
        "keywords",
        "limit",
        "cursor",
        "location",
        "industry",
        "company",
        "network_distance",
      ]),
    );
  });
});

describe("search_parameters schema", () => {
  it("rejects unknown parameter types", () => {
    const s = groupedSchema();
    expect(
      s.safeParse({ action: "search_parameters", type: "CITY", keywords: "paris" }).success,
    ).toBe(false);
  });

  it("requires keywords", () => {
    const s = groupedSchema();
    expect(s.safeParse({ action: "search_parameters", type: "LOCATION" }).success).toBe(false);
  });
});

describe("search tool handlers", () => {
  it("forwards search_people filters as repeated query params", async () => {
    const fetchMock = mockFetch({ items: [], cursor: null });
    const res = await flatTool("linkedin_search_people").handler({
      bearer_token: TOKEN,
      keywords: "CTO",
      limit: 5,
      location: ["101", "102"],
      network_distance: [2],
    });
    expect(res.isError).toBeUndefined();
    const url = calledUrl(fetchMock);
    expect(url.pathname).toBe("/api/v1/linkedin/search-people");
    expect(url.searchParams.get("keywords")).toBe("CTO");
    expect(url.searchParams.get("limit")).toBe("5");
    expect(url.searchParams.getAll("location")).toEqual(["101", "102"]);
    expect(url.searchParams.getAll("network_distance")).toEqual(["2"]);
    expect(url.searchParams.has("bearer_token")).toBe(false);
  });

  it("routes search_parameters to /search-parameters", async () => {
    const fetchMock = mockFetch({ items: [{ id: "1", title: "Paris" }] });
    await flatTool("linkedin_search_parameters").handler({
      bearer_token: TOKEN,
      type: "LOCATION",
      keywords: "paris",
    });
    const url = calledUrl(fetchMock);
    expect(url.pathname).toBe("/api/v1/linkedin/search-parameters");
    expect(url.searchParams.get("type")).toBe("LOCATION");
    expect(url.searchParams.get("keywords")).toBe("paris");
  });

  it("routes get_search_quota to /search-quota with no params", async () => {
    const fetchMock = mockFetch({ cap: 50, used_today: 5, remaining: 45 });
    const res = await flatTool("linkedin_get_search_quota").handler({
      bearer_token: TOKEN,
    });
    expect(res.isError).toBeUndefined();
    const url = calledUrl(fetchMock);
    expect(url.pathname).toBe("/api/v1/linkedin/search-quota");
    expect([...url.searchParams.keys()]).toEqual([]);
  });

  it("posts save_search_list bodies to /save-list", async () => {
    const fetchMock = mockFetch({ success: true, list_id: "l1" });
    await flatTool("linkedin_save_search_list").handler({
      bearer_token: TOKEN,
      list_name: "Paris CTOs",
      items: [{ id: "PID1", name: "Jane Doe" }],
    });
    const url = calledUrl(fetchMock);
    expect(url.pathname).toBe("/api/v1/linkedin/save-list");
    expect(fetchMock.mock.calls[0][1]?.method).toBe("POST");
    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(body.list_name).toBe("Paris CTOs");
    expect(body.bearer_token).toBeUndefined();
  });

  it("surfaces the upstream 429 quota error to the model", async () => {
    mockFetch(
      {
        error: "LinkedIn search limit reached: 50 of 50 searches used today.",
        code: "SEARCH_QUOTA_EXCEEDED",
      },
      { status: 429 },
    );
    const res = await flatTool("linkedin_search_people").handler({
      bearer_token: TOKEN,
      keywords: "CTO",
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("429");
    expect(res.content[0].text).toContain("SEARCH_QUOTA_EXCEEDED");
  });
});

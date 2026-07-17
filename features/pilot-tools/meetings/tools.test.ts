import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { McpServer } from "@/features/pilot-tools/shared";
import {
  registerMeetingTools,
  MEETINGS_CAPABILITIES,
} from "@/features/pilot-tools/meetings/tools";

// The grouped tool's handler is reached through registerTool, so capture what
// registration hands the server and drive the handlers the way mcp-handler will.
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
  registerMeetingTools(server);
  return tools;
}

function tool(name: string): Captured {
  const found = capture().find((t) => t.name === name);
  if (!found) throw new Error(`tool "${name}" was not registered`);
  return found;
}

/** Mock fetch, returning `body`, and expose the calls for assertion. */
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

/** The URL the tool actually called upstream. */
function calledUrl(fetchMock: ReturnType<typeof mockFetch>): URL {
  return new URL(fetchMock.mock.calls[0][0]);
}

beforeEach(() => {
  process.env.DIGITALCREW_API_BASE_URL = "https://api.test";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("meetings tool registration", () => {
  it("registers the grouped `meetings` tool and flat prospect_list_meetings", () => {
    const names = capture().map((t) => t.name);
    expect(names).toContain("meetings");
    expect(names).toContain("prospect_list_meetings");
  });

  it("exposes list as an action on the grouped tool", async () => {
    const fetchMock = mockFetch({ data: [], nextCursor: null });
    await tool("meetings").handler({ action: "list", bearer_token: "t" });
    expect(calledUrl(fetchMock).pathname).toBe("/api/v1/meeting-hub/sessions");
  });

  it("rejects an unknown action rather than silently doing nothing", async () => {
    const res = await tool("meetings").handler({
      action: "not_a_real_action",
      bearer_token: "t",
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("Unknown action");
  });
});

describe("meetings capability names", () => {
  it("registers meetings.read for every read tool", () => {
    expect(MEETINGS_CAPABILITIES).toEqual({
      "meetings.list": "meetings.read",
      prospect_list_meetings: "meetings.read",
    });
  });

  it("covers every registered action and flat tool", () => {
    // A tool with no capability name is a tool the 403 layer cannot govern once
    // the route declares one — so the map must not fall behind registration.
    const flat = capture()
      .map((t) => t.name)
      .filter((n) => n !== "meetings");
    for (const name of flat) {
      expect(MEETINGS_CAPABILITIES, `${name} has no capability name`).toHaveProperty(name);
    }
  });
});

describe("meetings pagination", () => {
  it("passes the cursor through to the API unchanged", async () => {
    const fetchMock = mockFetch({ data: [], nextCursor: null });
    await tool("meetings").handler({
      action: "list",
      bearer_token: "t",
      cursor: "eyJzIjoiMjAyNi0wNy0xNyJ9",
      limit: 25,
    });
    const url = calledUrl(fetchMock);
    expect(url.searchParams.get("cursor")).toBe("eyJzIjoiMjAyNi0wNy0xNyJ9");
    expect(url.searchParams.get("limit")).toBe("25");
  });

  it("surfaces the API's nextCursor to the caller instead of truncating", async () => {
    mockFetch({
      data: [{ id: "m1" }],
      nextCursor: "cursor-page-2",
    });
    const res = await tool("meetings").handler({ action: "list", bearer_token: "t" });
    expect(JSON.parse(res.content[0].text).nextCursor).toBe("cursor-page-2");
  });

  it("surfaces a null nextCursor (last page) as null, not as a missing field", async () => {
    mockFetch({ data: [{ id: "m1" }], nextCursor: null });
    const res = await tool("meetings").handler({ action: "list", bearer_token: "t" });
    const body = JSON.parse(res.content[0].text);
    expect(body).toHaveProperty("nextCursor");
    expect(body.nextCursor).toBeNull();
  });

  it("omits cursor entirely on the first page", async () => {
    const fetchMock = mockFetch({ data: [], nextCursor: null });
    await tool("meetings").handler({ action: "list", bearer_token: "t" });
    expect(calledUrl(fetchMock).searchParams.has("cursor")).toBe(false);
  });
});

describe("meetings tenancy", () => {
  it("has no workspace/tenant argument on any tool — the bearer decides", () => {
    // A workspace_id arg would let a caller pick a tenant. prospect_id is a
    // filter within the authenticated workspace, which is a different thing.
    for (const t of capture()) {
      const schema = JSON.stringify(t.config.inputSchema ?? {});
      expect(schema, `${t.name} exposes a tenant selector`).not.toMatch(
        /workspace_?[Ii]d|tenant_?[Ii]d/,
      );
    }
  });

  it("sends prospect_id as a filter param, not a tenant selector", async () => {
    const fetchMock = mockFetch({ data: [], nextCursor: null });
    await tool("prospect_list_meetings").handler({
      bearer_token: "t",
      prospect_id: "11111111-1111-1111-1111-111111111111",
    });
    const url = calledUrl(fetchMock);
    expect(url.searchParams.get("prospectId")).toBe(
      "11111111-1111-1111-1111-111111111111",
    );
    expect(url.pathname).toBe("/api/v1/meeting-hub/sessions");
  });
});

describe("meetings error handling", () => {
  it("surfaces a 400 from the API as an error, not an empty result", async () => {
    mockFetch({ error: "Invalid query parameters", details: [] }, { status: 400 });
    const res = await tool("meetings").handler({ action: "list", bearer_token: "t" });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("400");
  });

  it("never echoes bearer material out of an upstream error body", async () => {
    mockFetch("upstream said: Authorization: Bearer sk-live-supersecret", {
      status: 500,
    });
    const res = await tool("meetings").handler({ action: "list", bearer_token: "t" });
    expect(res.content[0].text).not.toContain("sk-live-supersecret");
    expect(res.content[0].text).toContain("[redacted]");
  });
});

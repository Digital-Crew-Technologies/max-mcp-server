import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { McpServer } from "@/features/pilot-tools/shared";
import {
  registerDataQualityTools,
  DATA_QUALITY_CAPABILITIES,
} from "@/features/pilot-tools/data-quality/tools";
import * as repo from "@/features/pilot-tools/data-quality/repository";
import * as S from "@/features/pilot-tools/data-quality/schema";

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
  registerDataQualityTools(server);
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

beforeEach(() => {
  process.env.DIGITALCREW_API_BASE_URL = "https://api.test";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const PAIR_ID = "11111111-1111-1111-1111-111111111111";

describe("data-quality tool registration", () => {
  it("registers ONE grouped `data_quality` tool", () => {
    expect(capture().map((t) => t.name)).toEqual(["data_quality"]);
  });

  it("rejects an unknown action rather than silently doing nothing", async () => {
    const res = await tool("data_quality").handler({
      action: "not_a_real_action",
      bearer_token: "t",
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("Unknown action");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Agents detect, humans merge. POST /data-quality/merge is JWT-only upstream
// (API keys get 401): a merge rewrites both records, repoints every reference
// and tombstones the loser — a signed-in human clicks it after looking at
// both records. If any of these fail, someone routed around that gate.
// ─────────────────────────────────────────────────────────────────────────────

describe("no tool can merge records", () => {
  it("registers no tool whose name mentions merge", () => {
    for (const t of capture()) {
      expect(t.name).not.toMatch(/merge/i);
    }
  });

  it("offers no merge action on the grouped tool", async () => {
    for (const action of ["merge", "merge_records", "merge_duplicates"]) {
      const res = await tool("data_quality").handler({
        action,
        bearer_token: "t",
      });
      expect(res.isError, `action "${action}" exists`).toBe(true);
    }
  });

  it("exports no merge function or schema", () => {
    for (const name of [...Object.keys(repo), ...Object.keys(S)]) {
      expect(name).not.toMatch(/merge/i);
    }
  });
});

describe("data-quality tenancy", () => {
  it("has no workspace/tenant argument on any tool — the bearer decides", () => {
    for (const t of capture()) {
      const schema = JSON.stringify(t.config.inputSchema ?? {});
      expect(schema, `${t.name} exposes a tenant selector`).not.toMatch(
        /workspace_?[Ii]d|tenant_?[Ii]d/,
      );
    }
  });
});

describe("data-quality capability names", () => {
  it("covers every action, split read vs triage", () => {
    expect(DATA_QUALITY_CAPABILITIES).toEqual({
      "data_quality.list_duplicates": "data_quality.read",
      "data_quality.scan": "data_quality.triage",
      "data_quality.dismiss": "data_quality.triage",
    });
  });
});

describe("data-quality actions", () => {
  it("lists pending pairs for one entity type", async () => {
    const fetchMock = mockFetch({ data: [], counts: { prospect: 0, organization: 0 } });
    await tool("data_quality").handler({
      action: "list_duplicates",
      bearer_token: "t",
      entity_type: "organization",
    });
    const url = calledUrl(fetchMock);
    expect(url.pathname).toBe("/api/v1/data-quality/duplicates");
    expect(url.searchParams.get("entity_type")).toBe("organization");
  });

  it("triggers a workspace rescan with POST", async () => {
    const fetchMock = mockFetch({ data: { prospectPairs: 3, organizationPairs: 1 } });
    await tool("data_quality").handler({ action: "scan", bearer_token: "t" });
    expect(calledUrl(fetchMock).pathname).toBe("/api/v1/data-quality/duplicates/scan");
    expect(fetchMock.mock.calls[0][1]?.method).toBe("POST");
  });

  it("dismisses a pair by PATCHing status=dismissed — the only settable status", async () => {
    const fetchMock = mockFetch({ success: true });
    await tool("data_quality").handler({
      action: "dismiss",
      bearer_token: "t",
      id: PAIR_ID,
    });
    expect(calledUrl(fetchMock).pathname).toBe(
      `/api/v1/data-quality/duplicates/${PAIR_ID}`,
    );
    expect(fetchMock.mock.calls[0][1]?.method).toBe("PATCH");
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({
      status: "dismissed",
    });
  });
});

describe("data-quality error handling", () => {
  it("never echoes bearer material out of an upstream error body", async () => {
    mockFetch("upstream said: Authorization: Bearer sk-live-supersecret", {
      status: 500,
    });
    const res = await tool("data_quality").handler({
      action: "list_duplicates",
      bearer_token: "t",
    });
    expect(res.content[0].text).not.toContain("sk-live-supersecret");
    expect(res.content[0].text).toContain("[redacted]");
  });
});

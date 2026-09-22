import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { McpServer } from "@/features/pilot-tools/shared";
import { registerAccountTools } from "@/features/pilot-tools/accounts/tools";

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
  registerAccountTools(server);
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

const ACCOUNT = "66666666-6666-6666-6666-666666666666";

beforeEach(() => {
  process.env.DIGITALCREW_API_BASE_URL = "https://api.test";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("account tool registration", () => {
  it("registers the sync and share-listing tools, and no share mutation", () => {
    const names = capture().map((t) => t.name);
    expect(names).toContain("sync_accounts");
    expect(names).toContain("list_account_shares");
    expect(new Set(names).size).toBe(names.length);
    // POST/DELETE /workspace/account-shares 403 API keys (owner-only).
    for (const n of names) expect(n).not.toMatch(/^(share|unshare)_account/);
  });
});

describe("account handlers", () => {
  it("sync_accounts → POST /accounts/sync", async () => {
    const fetchMock = mockFetch({ success: true });
    const res = await tool("sync_accounts").handler({ bearer_token: "t" });
    expect(res.isError).toBeUndefined();
    expect(calledMethod(fetchMock)).toBe("POST");
    expect(calledUrl(fetchMock).pathname).toBe("/api/v1/accounts/sync");
  });

  it("list_account_shares → GET /workspace/account-shares?account_id=", async () => {
    const fetchMock = mockFetch({ data: [] });
    await tool("list_account_shares").handler({ bearer_token: "t", account_id: ACCOUNT });
    expect(calledMethod(fetchMock)).toBe("GET");
    expect(calledUrl(fetchMock).pathname).toBe("/api/v1/workspace/account-shares");
    expect(calledUrl(fetchMock).searchParams.get("account_id")).toBe(ACCOUNT);
  });
});

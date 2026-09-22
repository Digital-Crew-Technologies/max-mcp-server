import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { z } from "zod";
import type { McpServer } from "@/features/pilot-tools/shared";
import { registerSocialTools } from "@/features/pilot-tools/social/tools";

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
  registerSocialTools(server);
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

const ACCOUNT = "55555555-5555-5555-5555-555555555555";

// max-agent social.schema.ts operation names; reads are GET, the rest POST.
const READS = [
  "inmail_balance", "list_invitations_sent", "list_invitations_received", "relationship",
  "list_posts", "get_post", "list_comments", "list_reactions",
];
const WRITES = [
  "invite", "send_inmail", "cancel_invitation", "handle_invitation", "follow",
  "endorse_skill", "react", "comment", "create_post",
];

beforeEach(() => {
  process.env.DIGITALCREW_API_BASE_URL = "https://api.test";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("social tool registration", () => {
  it("registers exactly one social_<operation> tool per max-agent operation", () => {
    const names = capture().map((t) => t.name).sort();
    expect(names).toEqual([...READS, ...WRITES].map((op) => `social_${op}`).sort());
  });

  it("marks exactly the read operations read-only", () => {
    for (const t of capture()) {
      const op = t.name.replace(/^social_/, "");
      const hints = (t.config.annotations ?? {}) as Record<string, boolean>;
      expect(hints.readOnlyHint === true, t.name).toBe(READS.includes(op));
    }
  });

  it("does not expose base64 image attachments on create_post", () => {
    const schema = tool("social_create_post").config.inputSchema as z.AnyZodObject;
    expect(Object.keys(schema.shape)).not.toContain("attachments");
  });
});

describe("social handlers", () => {
  it("reads → GET /social/<action> with query args and no bearer_token", async () => {
    const fetchMock = mockFetch({ data: { items: [], cursor: null } });
    const res = await tool("social_list_posts").handler({
      bearer_token: "t", account_id: ACCOUNT, provider_id: "ACoAAB", is_company: true, limit: 5,
    });
    expect(res.isError).toBeUndefined();
    expect(calledMethod(fetchMock)).toBe("GET");
    const url = calledUrl(fetchMock);
    expect(url.pathname).toBe("/api/v1/social/list-posts");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      account_id: ACCOUNT, provider_id: "ACoAAB", is_company: "true", limit: "5",
    });
  });

  it("writes → POST /social/<action> with a JSON body and no bearer_token", async () => {
    const fetchMock = mockFetch({ data: { comment_id: "c1" } });
    await tool("social_comment").handler({
      bearer_token: "t", account_id: ACCOUNT, post_id: "urn:li:activity:1", text: "Nice",
    });
    expect(calledMethod(fetchMock)).toBe("POST");
    expect(calledUrl(fetchMock).pathname).toBe("/api/v1/social/comment");
    expect(calledBody(fetchMock)).toEqual({ account_id: ACCOUNT, post_id: "urn:li:activity:1", text: "Nice" });
  });

  it("uses dashed action paths for multi-word operations", async () => {
    for (const [name, path] of [
      ["social_send_inmail", "send-inmail"],
      ["social_handle_invitation", "handle-invitation"],
      ["social_inmail_balance", "inmail-balance"],
    ] as const) {
      const fetchMock = mockFetch({ data: {} });
      await tool(name).handler({ bearer_token: "t", account_id: ACCOUNT });
      expect(calledUrl(fetchMock).pathname).toBe(`/api/v1/social/${path}`);
      vi.unstubAllGlobals();
    }
  });

  it("takes the invitation decision as `decision` and sends it upstream as `action`", async () => {
    const fetchMock = mockFetch({ data: { status: "ACCEPTED" } });
    await tool("social_handle_invitation").handler({
      bearer_token: "t", account_id: ACCOUNT, invitation_id: "inv-1", decision: "accept",
    });
    expect(calledBody(fetchMock)).toEqual({ account_id: ACCOUNT, invitation_id: "inv-1", action: "accept" });
  });

  it("never retries a public write", async () => {
    process.env.DIGITALCREW_API_BASE_URL = "https://social-no-retry.test";
    const fetchMock = mockFetch({ error: "unavailable" }, { status: 503 });
    const res = await tool("social_create_post").handler({ bearer_token: "t", account_id: ACCOUNT, text: "hi" });
    expect(res.isError).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

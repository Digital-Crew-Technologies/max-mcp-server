import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { McpServer } from "@/features/pilot-tools/shared";
import { registerDeliverabilityTools } from "@/features/pilot-tools/deliverability/tools";

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
  registerDeliverabilityTools(server);
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

const WARMUP = "22222222-2222-2222-2222-222222222222";
const ORDER = "33333333-3333-3333-3333-333333333333";

beforeEach(() => {
  process.env.DIGITALCREW_API_BASE_URL = "https://api.test";
  // The purchasing tools are opt-in; most tests below exercise them.
  process.env.ENABLE_PURCHASE_TOOLS = "true";
});

afterEach(() => {
  delete process.env.ENABLE_PURCHASE_TOOLS;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("deliverability tool registration", () => {
  it("does not register the money-spending tools unless ENABLE_PURCHASE_TOOLS=true", () => {
    delete process.env.ENABLE_PURCHASE_TOOLS;
    const names = capture().map((t) => t.name);
    expect(names).not.toContain("start_warmup");
    expect(names).not.toContain("resume_warmup");
    expect(names).not.toContain("create_mailpool_order");
    // Everything else — including the price quotes — is still there.
    expect(names).toEqual(expect.arrayContaining([
      "get_warmup_pricing", "get_mailpool_pricing", "list_mailpool_orders", "cancel_warmup",
    ]));
  });

  it("registers every tool once, and never the mailbox-credentials endpoint", () => {
    const names = capture().map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(expect.arrayContaining([
      "list_inbox_placements", "get_inbox_placement", "get_warmup_deliverability",
      "list_warmups", "get_warmup_pricing", "start_warmup", "update_warmup",
      "cancel_warmup", "resume_warmup", "sync_warmup", "sync_all_warmups",
      "list_mailpool_domains", "search_mailpool_domains", "get_mailpool_pricing",
      "list_mailpool_orders", "create_mailpool_order", "sync_mailpool_order",
    ]));
    for (const n of names) expect(n).not.toMatch(/mailbox_credential|get_mailpool_mailbox/);
  });

  it("puts the spend warning first on every purchasing tool", () => {
    for (const name of ["start_warmup", "create_mailpool_order"]) {
      expect(String(tool(name).config.description)).toMatch(/^CHARGES THE WORKSPACE/);
    }
    expect(String(tool("resume_warmup").config.description)).toMatch(/^MAY CHARGE THE WORKSPACE/);
  });

  it("marks reads read-only and cancel destructive", () => {
    const hints = (name: string) =>
      (tool(name).config.annotations ?? {}) as Record<string, boolean>;
    expect(hints("list_inbox_placements").readOnlyHint).toBe(true);
    expect(hints("list_mailpool_orders").readOnlyHint).toBe(true);
    expect(hints("cancel_warmup").destructiveHint).toBe(true);
    expect(hints("start_warmup").readOnlyHint).toBeUndefined();
  });
});

describe("deliverability handlers", () => {
  it("list_inbox_placements → GET /deliverability/inbox-placements?results=", async () => {
    const fetchMock = mockFetch({ data: [], fetched_at: "x" });
    const res = await tool("list_inbox_placements").handler({ bearer_token: "t", results: 3 });
    expect(res.isError).toBeUndefined();
    expect(calledMethod(fetchMock)).toBe("GET");
    expect(calledUrl(fetchMock).pathname).toBe("/api/v1/deliverability/inbox-placements");
    expect(calledUrl(fetchMock).searchParams.get("results")).toBe("3");
  });

  it("get_inbox_placement encodes the Mailpool check id", async () => {
    const fetchMock = mockFetch({ data: null });
    await tool("get_inbox_placement").handler({ bearer_token: "t", id: "chk_1.a" });
    expect(calledUrl(fetchMock).pathname).toBe("/api/v1/deliverability/inbox-placements/chk_1.a");
  });

  it("start_warmup → POST /warmup with emails + settings, no token in body", async () => {
    const fetchMock = mockFetch({ data: { started: [], failed: [], tokens_charged: 0 } }, { status: 201 });
    await tool("start_warmup").handler({
      bearer_token: "t",
      emails: ["a@x.com"],
      settings: { daily_target: 20, ramp_up_days: 14 },
    });
    expect(calledMethod(fetchMock)).toBe("POST");
    expect(calledUrl(fetchMock).pathname).toBe("/api/v1/warmup");
    expect(calledBody(fetchMock)).toEqual({
      emails: ["a@x.com"],
      settings: { daily_target: 20, ramp_up_days: 14 },
    });
  });

  it("update_warmup → PATCH /warmup/{id} with settings only", async () => {
    const fetchMock = mockFetch({ data: {} });
    await tool("update_warmup").handler({ bearer_token: "t", id: WARMUP, daily_target: 30, ramp_up_days: 10 });
    expect(calledMethod(fetchMock)).toBe("PATCH");
    expect(calledUrl(fetchMock).pathname).toBe(`/api/v1/warmup/${WARMUP}`);
    expect(calledBody(fetchMock)).toEqual({ daily_target: 30, ramp_up_days: 10 });
  });

  it("warm-up lifecycle tools hit POST /warmup/{id}/<verb>", async () => {
    for (const [name, suffix] of [
      ["cancel_warmup", "cancel"],
      ["resume_warmup", "resume"],
      ["sync_warmup", "sync"],
    ] as const) {
      const fetchMock = mockFetch({ data: {} });
      await tool(name).handler({ bearer_token: "t", id: WARMUP });
      expect(calledMethod(fetchMock)).toBe("POST");
      expect(calledUrl(fetchMock).pathname).toBe(`/api/v1/warmup/${WARMUP}/${suffix}`);
      vi.unstubAllGlobals();
    }
  });

  it("create_mailpool_order → POST /mailpool/orders with the order body", async () => {
    const fetchMock = mockFetch({ data: { order_id: ORDER } }, { status: 201 });
    const order = {
      domains: ["tryacme.com"],
      provider: "google",
      first_name: "Ada",
      last_name: "Lovelace",
      mailboxes: [{ domain: "tryacme.com", prefix: "ada" }],
    };
    await tool("create_mailpool_order").handler({ bearer_token: "t", ...order });
    expect(calledMethod(fetchMock)).toBe("POST");
    expect(calledUrl(fetchMock).pathname).toBe("/api/v1/mailpool/orders");
    expect(calledBody(fetchMock)).toEqual(order);
  });

  it("sync_mailpool_order → POST /mailpool/orders/{id}/sync", async () => {
    const fetchMock = mockFetch({ data: {} });
    await tool("sync_mailpool_order").handler({ bearer_token: "t", id: ORDER });
    expect(calledMethod(fetchMock)).toBe("POST");
    expect(calledUrl(fetchMock).pathname).toBe(`/api/v1/mailpool/orders/${ORDER}/sync`);
  });

  it("search_mailpool_domains → POST /mailpool/domains/search", async () => {
    const fetchMock = mockFetch({ data: [] });
    await tool("search_mailpool_domains").handler({ bearer_token: "t", query: "tryacme", tlds: [".io"] });
    expect(calledUrl(fetchMock).pathname).toBe("/api/v1/mailpool/domains/search");
    expect(calledBody(fetchMock)).toEqual({ query: "tryacme", tlds: [".io"] });
  });

  it("purchasing calls are never retried, even on a retryable 503", async () => {
    // Separate host so the failures can't trip the api.test circuit breaker.
    process.env.DIGITALCREW_API_BASE_URL = "https://purchase-no-retry.test";
    for (const [name, args] of [
      ["start_warmup", { emails: ["a@x.com"] }],
      ["resume_warmup", { id: WARMUP }],
      ["create_mailpool_order", {
        domains: ["tryacme.com"], first_name: "A", last_name: "B",
        mailboxes: [{ domain: "tryacme.com", prefix: "a" }],
      }],
    ] as const) {
      const fetchMock = mockFetch({ error: "unavailable" }, { status: 503 });
      const res = await tool(name).handler({ bearer_token: "t", ...args });
      expect(res.isError).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      vi.unstubAllGlobals();
    }
  });
});

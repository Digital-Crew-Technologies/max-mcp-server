import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { z } from "zod";
import type { McpServer } from "@/features/pilot-tools/shared";
import { registerWorkspaceAdminTools } from "@/features/pilot-tools/workspace-admin/tools";
import * as repo from "@/features/pilot-tools/workspace-admin/repository";

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
  registerWorkspaceAdminTools(server);
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

const ID = "55555555-5555-5555-5555-555555555555";

beforeEach(() => {
  process.env.DIGITALCREW_API_BASE_URL = "https://api.test";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("workspace admin tool registration", () => {
  it("leads with get_current_workspace, so the group's action list starts with it", () => {
    expect(capture()[0].name).toBe("get_current_workspace");
    expect(String(tool("get_current_workspace").config.description)).toMatch(/exactly ONE workspace/);
  });

  it("exposes no admin-only or credential-handling operation", () => {
    for (const t of capture()) {
      expect(t.name).not.toMatch(/connect_key|merge|create_custom|invite|set_budget|update_workspace_agents/);
    }
    for (const name of Object.keys(repo)) {
      expect(name).not.toMatch(/connectKey|merge|putSettings|putAgents|createCustomField/i);
    }
  });

  it("marks every plain read as read-only", () => {
    const reads = [
      "get_current_workspace",
      "list_custom_fields",
      "list_data_suppliers",
      "list_duplicate_records",
      "get_data_quality_settings",
      "get_workspace_agents",
      "list_workspace_members",
      "list_workspace_roles",
      "list_crew_rates",
      "list_digital_workers",
      "get_workspace_wallet",
      "list_wallet_budgets",
      "list_wallet_consumption",
      "list_wallet_gifts",
      "list_agent_sessions",
      "get_agent_session_messages",
    ];
    for (const name of reads) {
      expect(tool(name).config.annotations, name).toEqual({ readOnlyHint: true });
    }
  });
});

describe("workspace admin handlers", () => {
  it.each([
    ["get_current_workspace", "/api/v1/api-keys/verify"],
    ["list_data_suppliers", "/api/v1/data-suppliers"],
    ["get_data_quality_settings", "/api/v1/data-quality/settings"],
    ["get_workspace_agents", "/api/v1/workspace-agents"],
    ["list_workspace_members", "/api/v1/workspace/members"],
    ["list_workspace_roles", "/api/v1/workspace/roles"],
    ["list_crew_rates", "/api/v1/workspace/crew-rates"],
    ["list_digital_workers", "/api/v1/workspace/digital-workers"],
    ["get_workspace_wallet", "/api/v1/billing/workspace-wallet"],
    ["list_wallet_budgets", "/api/v1/billing/workspace-wallet/budgets"],
    ["list_wallet_gifts", "/api/v1/billing/workspace-wallet/gifts"],
  ])("%s GETs %s", async (name, path) => {
    const f = mockFetch({ data: [] });
    await tool(name).handler({ bearer_token: "t" });
    expect(method(f)).toBe("GET");
    expect(url(f).pathname).toBe(path);
    expect(url(f).search).toBe("");
  });

  it("list_custom_fields forwards entity_type and includeArchived", async () => {
    const f = mockFetch({ data: [] });
    await tool("list_custom_fields").handler({
      bearer_token: "t",
      entity_type: "deal",
      includeArchived: true,
    });
    expect(url(f).pathname).toBe("/api/v1/custom-fields");
    expect(url(f).searchParams.get("entity_type")).toBe("deal");
    expect(url(f).searchParams.get("includeArchived")).toBe("true");
  });

  it("update_data_supplier PATCHes the provider config path", async () => {
    const f = mockFetch({ data: { provider: "apollo" } });
    await tool("update_data_supplier").handler({
      bearer_token: "t",
      provider: "apollo",
      enabled: false,
    });
    expect(method(f)).toBe("PATCH");
    expect(url(f).pathname).toBe("/api/v1/data-suppliers/apollo/config");
    expect(body(f)).toEqual({ enabled: false });
  });

  it("disconnect_data_supplier POSTs to /disconnect and is destructive", async () => {
    expect(tool("disconnect_data_supplier").config.annotations).toEqual({ destructiveHint: true });
    const f = mockFetch({ data: { provider: "explorium", connected: false } });
    await tool("disconnect_data_supplier").handler({ bearer_token: "t", provider: "explorium" });
    expect(method(f)).toBe("POST");
    expect(url(f).pathname).toBe("/api/v1/data-suppliers/explorium/disconnect");
  });

  it("rejects an unknown data supplier at the schema", () => {
    const schema = tool("update_data_supplier").config.inputSchema as z.ZodTypeAny;
    expect(schema.safeParse({ provider: "zoominfo" }).success).toBe(false);
  });

  it("dismiss_duplicate_pair PATCHes status=dismissed", async () => {
    const f = mockFetch({ success: true });
    await tool("dismiss_duplicate_pair").handler({ bearer_token: "t", pair_id: ID });
    expect(method(f)).toBe("PATCH");
    expect(url(f).pathname).toBe(`/api/v1/data-quality/duplicates/${ID}`);
    expect(body(f)).toEqual({ status: "dismissed" });
  });

  it("list_duplicate_records passes entity_type", async () => {
    const f = mockFetch({ data: [], counts: {} });
    await tool("list_duplicate_records").handler({ bearer_token: "t", entity_type: "organization" });
    expect(url(f).pathname).toBe("/api/v1/data-quality/duplicates");
    expect(url(f).searchParams.get("entity_type")).toBe("organization");
  });

  it("scan_duplicate_records POSTs once without retrying", async () => {
    const f = mockFetch({ error: "busy" }, { status: 503 });
    const res = await tool("scan_duplicate_records").handler({ bearer_token: "t" });
    expect(res.isError).toBe(true);
    expect(f).toHaveBeenCalledTimes(1);
    expect(method(f)).toBe("POST");
    expect(url(f).pathname).toBe("/api/v1/data-quality/duplicates/scan");
  });

  it("generate_workspace_intel POSTs once without retrying", async () => {
    const f = mockFetch({ error: "slow" }, { status: 504 });
    const res = await tool("generate_workspace_intel").handler({ bearer_token: "t" });
    expect(res.isError).toBe(true);
    expect(f).toHaveBeenCalledTimes(1);
    expect(url(f).pathname).toBe("/api/v1/workspace-intel/generate");
  });

  it("list_wallet_consumption forwards since", async () => {
    const f = mockFetch({ data: [] });
    await tool("list_wallet_consumption").handler({
      bearer_token: "t",
      since: "2026-09-01T00:00:00Z",
    });
    expect(url(f).pathname).toBe("/api/v1/billing/workspace-wallet/consumption");
    expect(url(f).searchParams.get("since")).toBe("2026-09-01T00:00:00Z");
  });

  it("list_agent_sessions forwards limit and surface", async () => {
    const f = mockFetch({ data: [] });
    await tool("list_agent_sessions").handler({ bearer_token: "t", limit: 10, surface: "meetings" });
    expect(url(f).pathname).toBe("/api/v1/agent/sessions");
    expect(url(f).searchParams.get("limit")).toBe("10");
    expect(url(f).searchParams.get("surface")).toBe("meetings");
  });

  it("get_agent_session_messages reads /agent/sessions/:id/messages", async () => {
    const f = mockFetch({ data: { session: {}, messages: [] } });
    await tool("get_agent_session_messages").handler({ bearer_token: "t", session_id: ID });
    expect(method(f)).toBe("GET");
    expect(url(f).pathname).toBe(`/api/v1/agent/sessions/${ID}/messages`);
  });
});

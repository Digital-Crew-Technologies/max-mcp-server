import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { McpServer } from "@/features/pilot-tools/shared";
import { registerCrmTools } from "@/features/pilot-tools/crm/tools";
import { registerCrmLeadDispatchTools } from "@/features/pilot-tools/crm/lead-dispatch";

type Handler = (input: Record<string, unknown>) => Promise<{
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}>;

function tool(name: string): Handler {
  let found: Handler | undefined;
  const server: McpServer = {
    registerTool(n, _config, handler) {
      if (n === name) found = handler;
    },
  };
  registerCrmTools(server);
  registerCrmLeadDispatchTools(server);
  if (!found) throw new Error(`tool "${name}" was not registered`);
  return found;
}

function mockFetch(body: unknown, status = 200) {
  const fetchMock = vi.fn(
    async (_url: string, _init?: RequestInit) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  process.env.DIGITALCREW_API_BASE_URL = "https://api.test";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// These five tools used to fetch a HubSpot token from GET /api/v1/crm/access-token,
// a route max-agent no longer serves. They now call the scoped CRM routes.
describe("crm contact/company tools use max-agent's scoped CRM routes", () => {
  it("never asks max-agent for a HubSpot access token", async () => {
    const fetchMock = mockFetch({ data: [] });
    await tool("crm_search_contacts")({ bearer_token: "tok", query: "acme" });
    await tool("crm_get_contact")({ bearer_token: "tok", email: "a@acme.com" });
    await tool("crm_status")({ bearer_token: "tok" });
    for (const [url] of fetchMock.mock.calls) {
      expect(new URL(url).pathname).not.toBe("/api/v1/crm/access-token");
    }
  });

  it("search_contacts posts query + default limit", async () => {
    const fetchMock = mockFetch({ data: [{ id: "1" }] });
    const res = await tool("crm_search_contacts")({ bearer_token: "tok", query: "acme" });

    expect(res.isError).toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0];
    expect(new URL(url).pathname).toBe("/api/v1/crm/search-contacts");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toEqual({ query: "acme", limit: 20 });
  });

  it("upsert_contact forwards fields and extra properties, never the bearer", async () => {
    const fetchMock = mockFetch({ data: { id: "9" } });
    await tool("crm_upsert_contact")({
      bearer_token: "tok",
      email: "a@acme.com",
      firstName: "Ada",
      properties: { lifecyclestage: "lead" },
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(new URL(url).pathname).toBe("/api/v1/crm/upsert-contact");
    expect(JSON.parse(init?.body as string)).toEqual({
      email: "a@acme.com",
      firstName: "Ada",
      properties: { lifecyclestage: "lead" },
    });
  });

  it("maps a read-only connection to the reconnect message", async () => {
    mockFetch({ error: "HubSpot is connected read-only", code: "crm_read_only" }, 403);
    const res = await tool("crm_upsert_company")({ bearer_token: "tok", domain: "acme.com" });

    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/read-only mode/);
  });

  it("maps 409 to the connect-HubSpot message", async () => {
    mockFetch({ error: "HubSpot is not connected for this workspace." }, 409);
    const res = await tool("crm_get_contact")({ bearer_token: "tok", email: "a@acme.com" });

    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/not connected/);
  });

  it("crm_status reports connected from the connection list", async () => {
    mockFetch({ data: { connections: [{ provider: "hubspot", portal_id: "123" }] } });
    const res = await tool("crm_status")({ bearer_token: "tok" });
    expect(JSON.parse(res.content[0].text)).toMatchObject({ connected: true, provider: "hubspot" });

    vi.unstubAllGlobals();
    mockFetch({ data: { connections: [] } });
    const none = await tool("crm_status")({ bearer_token: "tok" });
    expect(JSON.parse(none.content[0].text)).toMatchObject({ connected: false });
  });
});

describe("crm_export_import_csv dedup", () => {
  it("looks each email up through the scoped get-contact route and drops existing contacts", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const { email } = JSON.parse(init?.body as string) as { email: string };
      const data = email === "old@acme.com" ? { id: "901" } : null;
      return new Response(JSON.stringify({ data }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await tool("crm_export_import_csv")({
      bearer_token: "tok",
      prospects: [{ email: "old@acme.com" }, { email: "new@acme.com" }],
      include_assignment: false,
    });

    expect(res.isError).toBeUndefined();
    for (const [url] of fetchMock.mock.calls) {
      expect(new URL(url).pathname).toBe("/api/v1/crm/get-contact");
    }
    const out = JSON.parse(res.content[0].text);
    expect(out.deduped).toEqual([{ email: "old@acme.com", existing_id: "901" }]);
    expect(out.row_count).toBe(1);
  });
});

// Deals, activities, owners and stages read HubSpot through max-agent's scoped
// routes (crm:read); the old GET /api/v1/crm/access-token is gone.
describe("crm deal/activity/owner/stage tools use max-agent's scoped read routes", () => {
  it("crm_list_deals posts the filters and maps name to dealname", async () => {
    const fetchMock = mockFetch({ data: [{ id: "9001", name: "Renewal", amount: 1200 }] });
    const res = await tool("crm_list_deals")({ bearer_token: "tok", ownerId: "7", limit: 10 });

    expect(res.isError).toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0];
    expect(new URL(url).pathname).toBe("/api/v1/crm/list-deals");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toMatchObject({ ownerId: "7", limit: 10 });
    expect(JSON.parse(res.content[0].text)).toEqual([
      expect.objectContaining({ id: "9001", dealname: "Renewal", amount: 1200, associatedCompanyIds: [] }),
    ]);
  });

  it("crm_get_deal posts the id", async () => {
    const fetchMock = mockFetch({ data: { id: "42", name: "Big one" } });
    const res = await tool("crm_get_deal")({ bearer_token: "tok", id: "42" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(new URL(url).pathname).toBe("/api/v1/crm/get-deal");
    expect(JSON.parse(init?.body as string)).toEqual({ id: "42" });
    expect(JSON.parse(res.content[0].text)).toMatchObject({ id: "42", dealname: "Big one" });
  });

  it("crm_list_owners and crm_list_pipeline_stages are GET reads", async () => {
    const fetchMock = mockFetch({ data: [] });
    await tool("crm_list_owners")({ bearer_token: "tok" });
    await tool("crm_list_pipeline_stages")({ bearer_token: "tok", pipelineId: "default" });

    const paths = fetchMock.mock.calls.map(([url]) => new URL(url).pathname + new URL(url).search);
    expect(paths).toEqual([
      "/api/v1/crm/list-owners",
      "/api/v1/crm/list-pipeline-stages?pipelineId=default",
    ]);
    for (const [, init] of fetchMock.mock.calls) expect(init?.method ?? "GET").toBe("GET");
  });

  it("never asks max-agent for a HubSpot access token", async () => {
    const fetchMock = mockFetch({ data: [] });
    await tool("crm_list_deals")({ bearer_token: "tok" });
    await tool("crm_list_activities")({ bearer_token: "tok" });
    for (const [url] of fetchMock.mock.calls) {
      expect(new URL(url).pathname).not.toBe("/api/v1/crm/access-token");
    }
  });

  it("maps 409 crm_not_connected to the connect-HubSpot message", async () => {
    mockFetch({ error: "HubSpot is not connected for this workspace.", code: "crm_not_connected" }, 409);
    const res = await tool("crm_list_deals")({ bearer_token: "tok" });

    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/not connected/);
  });

  it("maps 409 crm_reauth_required to the reconnect message", async () => {
    mockFetch({ error: "expired", code: "crm_reauth_required" }, 409);
    const res = await tool("crm_list_owners")({ bearer_token: "tok" });

    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/has expired. Reconnect HubSpot/);
  });
});

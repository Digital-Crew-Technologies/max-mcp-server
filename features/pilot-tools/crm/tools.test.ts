import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { McpServer } from "@/features/pilot-tools/shared";
import { registerCrmTools } from "@/features/pilot-tools/crm/tools";
import { registerCrmLeadDispatchTools } from "@/features/pilot-tools/crm/lead-dispatch";
import { registerCrmComposerTools } from "@/features/pilot-tools/crm/composers";
import { registerCrmForecastTools } from "@/features/pilot-tools/crm/forecast";

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
  registerCrmComposerTools(server);
  registerCrmForecastTools(server);
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

/** Answer each max-agent path with its own body; unknown paths 404. */
function mockRoutes(routes: Record<string, { body: unknown; status?: number }>) {
  const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
    const route = routes[new URL(url).pathname];
    return new Response(JSON.stringify(route?.body ?? { error: "not found" }), {
      status: route ? route.status ?? 200 : 404,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const DAY = 24 * 60 * 60 * 1000;

beforeEach(() => {
  process.env.DIGITALCREW_API_BASE_URL = "https://api.test";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// These tools used to fetch a HubSpot token from GET /api/v1/crm/access-token,
// a route max-agent no longer serves. They now call the scoped CRM routes.
describe("crm contact/company tools use max-agent's scoped CRM routes", () => {
  it("never asks max-agent for a HubSpot access token", async () => {
    const fetchMock = mockFetch({ data: [] });
    await tool("crm_search_contacts")({ bearer_token: "tok", query: "acme" });
    await tool("crm_get_contact")({ bearer_token: "tok", email: "a@acme.com" });
    await tool("crm_status")({ bearer_token: "tok" });
    await tool("crm_list_deals")({ bearer_token: "tok" });
    await tool("crm_list_owners")({ bearer_token: "tok" });
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

// These tools and the composites built on them read HubSpot through
// max-agent's scoped read routes; nothing asks for a HubSpot credential.
describe("crm deal/activity/owner/stage tools use max-agent's scoped read routes", () => {
  it("each read tool calls its route and forwards filters without the bearer", async () => {
    const fetchMock = mockFetch({ data: [] });

    await tool("crm_list_deals")({
      bearer_token: "tok",
      ownerId: "77",
      amountMin: 1000,
      closeDateBefore: "2026-12-31",
      limit: 25,
    });
    await tool("crm_get_deal")({ bearer_token: "tok", id: "9001" });
    await tool("crm_list_activities")({
      bearer_token: "tok",
      dealId: "9001",
      types: ["call", "note"],
      since: "2026-09-01",
    });
    await tool("crm_list_owners")({ bearer_token: "tok" });
    await tool("crm_list_pipeline_stages")({ bearer_token: "tok", pipelineId: "sales pipe" });
    await tool("crm_list_pipeline_stages")({ bearer_token: "tok" });

    const calls = fetchMock.mock.calls.map(([url, init]) => ({
      path: new URL(url).pathname + new URL(url).search,
      method: init?.method ?? "GET",
      body: init?.body ? JSON.parse(init.body as string) : undefined,
      auth: new Headers(init?.headers).get("authorization"),
    }));
    expect(calls).toEqual([
      {
        path: "/api/v1/crm/list-deals",
        method: "POST",
        body: { ownerId: "77", amountMin: 1000, closeDateBefore: "2026-12-31", limit: 25 },
        auth: "Bearer tok",
      },
      { path: "/api/v1/crm/get-deal", method: "POST", body: { id: "9001" }, auth: "Bearer tok" },
      {
        path: "/api/v1/crm/list-activities",
        method: "POST",
        body: { dealId: "9001", types: ["call", "note"], since: "2026-09-01" },
        auth: "Bearer tok",
      },
      { path: "/api/v1/crm/list-owners", method: "GET", body: undefined, auth: "Bearer tok" },
      {
        path: "/api/v1/crm/list-pipeline-stages?pipelineId=sales%20pipe",
        method: "GET",
        body: undefined,
        auth: "Bearer tok",
      },
      {
        path: "/api/v1/crm/list-pipeline-stages",
        method: "GET",
        body: undefined,
        auth: "Bearer tok",
      },
    ]);
  });

  it("passes the route's {data} through and maps 409 and upstream errors", async () => {
    mockFetch({ data: { id: "9001", name: "Renewal", associatedCompanyIds: ["c-1"] } });
    const deal = await tool("crm_get_deal")({ bearer_token: "tok", id: "9001" });
    expect(JSON.parse(deal.content[0].text)).toEqual({
      data: { id: "9001", name: "Renewal", associatedCompanyIds: ["c-1"] },
    });

    vi.unstubAllGlobals();
    mockFetch({ error: "HubSpot is not connected for this workspace." }, 409);
    const notConnected = await tool("crm_list_owners")({ bearer_token: "tok" });
    expect(notConnected.isError).toBe(true);
    expect(notConnected.content[0].text).toMatch(/not connected/);

    vi.unstubAllGlobals();
    mockFetch({ error: "HubSpot denied the requested CRM operation." }, 502);
    const denied = await tool("crm_list_activities")({ bearer_token: "tok", types: ["email"] });
    expect(denied.isError).toBe(true);
    expect(denied.content[0].text).toMatch(/API error \(502\).*HubSpot denied/);
  });

  it("crm_pipeline_risk_scan scores open deals from the scoped reads", async () => {
    const now = Date.now();
    const fetchMock = mockRoutes({
      "/api/v1/workspace-profile-settings": { body: { data: {} } },
      "/api/v1/crm/list-deals": {
        body: {
          data: [
            {
              id: "d-stale",
              name: "Stale deal",
              amount: 80000,
              ownerId: "77",
              stage: "qualified",
              pipeline: "default",
              closeDate: new Date(now - 3 * DAY).toISOString(),
              lastModified: new Date(now - 40 * DAY).toISOString(),
              lastActivityDate: new Date(now - 30 * DAY).toISOString(),
              nextStep: null,
            },
            {
              id: "d-won",
              name: "Won deal",
              amount: 1000,
              ownerId: "77",
              stage: "closedwon",
              pipeline: "default",
              closeDate: null,
              lastModified: null,
              lastActivityDate: null,
              nextStep: null,
            },
          ],
        },
      },
      "/api/v1/crm/list-activities": { body: { data: [] } },
      "/api/v1/crm/list-owners": {
        body: {
          data: [{ id: "77", email: "ada@acme.com", firstName: "Ada", lastName: "L", teams: [] }],
        },
      },
      "/api/v1/crm/list-pipeline-stages": {
        body: {
          data: [
            { id: "qualified", displayOrder: 0, pipelineId: "default", isWonStage: false, isLostStage: false },
            { id: "closedwon", displayOrder: 1, pipelineId: "default", isWonStage: true, isLostStage: false },
          ],
        },
      },
    });

    const res = await tool("crm_pipeline_risk_scan")({ bearer_token: "tok", owner_id: "77" });

    expect(res.isError).toBeUndefined();
    const out = JSON.parse(res.content[0].text);
    expect(out.scanned_count).toBe(1);
    expect(out.flagged).toHaveLength(1);
    expect(out.flagged[0]).toMatchObject({
      deal_id: "d-stale",
      dealname: "Stale deal",
      owner_name: "Ada L",
      close_date_slipping: true,
      high_value_low_activity: true,
      missing_fields: ["next_step"],
    });
    const dealsCall = fetchMock.mock.calls.find(
      ([url]) => new URL(url).pathname === "/api/v1/crm/list-deals",
    );
    expect(JSON.parse(dealsCall?.[1]?.body as string)).toEqual({ ownerId: "77", limit: 200 });
    const activitiesCall = fetchMock.mock.calls.find(
      ([url]) => new URL(url).pathname === "/api/v1/crm/list-activities",
    );
    expect(JSON.parse(activitiesCall?.[1]?.body as string)).toMatchObject({
      ownerId: "77",
      limit: 200,
      since: expect.any(String),
    });
  });

  it("crm_weekly_brief_compose keeps its dealname output fields", async () => {
    mockRoutes({
      "/api/v1/workspace-profile-settings": { body: { data: {} } },
      "/api/v1/crm/list-deals": {
        body: {
          data: [
            {
              id: "d-1",
              name: "Acme renewal",
              amount: 5000,
              ownerId: "77",
              stage: "qualified",
              pipeline: "default",
              closeDate: null,
              lastModified: null,
              lastActivityDate: null,
              nextStep: null,
            },
          ],
        },
      },
      "/api/v1/crm/list-activities": {
        body: {
          data: [
            {
              id: "a-1",
              type: "call",
              timestamp: new Date().toISOString(),
              ownerId: "77",
              dealId: null,
              contactId: null,
              subject: "Check-in",
              body: null,
            },
          ],
        },
      },
      "/api/v1/crm/list-owners": { body: { data: [] } },
      "/api/v1/crm/list-pipeline-stages": { body: { data: [] } },
    });

    const res = await tool("crm_weekly_brief_compose")({ bearer_token: "tok" });

    expect(res.isError).toBeUndefined();
    const brief = JSON.parse(res.content[0].text);
    expect(brief.last_week_summary).toMatchObject({
      activities_logged: 1,
      by_type: { call: 1 },
      open_deals: 1,
      open_pipeline_value_eur: 5000,
    });
    expect(brief.deals_without_next_step).toEqual([
      { deal_id: "d-1", dealname: "Acme renewal", owner_id: "77" },
    ]);
  });

  it("composite tools report a missing HubSpot connection", async () => {
    mockRoutes({
      "/api/v1/workspace-profile-settings": { body: { data: {} } },
      "/api/v1/crm/list-deals": { body: { error: "not connected" }, status: 409 },
      "/api/v1/crm/list-activities": { body: { error: "not connected" }, status: 409 },
      "/api/v1/crm/list-owners": { body: { error: "not connected" }, status: 409 },
      "/api/v1/crm/list-pipeline-stages": { body: { error: "not connected" }, status: 409 },
      "/api/v1/crm/deal-snapshots": { body: { data: [] } },
    });

    for (const name of ["crm_pipeline_risk_scan", "crm_detect_forecast_changes"]) {
      const res = await tool(name)({ bearer_token: "tok" });
      expect(res.isError).toBe(true);
      expect(res.content[0].text).toMatch(/HubSpot is not connected/);
    }
  });

  it("crm_detect_forecast_changes diffs current deals against the snapshot", async () => {
    mockRoutes({
      "/api/v1/crm/list-deals": {
        body: {
          data: [
            {
              id: "d-1",
              name: "Acme renewal",
              amount: 15000,
              ownerId: "77",
              stage: "proposal",
              pipeline: "default",
              closeDate: "2026-10-31T00:00:00Z",
              lastModified: null,
              lastActivityDate: null,
              nextStep: null,
            },
          ],
        },
      },
      "/api/v1/crm/deal-snapshots": {
        body: {
          data: [
            {
              deal_id: "d-1",
              amount: 10000,
              stage_id: "qualified",
              close_date: "2026-10-01T00:00:00Z",
              owner_id: "77",
            },
          ],
        },
      },
      "/api/v1/crm/list-owners": {
        body: { data: [{ id: "77", email: null, firstName: "Ada", lastName: null, teams: [] }] },
      },
      "/api/v1/crm/list-pipeline-stages": {
        body: {
          data: [
            { id: "qualified", displayOrder: 1, pipelineId: "default", isWonStage: false, isLostStage: false },
            { id: "proposal", displayOrder: 2, pipelineId: "default", isWonStage: false, isLostStage: false },
          ],
        },
      },
    });

    const res = await tool("crm_detect_forecast_changes")({ bearer_token: "tok" });

    expect(res.isError).toBeUndefined();
    const [change] = JSON.parse(res.content[0].text).changes;
    expect(change).toMatchObject({
      deal_id: "d-1",
      dealname: "Acme renewal",
      owner_name: "Ada",
      stage_movement: "forward",
      close_date_slip_days: 30,
      flag_reasons: ["amount_changed", "stage_moved_forward", "close_date_slipped"],
    });
  });

  it("crm_assign_prospects resolves owner names through list-owners", async () => {
    const fetchMock = mockRoutes({
      "/api/v1/crm/list-owners": {
        body: {
          data: [{ id: "77", email: "ada@acme.com", firstName: "Ada", lastName: "L", teams: [] }],
        },
      },
    });

    const res = await tool("crm_assign_prospects")({
      bearer_token: "tok",
      prospects: [{ email: "p@acme.com", score: 80 }],
      assignment_rules_override: [{ assign_to_owner_id: "77" }],
    });

    expect(res.isError).toBeUndefined();
    expect(JSON.parse(res.content[0].text).assignments[0]).toMatchObject({
      owner_id: "77",
      owner_name: "Ada L",
      owner_email: "ada@acme.com",
      priority: "high",
    });
    expect(
      fetchMock.mock.calls.map(([url]) => new URL(url).pathname),
    ).toEqual(["/api/v1/crm/list-owners"]);
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

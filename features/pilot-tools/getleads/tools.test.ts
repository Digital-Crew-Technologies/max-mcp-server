import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { McpServer } from "@/features/pilot-tools/shared";
import { registerGetleadsTools } from "@/features/pilot-tools/getleads/tools";
import {
  registerAutoProspectSourcingTools,
  registerOrganizationSearchTools,
} from "@/features/pilot-tools/sourcing/tools";
import { registerPilotMcpTools } from "@/features/pilot-tools/mcp/register";

type Handler = (input: Record<string, unknown>) => Promise<{
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}>;

function capture(register: (s: McpServer) => void): Map<string, { config: Record<string, unknown>; handler: Handler }> {
  const tools = new Map<string, { config: Record<string, unknown>; handler: Handler }>();
  register({
    registerTool(name, config, handler) {
      tools.set(name, { config, handler });
    },
  });
  return tools;
}

function mockFetch(body: unknown = { data: { id: "list-1", status: "pending" } }) {
  const fetchMock = vi.fn(
    async (_url: string, _init?: RequestInit) =>
      new Response(JSON.stringify(body), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const call = (m: ReturnType<typeof mockFetch>) => ({
  url: new URL(m.mock.calls[0][0]),
  method: m.mock.calls[0][1]?.method,
  body: JSON.parse(m.mock.calls[0][1]?.body as string) as Record<string, unknown>,
});

const UUID = "11111111-1111-1111-1111-111111111111";

beforeEach(() => {
  process.env.DIGITALCREW_API_BASE_URL = "https://api.test";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("getleads tools", () => {
  it("packs typed filters into getleads_search_criteria and maps max_results → searchLimit", async () => {
    const fetchMock = mockFetch();
    const tool = capture(registerGetleadsTools).get("getleads_create_list")!;

    const res = await tool.handler({
      bearer_token: "tok",
      list_name: "DACH sales leaders",
      max_results: 250,
      job_titles: ["Head of Sales"],
      countries: ["Germany"],
      verified_only: true,
      data_supplier: "personal",
      icp_id: UUID,
    });

    expect(res.isError).toBeUndefined();
    const { url, method, body } = call(fetchMock);
    expect(method).toBe("POST");
    expect(url.pathname).toBe("/api/v1/getleads/people/create-list");
    expect(body.list_name).toBe("DACH sales leaders");
    expect(body.data_supplier).toBe("personal");
    expect(body.icp_id).toBe(UUID);
    expect(typeof body.idempotency_key).toBe("string");
    // Only filters go into the criteria — never the envelope fields.
    expect(body.getleads_search_criteria).toEqual({
      job_titles: ["Head of Sales"],
      countries: ["Germany"],
      verified_only: true,
      searchLimit: 250,
    });
  });

  it("posts add-more to the GetLeads route without retrying", async () => {
    const fetchMock = mockFetch();
    const tool = capture(registerGetleadsTools).get("getleads_add_more")!;

    await tool.handler({ bearer_token: "tok", list_id: UUID, count: 50 });

    const { url, method, body } = call(fetchMock);
    expect(method).toBe("POST");
    expect(url.pathname).toBe("/api/v1/getleads/people/add-more");
    expect(body).toEqual({ list_id: UUID, count: 50 });
  });
});

describe("managed sourcing tools (GetLeads → Explorium)", () => {
  it("auto_create_prospect_list forwards unified criteria and an idempotency key", async () => {
    const fetchMock = mockFetch();
    const tool = capture(registerAutoProspectSourcingTools).get("auto_create_prospect_list")!;

    await tool.handler({
      bearer_token: "tok",
      list_name: "VP Marketing FR",
      criteria: { jobTitles: ["VP Marketing"], personLocations: ["France"] },
    });

    const { url, method, body } = call(fetchMock);
    expect(method).toBe("POST");
    expect(url.pathname).toBe("/api/v1/prospect-lists/auto/create-list");
    expect(body.criteria).toEqual({ jobTitles: ["VP Marketing"], personLocations: ["France"] });
    expect(body).not.toHaveProperty("bearer_token");
    expect(typeof body.idempotency_key).toBe("string");
  });

  it("previews and builds company lists through the organization search routes", async () => {
    const tools = capture(registerOrganizationSearchTools);

    let fetchMock = mockFetch({ data: [], provider: "getleads", attempts: [] });
    await tools.get("preview_organization_search")!.handler({
      bearer_token: "tok",
      criteria: { industries: ["Software Development"] },
      provider: "getleads",
      limit: 5,
    });
    let c = call(fetchMock);
    expect(c.url.pathname).toBe("/api/v1/organizations/search");
    expect(c.body).toEqual({ criteria: { industries: ["Software Development"] }, provider: "getleads", limit: 5 });
    vi.unstubAllGlobals();

    fetchMock = mockFetch();
    await tools.get("auto_create_organization_list")!.handler({
      bearer_token: "tok",
      list_name: "SaaS in Nordics",
      criteria: { locations: ["Sweden"] },
    });
    c = call(fetchMock);
    expect(c.url.pathname).toBe("/api/v1/organizations/search/create-list");
    expect(c.body.list_name).toBe("SaaS in Nordics");
    expect(typeof c.body.idempotency_key).toBe("string");
  });

  it("offers no Apollo pin on the managed chain", () => {
    const schema = capture(registerAutoProspectSourcingTools).get("auto_create_prospect_list")!
      .config.inputSchema as { safeParse: (v: unknown) => { success: boolean } };
    const base = { list_name: "x", criteria: { jobTitles: ["CEO"] } };
    expect(schema.safeParse({ ...base, provider: "getleads" }).success).toBe(true);
    expect(schema.safeParse({ ...base, provider: "explorium" }).success).toBe(true);
    expect(schema.safeParse({ ...base, provider: "apollo" }).success).toBe(false);
  });
});

// The MCP SDK hands a handler the schema's PARSED input, and a zod object drops
// keys it doesn't declare — so a filter missing from the schema never reaches
// max-agent. These run the real schema first, as the SDK does.
type Parser = { parse: (v: unknown) => Record<string, unknown> };
const parsed = (tool: { config: Record<string, unknown> }, input: Record<string, unknown>) =>
  (tool.config.inputSchema as Parser).parse(input);

describe("GetLeads filters max-agent validates (contacts/search API names)", () => {
  it("passes every newer GetLeads filter through to getleads_search_criteria", async () => {
    const fetchMock = mockFetch();
    const tool = capture(registerGetleadsTools).get("getleads_create_list")!;
    const filters = {
      job_functions: ["Sales"],
      cities: ["Paris"],
      states: ["Texas"],
      continents: ["Europe"],
      regions: ["EMEA"],
      company_linkedin_urls: ["https://www.linkedin.com/company/acme/"],
      technologies: ["Salesforce"],
      headquarters_countries: ["France"],
      office_countries: ["Spain"],
      exclude_job_titles: ["Intern"],
      exclude_industries: ["Retail"],
      exclude_countries: ["Italy"],
      exclude_headquarters_countries: ["China"],
      revenue: ["1M-5M"],
      founded_year_min: 2015,
      founded_year_max: 2022,
      total_funding_min: 1_000_000,
      total_funding_max: 50_000_000,
      employee_growth_rate_min: -5,
      employee_growth_rate_max: 40,
      job_start_date_min: "2026-01-01",
      seniority: ["Other"],
    };

    await tool.handler(parsed(tool, { bearer_token: "tok", list_name: "x", ...filters }));

    expect(call(fetchMock).body.getleads_search_criteria).toEqual(filters);
  });

  it("refuses a start date that isn't YYYY-MM-DD and a region GetLeads doesn't have", () => {
    const tool = capture(registerGetleadsTools).get("getleads_create_list")!;
    const schema = tool.config.inputSchema as { safeParse: (v: unknown) => { success: boolean } };
    expect(schema.safeParse({ list_name: "x", job_start_date_min: "last month" }).success).toBe(false);
    expect(schema.safeParse({ list_name: "x", regions: ["Nordics"] }).success).toBe(false);
  });

  it("keeps the GetLeads-only people fields and advanced on the managed chain", async () => {
    const fetchMock = mockFetch();
    const tool = capture(registerAutoProspectSourcingTools).get("auto_create_prospect_list")!;
    const criteria = {
      jobDepartments: ["Sales"],
      companyRevenue: ["10M-25M"],
      technologies: ["HubSpot"],
      companyHqCountries: ["Germany"],
      excludeJobTitles: ["Intern"],
      excludeIndustries: ["Retail"],
      foundedYearMin: 2010,
      foundedYearMax: 2020,
      totalFundingMin: 1_000_000,
      totalFundingMax: 20_000_000,
      employeeGrowthMin: 5,
      employeeGrowthMax: 50,
      jobStartedWithinMonths: 6,
      advanced: { getleads: { sales_open_roles_min: 2 } },
    };

    await tool.handler(parsed(tool, { bearer_token: "tok", list_name: "x", criteria }));

    expect(call(fetchMock).body.criteria).toEqual(criteria);
  });

  it("keeps company age, technologies and advanced on the company search", async () => {
    const fetchMock = mockFetch({ data: [], provider: "getleads", attempts: [] });
    const tool = capture(registerOrganizationSearchTools).get("preview_organization_search")!;
    const criteria = {
      industries: ["Software Development"],
      locations: ["France"],
      companyRevenue: ["1M-5M"],
      companyAge: ["3-6", "20+"],
      technologies: ["Salesforce"],
      advanced: { getleads: { office_countries: ["Spain"] } },
    };

    await tool.handler(parsed(tool, { bearer_token: "tok", criteria }));

    expect(call(fetchMock).body.criteria).toEqual(criteria);
  });

  it("no longer tells the model revenue, departments, technologies or company age are Explorium-only", () => {
    const tools = new Map([
      ...capture(registerGetleadsTools),
      ...capture(registerAutoProspectSourcingTools),
      ...capture(registerOrganizationSearchTools),
    ]);
    const text = [...tools.values()]
      .flatMap((t) => [String(t.config.description), ...describedFields(t.config.inputSchema)])
      .join("\n");
    for (const stale of [
      "Revenue buckets (Explorium only)",
      "Revenue buckets, e.g. [\"10M-25M\"] (Explorium only)",
      "Departments (Explorium only)",
      "Tech-stack technologies (Explorium only)",
      "Company-age buckets, e.g. [\"3-10\"] (Explorium only)",
      "intent, departments, revenue",
      "Cities/regions are dropped",
    ]) {
      expect(text).not.toContain(stale);
    }
    // What still is Explorium-only says so.
    expect(text).toContain("Website keywords (Explorium only)");
    expect(text).toContain("Location-count buckets, e.g. [\"2-5\"] (Explorium only)");
  });
});

/** Every `.describe()` text in a zod (v3) schema tree. */
function describedFields(schema: unknown, out: string[] = []): string[] {
  const def = (schema as { _def?: Record<string, unknown> } | undefined)?._def;
  if (!def) return out;
  if (typeof def.description === "string") out.push(def.description);
  const shape = typeof def.shape === "function" ? (def.shape as () => Record<string, unknown>)() : {};
  for (const child of [def.innerType, def.type, def.schema, def.valueType, ...Object.values(shape)]) {
    describedFields(child, out);
  }
  return out;
}

describe("sourcing order in the grouped catalog", () => {
  it("registers getleads, then explorium, then apollo — adjacent and in that order", () => {
    const prev = process.env.GROUPED_TOOLS;
    delete process.env.GROUPED_TOOLS;
    try {
      const names = [...capture(registerPilotMcpTools).keys()];
      const g = names.indexOf("getleads");
      expect(g).toBeGreaterThanOrEqual(0);
      expect(names.slice(g, g + 3)).toEqual(["getleads", "explorium", "apollo"]);
    } finally {
      if (prev === undefined) delete process.env.GROUPED_TOOLS;
      else process.env.GROUPED_TOOLS = prev;
    }
  });

  it("orders the flat catalog the same way", () => {
    const prev = process.env.GROUPED_TOOLS;
    process.env.GROUPED_TOOLS = "false";
    try {
      const names = [...capture(registerPilotMcpTools).keys()];
      const first = (prefix: string) => names.findIndex((n) => n.startsWith(prefix));
      expect(first("getleads_")).toBeLessThan(first("explorium_"));
      expect(first("explorium_")).toBeLessThan(first("apollo_"));
    } finally {
      if (prev === undefined) delete process.env.GROUPED_TOOLS;
      else process.env.GROUPED_TOOLS = prev;
    }
  });
});

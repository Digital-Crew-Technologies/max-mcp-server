import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { McpServer } from "../shared";
import { registerPilotMcpTools } from "../mcp/register";
import { registerFullenrichTools } from "./tools";
import { getJobSchema, personLookupSchema, companyLookupSchema } from "./schema";

type Captured = {
  name: string;
  config: Record<string, unknown>;
  handler: (input: Record<string, unknown>) => Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }>;
};

function capture(all = false) {
  const tools: Captured[] = [];
  const server: McpServer = { registerTool(name, config, handler) { tools.push({ name, config, handler }); } };
  if (all) registerPilotMcpTools(server);
  else registerFullenrichTools(server);
  return tools;
}

function tool(name: string) {
  const found = capture().find((entry) => entry.name === name);
  if (!found) throw new Error(`Missing ${name}`);
  return found;
}

const JOB = "e5f5e4cb-a8bf-421f-83f7-97d0a1c0c92d";
const endpoints = {
  fullenrich_emails: "emails",
  fullenrich_phones: "phones",
  fullenrich_identity: "identity",
  fullenrich_linkedin: "linkedin",
  fullenrich_career: "career",
  fullenrich_education_skills: "education-skills",
  fullenrich_location: "location",
  fullenrich_company: "company",
};

function mockFetch(status = 202, body: unknown = { data: { job_id: JOB, status: "pending" } }) {
  const fn = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

beforeEach(() => {
  vi.stubEnv("DIGITALCREW_API_BASE_URL", "https://max.test");
  vi.stubEnv("ALLOW_ENV_TOKEN_FALLBACK", "false");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("individual FullEnrich tools", () => {
  it.each([undefined, "false", "linkedin"])("always registers each category separately in mode %s", (mode) => {
    vi.stubEnv("GROUPED_TOOLS", mode ?? "");
    const names = capture(true).map((entry) => entry.name);
    for (const name of [...Object.keys(endpoints), "fullenrich_get_job"]) {
      expect(names.filter((entry) => entry === name)).toHaveLength(1);
    }
    expect(names).not.toContain("fullenrich");
    expect(names).not.toContain("claire_enrich_person");
    // The grouped Claire domain keeps research, with no legacy enrichment action.
    const claire = capture(true).find((entry) => entry.name === "claire");
    if (claire) expect(claire.config.description).not.toContain("enrich_person —");
  });

  it.each(Object.entries(endpoints))("%s sends only lookup inputs to %s with caller authentication", async (name, category) => {
    vi.stubEnv("FULLENRICH_API_KEY", "provider-secret-must-stay-in-max");
    const fetch = mockFetch();
    const result = await tool(name).handler({ bearer_token: "caller-token", email: " person@example.com ", request_id: JOB });
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0].text).data.job_id).toBe(JOB);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(`https://max.test/api/v1/fullenrich/${category}`);
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({ Authorization: "Bearer caller-token", "Content-Type": "application/json" });
    expect(JSON.parse(init?.body as string)).toEqual({ email: "person@example.com", request_id: JOB });
    expect(JSON.stringify(fetch.mock.calls)).not.toContain("provider-secret-must-stay-in-max");
  });

  it("marks every submission as paid and not read-only", () => {
    for (const name of Object.keys(endpoints)) {
      const config = tool(name).config;
      expect(config.annotations).toMatchObject({ readOnlyHint: false, idempotentHint: false });
      expect(config.description).toContain("PAID LOOKUP");
      expect(config.description).toContain("do not repeat");
    }
  });

  it.each([429, 502, 503, 504])("does not retry paid POST on %s", async (status) => {
    const fetch = mockFetch(status, { error: "Try later" });
    const result = await tool("fullenrich_emails").handler({ bearer_token: "caller", email: "person@example.com" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain(`API error (${status})`);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not retry a network failure from a paid POST", async () => {
    const fetch = vi.fn().mockRejectedValue(new Error("network unavailable"));
    vi.stubGlobal("fetch", fetch);
    const result = await tool("fullenrich_phones").handler({ bearer_token: "caller", linkedin_url: "https://www.linkedin.com/in/person" });
    expect(result.isError).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("requires bearer authentication before any lookup", async () => {
    const fetch = mockFetch();
    const result = await tool("fullenrich_identity").handler({ email: "person@example.com" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Bearer token missing");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("polls only the existing Max job and returns completed category data", async () => {
    const body = { data: { job_id: JOB, status: "completed", phase: "contact", categories: ["education-skills"], matched: true, result: { skills: ["Sales"] }, provider_credits: 1, credits_charged: 1, error_message: null } };
    const fetch = mockFetch(200, body);
    const result = await tool("fullenrich_get_job").handler({ bearer_token: "caller", job_id: JOB });
    expect(JSON.parse(result.content[0].text)).toEqual(body);
    expect(fetch.mock.calls[0][0]).toBe(`https://max.test/api/v1/fullenrich/jobs/${JOB}`);
    expect(fetch.mock.calls[0][1]?.method ?? "GET").toBe("GET");
    expect(fetch.mock.calls[0][1]?.body).toBeUndefined();
    expect(fetch.mock.calls[0][1]?.headers).toMatchObject({ Authorization: "Bearer caller" });
    expect(tool("fullenrich_get_job").config.annotations).toMatchObject({ readOnlyHint: true });
  });

  it.each([{}, { job_id: "../../other-job" }, { job_id: JOB, workspace_id: JOB }])("rejects an invalid job selector without fetching", async (input) => {
    const fetch = mockFetch();
    const result = await tool("fullenrich_get_job").handler({ bearer_token: "caller", ...input });
    expect(result.isError).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    {},
    { person_name: "Someone" },
    { company_domain: "example.com" },
    { email: "invalid" },
    { email: "person@example.com", provider_api_key: "secret" },
    { email: "person@example.com", workspace_id: JOB },
    { email: "person@example.com", request_id: "not-uuid" },
    { linkedin_url: "https://linkedin.com.evil.test/in/person" },
    { linkedin_url: "not-a-url" },
    { linkedin_url: "http://www.linkedin.com/in/person" },
    { linkedin_url: "https://www.linkedin.com/company/company" },
    { linkedin_url: "https://user:secret@www.linkedin.com/in/person" },
    { linkedin_url: "https://www.linkedin.com/in/person%2Fprivate" },
    { linkedin_url: "https://www.linkedin.com/in/person%5Cprivate" },
    { linkedin_url: "https://www.linkedin.com/in/person%20private" },
    { linkedin_url: "https://www.linkedin.com/in/person%0Aprivate" },
    { linkedin_url: "https://www.linkedin.com/in/person%invalid" },
    { linkedin_url: `https://www.linkedin.com/in/${"p".repeat(501)}` },
    { person_name: "Some\nPerson", company_domain: "example.com" },
    { person_name: "Someone", company_domain: "https://example.com" },
  ])("rejects invalid person input before a paid call: %j", async (input) => {
    const fetch = mockFetch();
    const result = await tool("fullenrich_emails").handler({ bearer_token: "caller", ...input });
    expect(result.isError).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    { email: "person@example.com" },
    { linkedin_url: "https://linkedin.com/in/person/" },
    { person_name: "Some Person", company_domain: "example.com" },
    { person_name: "Some Person", company_linkedin_url: "https://www.linkedin.com/company/example" },
  ])("accepts supported person identifiers: %j", (input) => {
    expect(personLookupSchema.safeParse(input).success).toBe(true);
  });

  it("accepts standalone company identifiers only for the company category", async () => {
    const fetch = mockFetch();
    await tool("fullenrich_company").handler({ bearer_token: "caller", company_domain: "example.com" });
    expect(JSON.parse(fetch.mock.calls[0][1]?.body as string)).toEqual({ company_domain: "example.com" });
    expect(companyLookupSchema.safeParse({ company_linkedin_url: "https://www.linkedin.com/company/example/" }).success).toBe(true);
    expect(companyLookupSchema.safeParse({ person_name: "Some Person" }).success).toBe(false);
  });

  it("does not allow unknown fields in strict schemas", () => {
    expect(getJobSchema.safeParse({ job_id: JOB, api_key: "key" }).success).toBe(false);
    expect(personLookupSchema.safeParse({ email: "person@example.com", api_key: "key" }).success).toBe(false);
  });

  it("canonicalizes regional and dotted LinkedIn identifiers before forwarding, removing incidental URL tokens", async () => {
    const fetch = mockFetch();
    await tool("fullenrich_career").handler({
      bearer_token: "caller", linkedin_url: " https://in.linkedin.com/in/jane.doe-123?tracking=private-query#private-fragment ",
      company_linkedin_url: "https://uk.linkedin.com/company/example.inc?foo=bar#hash", company_domain: " EXAMPLE.COM ",
    });
    expect(JSON.parse(fetch.mock.calls[0][1]?.body as string)).toEqual({
      linkedin_url: "https://in.linkedin.com/in/jane.doe-123", company_linkedin_url: "https://uk.linkedin.com/company/example.inc", company_domain: "example.com",
    });
    expect(JSON.stringify(fetch.mock.calls)).not.toContain("private-query");
    expect(JSON.stringify(fetch.mock.calls)).not.toContain("private-fragment");
  });

  it("passes optional saved-person compatibility results through unchanged", async () => {
    const envelope = {data: {job_id: JOB, status: "completed", person_result: {status: "enriched", written: ["phone"]}, result: {phones: {phones: []}}}};
    mockFetch(200, envelope);
    const result = await tool("fullenrich_get_job").handler({bearer_token: "caller", job_id: JOB});
    expect(JSON.parse(result.content[0].text)).toEqual(envelope);
  });
});

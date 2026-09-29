import { z } from "zod";
import { withToken } from "../shared";

// The unified search criteria max-agent's search bar submits. Field names are
// camelCase because they are forwarded verbatim as the `criteria` object —
// mirrors max-agent src/features/prospect-lists/schemas/unified-search.schema.ts
// and unified-org-search.schema.ts. Every field is optional: max-agent fills the
// defaults, so the model only sends what the user actually asked for.

// Apollo is deliberately absent: the managed chain is GetLeads → Explorium and
// max-agent does not accept Apollo as a pin.
const managedProvider = z
  .enum(["getleads", "explorium"])
  .optional()
  .describe("Pin one provider; it runs without the filters it can't apply. Omit for the default chain: GetLeads first, Explorium for buyer intent or website keywords (and, for companies, number of locations), GetLeads again without those only if Explorium can't run");

// Native per-supplier filters under their own API names, merged over what the
// unified fields map to — the escape hatch for a knob the unified shape
// doesn't model (e.g. GetLeads' office_countries or sales_open_roles_min).
const advanced = z
  .object({
    getleads: z.record(z.string(), z.unknown()).optional().describe("GetLeads contacts/search filters by API name, e.g. {\"office_countries\": [\"Spain\"]}"),
    explorium: z.record(z.string(), z.unknown()).optional().describe("Explorium filters by API name"),
  })
  .describe("Native supplier filters (advanced; prefer the named fields)");

const size = z
  .object({
    min: z.number().int().min(0).optional().describe("Minimum headcount"),
    max: z.number().int().min(0).optional().describe("Maximum headcount"),
  })
  .describe("Company headcount range");

const peopleCriteria = z
  .object({
    jobTitles: z.array(z.string()).optional().describe("Job titles, e.g. [\"Head of Sales\"]"),
    seniorities: z
      .array(z.enum(["c_suite", "vp", "director", "manager", "senior", "entry", "owner", "partner"]))
      .optional()
      .describe("Seniority levels"),
    personLocations: z.array(z.string()).optional().describe("Where the person is: countries, cities (\"Paris, France\"), US states, continents or regions, e.g. [\"Germany\"]"),
    industries: z.array(z.string()).optional().describe("LinkedIn industry taxonomy names"),
    companySize: size.optional(),
    companyDomains: z.array(z.string()).optional().describe("Company domains to target"),
    excludeCompanyDomains: z.array(z.string()).optional().describe("Company domains to exclude"),
    keywords: z.array(z.string()).optional().describe("Company website keywords (Explorium only)"),
    jobDepartments: z.array(z.string()).optional().describe("Departments, e.g. [\"Sales\"] (GetLeads job functions or Explorium departments)"),
    companyRevenue: z.array(z.string()).optional().describe("Annual revenue ranges, e.g. [\"10M-25M\"] (GetLeads searches the wider bands they overlap)"),
    intent: z.boolean().optional().describe("Require buyer-intent signals (Explorium only)"),
    intentTopics: z.array(z.string()).optional().describe("Bombora intent topics (Explorium only)"),
    enrichments: z.record(z.string(), z.boolean()).optional().describe("Explorium enrichment toggles, e.g. {\"company_funding\": true}; one beyond the defaults sends the search to Explorium"),
    // GetLeads-only filters. max-agent moves them under advanced.getleads; a
    // search with one never runs on Explorium.
    technologies: z.array(z.string()).optional().describe("Technologies the person's company uses, e.g. [\"Salesforce\"] (GetLeads only)"),
    companyHqCountries: z.array(z.string()).optional().describe("Countries the person's company is headquartered in (GetLeads only)"),
    excludeJobTitles: z.array(z.string()).optional().describe("Job titles to leave out (GetLeads only)"),
    excludeIndustries: z.array(z.string()).optional().describe("Industries to leave out (GetLeads only)"),
    foundedYearMin: z.number().int().optional().describe("Company founded in or after this year (GetLeads only)"),
    foundedYearMax: z.number().int().optional().describe("Company founded in or before this year (GetLeads only)"),
    totalFundingMin: z.number().min(0).optional().describe("Minimum total funding raised, USD (GetLeads only)"),
    totalFundingMax: z.number().min(0).optional().describe("Maximum total funding raised, USD (GetLeads only)"),
    employeeGrowthMin: z.number().optional().describe("Minimum headcount growth rate (GetLeads only)"),
    employeeGrowthMax: z.number().optional().describe("Maximum headcount growth rate (GetLeads only)"),
    jobStartedWithinMonths: z.number().int().min(1).max(120).optional().describe("Only people who started their current role within this many months (GetLeads only)"),
    advanced: advanced.optional(),
    limit: z.number().int().min(1).max(50000).optional().describe("Max people to fetch (default 100)"),
    requireEmail: z.boolean().optional().describe("Only people with an email"),
    requirePhone: z.boolean().optional().describe("Only people with a phone number"),
    verifiedEmailsOnly: z.boolean().optional().describe("Only verified emails (default true)"),
    excludeExistingOrganizations: z.boolean().optional().describe("Skip companies already in the workspace (default true)"),
    excludeExistingProspects: z.boolean().optional().describe("Skip people already in the workspace (default true)"),
    excludeLinkedInConnections: z.boolean().optional().describe("Skip existing LinkedIn connections (default false)"),
    maxPerCompany: z.number().int().min(1).max(50).optional().describe("Cap people kept per company"),
  })
  .describe("People-search criteria. Needs at least one of jobTitles, seniorities, jobDepartments, personLocations, industries, companyDomains, technologies or companyHqCountries");

const organizationCriteria = z
  .object({
    companyNames: z.array(z.string()).optional().describe("Company names"),
    industries: z.array(z.string()).optional().describe("LinkedIn industry taxonomy names"),
    locations: z.array(z.string()).optional().describe("Where the company is headquartered, e.g. [\"France\"] (GetLeads widens \"Paris, France\" to France)"),
    companySize: size.optional(),
    companyRevenue: z.array(z.string()).optional().describe("Annual revenue ranges, e.g. [\"1M-5M\"] (GetLeads searches the wider bands they overlap)"),
    companyAge: z.array(z.string()).optional().describe("Years since founding, e.g. [\"3-6\", \"20+\"] (GetLeads searches the founding years they cover)"),
    numberOfLocations: z.array(z.string()).optional().describe("Location-count buckets, e.g. [\"2-5\"] (Explorium only)"),
    domains: z.array(z.string()).optional().describe("Company domains to target (GetLeads only: keeps an unpinned search off Explorium)"),
    excludeDomains: z.array(z.string()).optional().describe("Company domains to exclude (GetLeads only: keeps an unpinned search off Explorium)"),
    websiteKeywords: z.array(z.string()).optional().describe("Website keywords (Explorium only)"),
    technologies: z.array(z.string()).optional().describe("Technologies in the company's stack, e.g. [\"Salesforce\"]"),
    intent: z.boolean().optional().describe("Require buyer-intent signals (Explorium only)"),
    intentTopics: z.array(z.string()).optional().describe("Bombora intent topics (Explorium only)"),
    enrichments: z.record(z.string(), z.boolean()).optional().describe("Explorium enrichment toggles"),
    limit: z.number().int().min(1).max(10000).optional().describe("Max companies for a saved list (default 100)"),
    excludeExistingOrganizations: z.boolean().optional().describe("Skip companies already in the workspace (default true)"),
    advanced: advanced.optional(),
  })
  .describe("Company-search criteria. Needs at least one of companyNames, industries, locations, domains, technologies or websiteKeywords");

export const autoCreateProspectListSchema = z.object({
  ...withToken,
  list_name: z.string().min(1).describe("Name for the new prospect list"),
  criteria: peopleCriteria,
  provider: managedProvider,
  icp_id: z.string().uuid().optional().describe("ICP the criteria came from (provenance only)"),
  idempotency_key: z.string().optional().describe("Idempotency key for safe retries (auto-generated if omitted)"),
});

export const previewOrganizationSearchSchema = z.object({
  ...withToken,
  criteria: organizationCriteria,
  provider: managedProvider,
  limit: z.number().int().min(1).max(25).optional().describe("Preview rows (1–25, default 10)"),
});

export const autoCreateOrganizationListSchema = z.object({
  ...withToken,
  list_name: z.string().min(1).describe("Name for the new company list"),
  criteria: organizationCriteria,
  provider: managedProvider,
  idempotency_key: z.string().optional().describe("Idempotency key for safe retries (auto-generated if omitted)"),
});

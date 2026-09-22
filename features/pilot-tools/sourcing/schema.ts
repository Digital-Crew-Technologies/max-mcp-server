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
  .describe("Pin one provider. Omit for the default chain: GetLeads first, Explorium only if GetLeads cannot express the filters or finds nothing");

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
    personLocations: z.array(z.string()).optional().describe("Person countries, e.g. [\"Germany\"]"),
    industries: z.array(z.string()).optional().describe("LinkedIn industry taxonomy names"),
    companySize: size.optional(),
    companyDomains: z.array(z.string()).optional().describe("Company domains to target"),
    excludeCompanyDomains: z.array(z.string()).optional().describe("Company domains to exclude"),
    keywords: z.array(z.string()).optional().describe("Company website keywords (Explorium only)"),
    jobDepartments: z.array(z.string()).optional().describe("Departments (Explorium only)"),
    companyRevenue: z.array(z.string()).optional().describe("Revenue buckets, e.g. [\"10M-25M\"] (Explorium only)"),
    intent: z.boolean().optional().describe("Require buyer-intent signals (Explorium only)"),
    intentTopics: z.array(z.string()).optional().describe("Bombora intent topics (Explorium only)"),
    enrichments: z.record(z.string(), z.boolean()).optional().describe("Explorium enrichment toggles, e.g. {\"company_funding\": true}"),
    limit: z.number().int().min(1).max(50000).optional().describe("Max people to fetch (default 100)"),
    requireEmail: z.boolean().optional().describe("Only people with an email"),
    requirePhone: z.boolean().optional().describe("Only people with a phone number"),
    verifiedEmailsOnly: z.boolean().optional().describe("Only verified emails (default true)"),
    excludeExistingOrganizations: z.boolean().optional().describe("Skip companies already in the workspace (default true)"),
    excludeExistingProspects: z.boolean().optional().describe("Skip people already in the workspace (default true)"),
    excludeLinkedInConnections: z.boolean().optional().describe("Skip existing LinkedIn connections (default false)"),
    maxPerCompany: z.number().int().min(1).max(50).optional().describe("Cap people kept per company"),
  })
  .describe("People-search criteria. Needs at least one of jobTitles, seniorities, personLocations, industries or companyDomains");

const organizationCriteria = z
  .object({
    companyNames: z.array(z.string()).optional().describe("Company names"),
    industries: z.array(z.string()).optional().describe("LinkedIn industry taxonomy names"),
    locations: z.array(z.string()).optional().describe("Company countries/locations"),
    companySize: size.optional(),
    companyRevenue: z.array(z.string()).optional().describe("Revenue buckets (Explorium only)"),
    companyAge: z.array(z.string()).optional().describe("Company-age buckets, e.g. [\"3-10\"] (Explorium only)"),
    numberOfLocations: z.array(z.string()).optional().describe("Location-count buckets (Explorium only)"),
    domains: z.array(z.string()).optional().describe("Company domains to target"),
    excludeDomains: z.array(z.string()).optional().describe("Company domains to exclude"),
    websiteKeywords: z.array(z.string()).optional().describe("Website keywords (Explorium only)"),
    technologies: z.array(z.string()).optional().describe("Tech-stack technologies (Explorium only)"),
    intent: z.boolean().optional().describe("Require buyer-intent signals (Explorium only)"),
    intentTopics: z.array(z.string()).optional().describe("Bombora intent topics (Explorium only)"),
    enrichments: z.record(z.string(), z.boolean()).optional().describe("Explorium enrichment toggles"),
    limit: z.number().int().min(1).max(10000).optional().describe("Max companies for a saved list (default 100)"),
    excludeExistingOrganizations: z.boolean().optional().describe("Skip companies already in the workspace (default true)"),
  })
  .describe("Company-search criteria. Needs at least one targeting field");

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

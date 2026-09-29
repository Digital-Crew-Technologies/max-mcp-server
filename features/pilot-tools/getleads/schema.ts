import { z } from "zod";
import { withToken } from "../shared";

// Typed GetLeads contacts-search filters. Each key maps 1:1 to the raw criteria
// max-agent's mapCriteriaToGetleadsSearchCriteria() reads (see
// max-agent src/lib/services/getleads/search-criteria.ts), so the tool packs
// them into `getleads_search_criteria` unchanged — except max_results, which
// becomes criteria.searchLimit.
//
// GetLeads validates strictly and ONE off-list value 400s the whole request, so
// max-agent validates every filter by kind before sending (max-agent
// src/lib/services/getleads/filter-spec.ts) and runs GetLeads' free count first,
// dropping what GetLeads refuses. The descriptions below steer the model to
// values that survive that validation.

export const getleadsCreateListSchema = z.object({
  ...withToken,
  list_name: z.string().min(1).describe("Name for the new prospect list"),
  max_results: z.number().int().min(1).max(50000).optional().describe("Max contacts to fetch (default 100). Billed per contact actually returned."),

  // Targeting — at least one is required (max-agent rejects qualifier-only searches).
  job_titles: z.array(z.string()).optional().describe("Job titles to match, e.g. [\"Head of Sales\", \"VP Marketing\"]. GetLeads ANDs titles with seniority — prefer one or the other"),
  seniority: z.array(z.enum(["C-Team", "VP", "Director", "Manager", "Staff", "Other"])).optional().describe("GetLeads seniority buckets"),
  job_functions: z.array(z.string()).optional().describe("Departments, e.g. [\"Sales\", \"Finance\"]; matched onto GetLeads' own function names, and what fits none is dropped"),
  countries: z.array(z.string()).optional().describe("Person countries as English country names, e.g. [\"Germany\", \"United States\"]. For finer places use cities or states"),
  cities: z.array(z.string()).optional().describe("Person cities, e.g. [\"Paris\"]"),
  states: z.array(z.string()).optional().describe("Person states or provinces, e.g. [\"Texas\"]"),
  continents: z.array(z.string()).optional().describe("Person continents, e.g. [\"Europe\"]"),
  regions: z.array(z.enum(["NORAM", "EMEA", "APAC", "LATAM"])).optional().describe("Person macro-regions"),
  industries: z.array(z.string()).optional().describe("LinkedIn industry taxonomy names, e.g. [\"Software Development\"]. Values outside the taxonomy are dropped"),
  domains: z.array(z.string()).optional().describe("Company website domains to target, e.g. [\"acme.com\"]"),
  company_linkedin_urls: z.array(z.string()).optional().describe("Company LinkedIn pages to target, e.g. [\"https://www.linkedin.com/company/acme/\"]"),
  technologies: z.array(z.string()).optional().describe("Technologies the company uses, e.g. [\"Salesforce\"]"),
  headquarters_countries: z.array(z.string()).optional().describe("Countries the company is headquartered in, as English names"),
  office_countries: z.array(z.string()).optional().describe("Countries the company has an office in, as English names"),

  // Qualifiers — narrow the audience, never define it.
  exclude_domains: z.array(z.string()).optional().describe("Company domains to exclude"),
  exclude_job_titles: z.array(z.string()).optional().describe("Job titles to leave out"),
  exclude_industries: z.array(z.string()).optional().describe("LinkedIn industries to leave out"),
  exclude_countries: z.array(z.string()).optional().describe("Person countries to leave out"),
  exclude_headquarters_countries: z.array(z.string()).optional().describe("Company HQ countries to leave out"),
  company_size_min: z.number().int().min(0).optional().describe("Minimum company headcount"),
  company_size_max: z.number().int().min(0).optional().describe("Maximum company headcount"),
  revenue: z.array(z.string()).optional().describe("Annual revenue: ranges such as [\"1M-5M\"] map onto every GetLeads band they overlap; GetLeads' own bands (\"$10M to <$50M\") pass through"),
  founded_year_min: z.number().int().optional().describe("Company founded in or after this year"),
  founded_year_max: z.number().int().optional().describe("Company founded in or before this year"),
  total_funding_min: z.number().min(0).optional().describe("Minimum total funding raised, USD"),
  total_funding_max: z.number().min(0).optional().describe("Maximum total funding raised, USD"),
  employee_growth_rate_min: z.number().optional().describe("Minimum headcount growth rate"),
  employee_growth_rate_max: z.number().optional().describe("Maximum headcount growth rate"),
  job_start_date_min: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Only people who started their current role on or after this date (YYYY-MM-DD)"),
  verified_only: z.boolean().optional().describe("Only contacts with a VALID (verified) email"),
  email_status: z.array(z.string()).optional().describe("Explicit GetLeads email statuses, e.g. [\"VALID\"]; ignored when verified_only is true"),
  require_email: z.boolean().optional().describe("Only contacts with an email on record"),
  require_phone: z.boolean().optional().describe("Only contacts with a phone number on record"),
  max_per_company: z.number().int().min(1).max(50).optional().describe("Cap contacts kept per company (1–50)"),
  exclude_existing_organizations: z.boolean().optional().describe("Skip companies already in the workspace (default true)"),
  exclude_existing_prospects: z.boolean().optional().describe("Skip people already in the workspace (default true)"),
  exclude_linkedin_connections: z.boolean().optional().describe("Skip people already in the workspace's LinkedIn networks (default false)"),

  data_supplier: z.enum(["personal"]).optional().describe("\"personal\" runs on the workspace's own connected GetLeads key instead of Digital Crew credits"),
  icp_id: z.string().uuid().optional().describe("ICP this search was built from (provenance only)"),
  idempotency_key: z.string().optional().describe("Idempotency key for safe retries (auto-generated if omitted)"),
});

export const getleadsAddMoreSchema = z.object({
  ...withToken,
  list_id: z.string().uuid().describe("Existing COMPLETED GetLeads list UUID"),
  count: z.number().int().min(1).max(10000).optional().describe("Number of contacts to add (default 100, capped by the list's max_results)"),
});

import { z } from "zod";
import { withToken } from "../shared";

// Typed GetLeads contacts-search filters. Each key maps 1:1 to the raw criteria
// max-agent's mapCriteriaToGetleadsSearchCriteria() reads (see
// max-agent src/lib/services/getleads/search-criteria.ts), so the tool packs
// them into `getleads_search_criteria` unchanged — except max_results, which
// becomes criteria.searchLimit.
//
// GetLeads validates strictly and ONE off-list value 400s the whole request, so
// max-agent sanitizes before sending (drops non-country locations, non-domain
// strings and industries outside the LinkedIn taxonomy). The descriptions below
// steer the model to values that survive that sanitization.

export const getleadsCreateListSchema = z.object({
  ...withToken,
  list_name: z.string().min(1).describe("Name for the new prospect list"),
  max_results: z.number().int().min(1).max(50000).optional().describe("Max contacts to fetch (default 100). Billed per contact actually returned."),

  // Targeting — at least one is required (max-agent rejects qualifier-only searches).
  job_titles: z.array(z.string()).optional().describe("Job titles to match, e.g. [\"Head of Sales\", \"VP Marketing\"]. GetLeads ANDs titles with seniority — prefer one or the other"),
  seniority: z.array(z.enum(["C-Team", "VP", "Director", "Manager", "Staff"])).optional().describe("GetLeads seniority buckets"),
  countries: z.array(z.string()).optional().describe("Person countries as English country names, e.g. [\"Germany\", \"United States\"]. Cities/regions are dropped"),
  industries: z.array(z.string()).optional().describe("LinkedIn industry taxonomy names, e.g. [\"Software Development\"]. Values outside the taxonomy are dropped"),
  domains: z.array(z.string()).optional().describe("Company website domains to target, e.g. [\"acme.com\"]"),

  // Qualifiers — narrow the audience, never define it.
  exclude_domains: z.array(z.string()).optional().describe("Company domains to exclude"),
  company_size_min: z.number().int().min(0).optional().describe("Minimum company headcount"),
  company_size_max: z.number().int().min(0).optional().describe("Maximum company headcount"),
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

import { z } from "zod";
import { withToken } from "../shared";

// GetLeads contacts/search filters. Every multi-value field is AND-combined
// server-side; max-agent's buildGetleadsFilters reads these exact keys. Only
// the keys present are applied — provide at least one filter (create-list
// rejects an empty filter set with 400).
export const getleadsCreateListSchema = z.object({
  ...withToken,
  list_name: z.string().min(1).describe("Name for the new prospect list"),
  max_results: z
    .number()
    .int()
    .min(1)
    .max(50000)
    .optional()
    .describe(
      "Max contacts to fetch for this run (default 100). Maps to the search limit. Billed at one credit per record returned.",
    ),

  // Role filters
  job_titles: z
    .array(z.string())
    .optional()
    .describe('Job titles to match, e.g. ["Head of Growth", "CEO"]'),
  seniority: z
    .array(z.string())
    .optional()
    .describe(
      'Seniority levels: "C-Team", "VP", "Director", "Manager", "Staff", "Other"',
    ),

  // Person location
  countries: z
    .array(z.string())
    .optional()
    .describe('Person countries (full names), e.g. ["United States", "France"]'),

  // Company targeting
  domains: z
    .array(z.string())
    .optional()
    .describe(
      'Company website domains to include, e.g. ["acme.com"] (scheme/www/path stripped server-side)',
    ),
  exclude_domains: z
    .array(z.string())
    .optional()
    .describe('Company domains to exclude, e.g. ["competitor.com"]'),
  industries: z
    .array(z.string())
    .optional()
    .describe('Company industries to match, e.g. ["Software", "Marketing & Advertising"]'),
  company_size_min: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Minimum company employee count"),
  company_size_max: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Maximum company employee count"),

  // Contact quality / presence
  verified_only: z
    .boolean()
    .optional()
    .describe(
      'Only keep contacts with a VALID (verified) email. Shorthand for email_status=["VALID"]',
    ),
  email_status: z
    .array(z.string())
    .optional()
    .describe(
      'Email-status enum filter, e.g. ["VALID", "CATCH_ALL"]. Ignored when verified_only is set; uppercased server-side.',
    ),
  require_email: z
    .boolean()
    .optional()
    .describe("Only keep contacts that have an email on record"),
  require_phone: z
    .boolean()
    .optional()
    .describe("Only keep contacts that have a phone number on record"),

  // Per-company diversity
  max_per_company: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe("Cap the number of contacts returned per company (1–50)"),

  idempotency_key: z
    .string()
    .optional()
    .describe("Idempotency key for safe retries (auto-generated if omitted)"),
});

export const getleadsAddMoreSchema = z.object({
  ...withToken,
  list_id: z.string().uuid().describe("Existing GetLeads list UUID"),
  count: z
    .number()
    .int()
    .min(1)
    .max(10000)
    .optional()
    .describe("Number of contacts to add (default 100)"),
});

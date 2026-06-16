import { z } from "zod";
import { withToken } from "../shared";

// Numeric range used by month-based person filters. Serializes to the
// `{ gte, lte }` shape that max-agent's search-criteria.readRange() expects.
const monthRange = z
  .object({
    gte: z.number().int().min(0).optional().describe("Lower bound, inclusive (months)"),
    lte: z.number().int().min(0).optional().describe("Upper bound, inclusive (months)"),
  })
  .describe("Inclusive numeric range in months ({ gte, lte })");

// Enrichment toggles. Each one maps to a flat boolean key read by
// buildExploriumEnrichmentPlan(); each enabled enrichment consumes extra
// Explorium credits. Omitting a field leaves max-agent's default in place.
const enrichmentToggles = {
  profiles: z.boolean().optional().describe("Full professional profile: work history, education, skills, interests (default on)"),
  linkedin_posts: z.boolean().optional().describe("Prospect LinkedIn posts (default off)"),
  company_firmographics: z.boolean().optional().describe("Company firmographics: description, industry codes, ticker, revenue range (default on)"),
  company_technographics: z.boolean().optional().describe("Company technographics: full tech stack (default on)"),
  company_funding: z.boolean().optional().describe("Company funding & acquisition history (default on)"),
  company_intent: z.boolean().optional().describe("Bombora buyer-intent topics, surfaced as prospect intent strength (default on)"),
  company_ratings: z.boolean().optional().describe("Employee-sourced company ratings, Glassdoor-style (default off)"),
  company_workforce_trends: z.boolean().optional().describe("Workforce trends: department composition and quarterly changes (default off)"),
  company_webstack: z.boolean().optional().describe("Company website technology stack, BuiltWith (default off)"),
  company_hierarchy: z.boolean().optional().describe("Corporate hierarchy: parent, ultimate parent, subsidiaries (default off)"),
  company_website_traffic: z.boolean().optional().describe("Monthly website-traffic metrics, SEMrush (default off)"),
  company_lookalikes: z.boolean().optional().describe("Lookalike companies, Ocean.IO (default off)"),
  company_linkedin_posts: z.boolean().optional().describe("Company LinkedIn posts (default off)"),
};

// Industry filter. Explorium accepts only ONE of these per request; if more
// than one is supplied, max-agent picks linkedin → google → naics in that order.
const industryFilters = {
  linkedin_category: z.array(z.string()).optional().describe("LinkedIn industry categories. MUTUALLY EXCLUSIVE with google_category / naics_category — pick only one industry taxonomy"),
  google_category: z.array(z.string()).optional().describe("Google industry categories. MUTUALLY EXCLUSIVE with linkedin_category / naics_category"),
  naics_category: z.array(z.string()).optional().describe("NAICS industry codes. MUTUALLY EXCLUSIVE with linkedin_category / google_category"),
};

export const exploriumCreateListSchema = z.object({
  ...withToken,
  list_name: z.string().min(1).describe("Name for the new prospect list"),
  max_results: z.number().int().min(1).max(10000).optional().describe("Max leads to fetch for this run (default 100). Maps to the search limit."),

  // Person filters
  job_title: z.array(z.string()).optional().describe("Job titles to match, e.g. [\"VP Sales\", \"Head of Marketing\"]"),
  job_level: z.array(z.string()).optional().describe("Seniority levels, e.g. [\"cxo\", \"vp\", \"director\", \"manager\"]"),
  job_department: z.array(z.string()).optional().describe("Departments, e.g. [\"Sales\", \"Engineering\", \"Human resources\"]"),
  country_code: z.array(z.string()).optional().describe("Person country codes (ISO-3166 alpha-2), e.g. [\"us\", \"gb\"]"),
  region_country_code: z.array(z.string()).optional().describe("Person region+country codes, e.g. [\"US-CA\", \"GB-LND\"]"),
  city_region_country: z.array(z.string()).optional().describe("Person city/region/country strings, e.g. [\"San Francisco, California, United States\"]"),
  total_experience_months: monthRange.optional().describe("Total professional experience range, in months"),
  current_role_months: monthRange.optional().describe("Tenure in current role range, in months"),
  has_email: z.boolean().optional().describe("Only keep prospects with an email on record"),
  has_phone_number: z.boolean().optional().describe("Only keep prospects with a phone number on record"),

  // Company filters
  company_name: z.array(z.string()).optional().describe("Company names to match"),
  business_id: z.array(z.string()).optional().describe("Explorium business IDs to target specific companies"),
  company_size: z.array(z.string()).optional().describe("Employee-count buckets, e.g. [\"11-50\", \"51-200\", \"1001-5000\"]"),
  company_revenue: z.array(z.string()).optional().describe("Revenue buckets, e.g. [\"10M-25M\", \"100M-500M\"]"),
  company_country_code: z.array(z.string()).optional().describe("Company country codes (ISO-3166 alpha-2), e.g. [\"us\", \"de\"]"),
  company_region_country_code: z.array(z.string()).optional().describe("Company region+country codes, e.g. [\"US-NY\"]"),

  // Industry (one of)
  ...industryFilters,

  // Enrichment toggles
  ...enrichmentToggles,

  // Intent / keyword targeting
  intent_topics: z.array(z.string()).optional().describe("Bombora intent topics in \"category: topic\" form, e.g. [\"technology: CRM\"]"),
  website_keywords_search: z.array(z.string()).optional().describe("Keywords to search across company websites, stored as org keywords"),

  idempotency_key: z.string().optional().describe("Idempotency key for safe retries (auto-generated if omitted)"),
});

export const exploriumCreateCompanyListSchema = z.object({
  ...withToken,
  list_name: z.string().min(1).describe("Name for the new company (organization) list"),
  max_results: z.number().int().min(1).max(10000).optional().describe("Max companies to fetch for this run (default 100). Maps to the search limit."),

  // Location filters
  country_code: z.array(z.string()).optional().describe("Company country codes (ISO-3166 alpha-2), e.g. [\"us\", \"de\"]"),
  region_country_code: z.array(z.string()).optional().describe("Company region+country codes, e.g. [\"US-CA\"]"),
  city_region_country: z.array(z.string()).optional().describe("Company city/region/country strings"),

  // Company filters
  company_name: z.array(z.string()).optional().describe("Company names to match"),
  company_size: z.array(z.string()).optional().describe("Employee-count buckets, e.g. [\"11-50\", \"51-200\"]"),
  company_revenue: z.array(z.string()).optional().describe("Revenue buckets, e.g. [\"10M-25M\", \"100M-500M\"]"),
  company_age: z.array(z.string()).optional().describe("Company-age buckets, e.g. [\"3-10\", \"11-20\"]"),
  number_of_locations: z.array(z.string()).optional().describe("Number-of-locations buckets, e.g. [\"1\", \"2-5\", \"6-20\"]"),
  website_keywords: z.array(z.string()).optional().describe("Keywords that must appear on the company website"),
  company_tech_stack_tech: z.array(z.string()).optional().describe("Specific technologies in the company tech stack, e.g. [\"Salesforce\", \"React\"]"),
  company_tech_stack_category: z.array(z.string()).optional().describe("Tech-stack categories, e.g. [\"CRM\", \"Analytics\"]"),

  // Industry (one of)
  ...industryFilters,

  // Enrichment toggles
  ...enrichmentToggles,

  idempotency_key: z.string().optional().describe("Idempotency key for safe retries (auto-generated if omitted)"),
});

export const exploriumAddMoreSchema = z.object({
  ...withToken,
  list_id: z.string().uuid().describe("Existing Explorium list UUID"),
  count: z.number().int().min(1).max(10000).optional().describe("Number of leads to add (default 100)"),
});

import { z } from "zod";
import { withToken } from "../shared";

export const exploriumCreateListSchema = z.object({
  ...withToken,
  list_name: z.string().min(1).describe("Name for the new list"),
  explorium_search_criteria: z
    .record(z.unknown())
    .describe(
      "Explorium prospect search criteria (job_level, job_department, company_size, company_revenue, country_code, has_email, searchLimit, ...)",
    ),
  idempotency_key: z
    .string()
    .optional()
    .describe("Idempotency key for safe retries"),
});

export const exploriumCreateCompanyListSchema = z.object({
  ...withToken,
  list_name: z.string().min(1).describe("Name for the new organization list"),
  explorium_search_criteria: z
    .record(z.unknown())
    .describe(
      "Explorium company (business) search criteria (country_code, region_country_code, city_region_country, company_name, company_size, company_revenue, company_age, number_of_locations, website_keywords, company_tech_stack_tech, company_tech_stack_category, one of linkedin_category/google_category/naics_category, searchLimit, ...)",
    ),
  idempotency_key: z
    .string()
    .optional()
    .describe("Idempotency key for safe retries"),
});

export const exploriumAddMoreSchema = z.object({
  ...withToken,
  list_id: z.string().uuid().describe("Existing Explorium list UUID"),
  count: z
    .number()
    .int()
    .min(1)
    .max(10000)
    .optional()
    .describe("Number of leads to add (default 100)"),
});

import { z } from "zod";
import { withToken } from "../shared";

// Claire's paid people and company data lookups. Each tool spends credits when
// it runs, so every schema carries the same optional price cap.

const maxCost = z
  .number()
  .positive()
  .max(100)
  .optional()
  .describe(
    "Price cap for this one lookup, in US dollars before markup (e.g. 0.05 for a usual email search, 0.60 for a phone search). Pass the cap the user agreed to; omit it only when they set none.",
  );
const limit = z
  .number()
  .int()
  .min(1)
  .max(50)
  .optional()
  .describe("Rows to return (default 10, at most 50). Most sources bill per row, so this is the price dial.");
const domain = z.string().min(3).describe("Company website domain, e.g. 'stripe.com'.");
const linkedinUrl = z.string().url().describe("Full LinkedIn URL.");

export const claireEnrichPersonSchema = z.object({
  ...withToken,
  name: z.string().optional().describe("Person's full name. Needs `company` or `domain` with it."),
  company: z.string().optional().describe("Employer name."),
  domain: z.string().optional().describe("Employer website domain. Improves the hit rate."),
  linkedin: z.string().optional().describe("The person's LinkedIn profile URL (the strongest identifier)."),
  email: z.string().optional().describe("A known work email."),
  sections: z
    .array(z.enum(["identity", "organization", "social", "location", "employment", "skills", "contact"]))
    .optional()
    .describe("Which parts to return. Defaults to everything except contact."),
  include_contact: z
    .boolean()
    .optional()
    .describe("Also search for the work email, personal email and phone. Costs more; use for people you intend to contact."),
  max_cost_usd: maxCost,
});

export const claireEnrichCompanySchema = z.object({
  ...withToken,
  domain: z.string().optional().describe("Company website domain (best identifier)."),
  name: z.string().optional().describe("Company name. A name alone can match the wrong company."),
  linkedin: z.string().optional().describe("LinkedIn company page URL."),
  sections: z
    .array(z.enum(["profile", "news", "jobs", "similar"]))
    .optional()
    .describe("Defaults to 'profile'. Each extra section is its own paid lookup."),
  max_cost_usd: maxCost,
});

export const claireFindPeopleSchema = z.object({
  ...withToken,
  q: z.string().optional().describe("Plain description of the people: role, seniority, industry, place."),
  company_domain: z.string().optional().describe("Everyone listed at this company; add `title` for one role."),
  title: z.string().optional().describe("Job title."),
  full_name: z.string().optional().describe("One person's name, to find their profile."),
  country: z.string().optional().describe("ISO country code."),
  location: z.string().optional().describe("Free-text place, spelled out."),
  keywords: z.array(z.string()).optional().describe("Skills or topics the person must match."),
  limit,
  cursor: z.string().optional().describe("The previous result's next_cursor, with the same arguments, for the next page."),
  max_cost_usd: maxCost,
});

export const claireFindCompaniesSchema = z.object({
  ...withToken,
  q: z.string().optional().describe("Plain description of the companies."),
  name: z.string().optional(),
  industry: z.string().optional(),
  technology: z.string().optional().describe("A product or technology they use."),
  domain: z.string().optional(),
  country: z.string().optional().describe("ISO country code."),
  limit,
  cursor: z.string().optional(),
  max_cost_usd: maxCost,
});

export const claireDomainSchema = z.object({ ...withToken, domain, max_cost_usd: maxCost });
export const claireCompanyNewsSchema = z.object({ ...withToken, domain, limit, max_cost_usd: maxCost });

const jobFilters = {
  country: z.string().optional().describe("ISO country code."),
  location: z.string().optional(),
  remote: z.boolean().optional(),
  posted_within_days: z.number().int().min(1).max(365).optional(),
  limit,
  max_cost_usd: maxCost,
};
export const claireCompanyJobsSchema = z.object({
  ...withToken,
  domain: z.string().optional().describe("Company website domain (best)."),
  name: z.string().optional().describe("Company name."),
  ...jobFilters,
});
export const claireSearchJobsSchema = z.object({
  ...withToken,
  title: z.string().optional().describe("Job title to search across companies."),
  name: z.string().optional().describe("Company name."),
  domain: z.string().optional().describe("Company website domain."),
  ...jobFilters,
});

export const claireEmailSchema = z.object({
  ...withToken,
  email: z.string().email().describe("The email address."),
  max_cost_usd: maxCost,
});
export const claireLinkedinUrlSchema = z.object({ ...withToken, linkedin_url: linkedinUrl, max_cost_usd: maxCost });
export const claireLinkedinPostsSchema = z.object({
  ...withToken,
  linkedin_url: linkedinUrl,
  limit,
  cursor: z.string().optional(),
  max_cost_usd: maxCost,
});

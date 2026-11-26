import { callApi, strip, type McpServer } from "../shared";
import * as repo from "./repository";
import * as S from "./data-schema";

// Claire's paid people and company data lookups, one tool per operation. All of
// them go through max-agent's POST /api/v1/claire/data, which runs the lookup on
// Claire's provider waterfall with the member's own session and returns the
// finished result (with `charged_credits`). Claire asks its cheapest sources
// first and charges only for what it finds, so a lookup has a price range; the
// optional `max_cost_usd` caps it.
//
// Every description says the tool costs credits: a model never sees a UI, so
// the description is where it finds out before spending.

const COST =
  " COSTS CREDITS each time it runs; pass the price cap the user agreed to as max_cost_usd. Do not repeat a lookup that found nothing: asking again pays again.";

type Tool = {
  name: string;
  operation: string;
  title: string;
  description: string;
  schema: unknown;
};

const TOOLS: Tool[] = [
  {
    name: "claire_enrich_person",
    operation: "enrich_person",
    title: "Enrich one person via Claire",
    description:
      "Look up one person: role, employer, location, career history and, with include_contact, a verified work email, personal email and phone. Identify them with a LinkedIn URL, a work email, or a name plus a company or domain; a bare name is refused." + COST,
    schema: S.claireEnrichPersonSchema,
  },
  {
    name: "claire_enrich_company",
    operation: "enrich_company",
    title: "Enrich one company via Claire",
    description:
      "Firmographics for one company: industry, size, founding year, description, headquarters, LinkedIn page, logo, technologies, social links. Optional sections add recent news, open jobs or similar companies. Identify it by domain (best), LinkedIn company URL or name." + COST,
    schema: S.claireEnrichCompanySchema,
  },
  {
    name: "claire_find_people",
    operation: "find_people",
    title: "Find people via Claire",
    description:
      "Find people by a plain description, or by company domain, job title or name. Supply at least one of q, company_domain, title or full_name. An email in a row is unverified until checked with claire_verify_email." + COST,
    schema: S.claireFindPeopleSchema,
  },
  {
    name: "claire_find_companies",
    operation: "find_companies",
    title: "Find companies via Claire",
    description:
      "Find companies by a plain description, name, industry, technology they use, or domain. Supply at least one of them." + COST,
    schema: S.claireFindCompaniesSchema,
  },
  {
    name: "claire_find_similar_companies",
    operation: "find_similar_companies",
    title: "Find similar companies via Claire",
    description: "Companies similar to the one at a domain. Use to grow a list from a good-fit account." + COST,
    schema: S.claireDomainSchema,
  },
  {
    name: "claire_get_company_news",
    operation: "get_company_news",
    title: "Get a company's recent news via Claire",
    description: "Recent news articles about the company at a domain. Use to time or personalise outreach." + COST,
    schema: S.claireCompanyNewsSchema,
  },
  {
    name: "claire_get_company_jobs",
    operation: "get_company_jobs",
    title: "Get a company's open jobs via Claire",
    description:
      "One company's current open job postings, by domain (best) or name. Hiring is a buying signal: it shows what the company is investing in." + COST,
    schema: S.claireCompanyJobsSchema,
  },
  {
    name: "claire_search_jobs",
    operation: "search_jobs",
    title: "Search job postings via Claire",
    description:
      "Search open job postings by title across companies, or at one company. Supply a title, a company name or a domain. Use to find companies hiring for a role." + COST,
    schema: S.claireSearchJobsSchema,
  },
  {
    name: "claire_verify_email",
    operation: "verify_email",
    title: "Verify an email via Claire",
    description:
      "Check that an email address you ALREADY have is deliverable: valid, invalid, catch_all, risky or unknown. Not for finding an address." + COST,
    schema: S.claireEmailSchema,
  },
  {
    name: "claire_find_linkedin_from_email",
    operation: "find_linkedin_from_email",
    title: "Find a LinkedIn profile from an email via Claire",
    description: "Resolve a work email to the person's LinkedIn profile and name." + COST,
    schema: S.claireEmailSchema,
  },
  {
    name: "claire_get_linkedin_profile",
    operation: "get_linkedin_profile",
    title: "Get a LinkedIn profile via Claire",
    description:
      "A LinkedIn member's public profile from its URL: name, headline, location, about, followers. For career history and contact details use claire_enrich_person." + COST,
    schema: S.claireLinkedinUrlSchema,
  },
  {
    name: "claire_get_linkedin_posts",
    operation: "get_linkedin_posts",
    title: "Get a person's LinkedIn posts via Claire",
    description: "A LinkedIn member's recent public posts. Use to personalise outreach on what they wrote." + COST,
    schema: S.claireLinkedinPostsSchema,
  },
  {
    name: "claire_get_linkedin_company",
    operation: "get_linkedin_company",
    title: "Get a LinkedIn company page via Claire",
    description: "A LinkedIn company page from its URL. For a full firmographic record use claire_enrich_company." + COST,
    schema: S.claireLinkedinUrlSchema,
  },
];

/** The operation names, for tests and for max-agent's approval policy to match. */
export const CLAIRE_DATA_TOOL_NAMES = TOOLS.map((tool) => tool.name);

export function registerClaireDataTools(server: McpServer): void {
  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      { title: tool.title, description: tool.description, inputSchema: tool.schema },
      async (input) => {
        const { max_cost_usd, ...params } = strip(input, "bearer_token");
        return callApi(input.bearer_token, (t) =>
          repo.claireData(t, {
            operation: tool.operation,
            params,
            ...(typeof max_cost_usd === "number" ? { max_cost_usd } : {}),
          }),
        );
      },
    );
  }
}

import { callApi, omitKey, type McpServer } from "../shared";
import { lookupCategory, getJob, type FullenrichCategory } from "./repository";
import { companyLookupSchema, personLookupSchema, lookupShape, getJobSchema } from "./schema";

const categories: Array<{ category: FullenrichCategory; name: string; title: string; data: string }> = [
  { category: "emails", name: "fullenrich_emails", title: "Find emails with FullEnrich", data: "Work and personal email candidates, verification status and recommended best email." },
  { category: "phones", name: "fullenrich_phones", title: "Find phones with FullEnrich", data: "Phone numbers, country/region, line type and active status; ownership confidence and pickup likelihood where available." },
  { category: "identity", name: "fullenrich_identity", title: "Find identity with FullEnrich", data: "Full name, first/last name, professional headline and profile description." },
  { category: "linkedin", name: "fullenrich_linkedin", title: "Find LinkedIn profile with FullEnrich", data: "LinkedIn profile URL, ID, handle and connection count." },
  { category: "career", name: "fullenrich_career", title: "Find career with FullEnrich", data: "Current/past employers, titles, seniority, job functions, role descriptions and employment dates." },
  { category: "education-skills", name: "fullenrich_education_skills", title: "Find education and skills with FullEnrich", data: "Schools, degrees, education dates, declared skills, languages and proficiency." },
  { category: "location", name: "fullenrich_location", title: "Find location with FullEnrich", data: "City, state/region, country and country code." },
  { category: "company", name: "fullenrich_company", title: "Find company with FullEnrich", data: "Company name, ID, website/domain, description, logo, industry, specialties, type, founding year, employee count/range, LinkedIn details, followers, headquarters and offices." },
];

function invalidArguments(issues: Array<{ path: (string | number)[]; message: string }>) {
  return {
    content: [{ type: "text" as const, text: `Invalid arguments: ${issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ")}` }],
    isError: true,
  };
}

/** Kept individual in every catalog mode at the product's explicit request. */
export function registerFullenrichTools(server: McpServer): void {
  for (const { category, name, title, data } of categories) {
    const schema = category === "company" ? companyLookupSchema : personLookupSchema;
    server.registerTool(name, {
      title,
      description: `${data} PAID LOOKUP: can charge workspace/provider credits, including email identity resolution; requesting another category can create another paid job. Coverage varies; unavailable fields may be empty. Returns a Max job (202 pending or 200 completed) with status, phase, categories, matched, result and credit totals. Poll fullenrich_get_job until completed or failed; do not repeat this paid tool to poll. Supply request_id to recover an identical request. Max stores the result in the job; this tool does not automatically update a saved prospect.`,
      inputSchema: lookupShape,
      _strictInputSchema: schema,
      annotations: { readOnlyHint: false, idempotentHint: false, destructiveHint: false },
    }, async (input: Record<string, unknown>) => {
      const parsed = schema.safeParse(input);
      if (!parsed.success) return invalidArguments(parsed.error.issues);
      return callApi(parsed.data.bearer_token, (token) => lookupCategory(token, category, omitKey(parsed.data, "bearer_token")));
    });
  }

  server.registerTool("fullenrich_get_job", {
    title: "Get FullEnrich category lookup job",
    description: "Poll a Max FullEnrich job by job_id. Returns status, phase, categories, matched, result, provider_credits, credits_charged and error_message. Read-only: polls the existing provider job without creating a new paid enrichment. Pending identity resolution may advance the previously requested paid lookup. Jobs are isolated to the authenticated workspace. Continue polling until completed or failed; never resubmit a category tool just to check status.",
    inputSchema: getJobSchema.shape,
    _strictInputSchema: getJobSchema,
    annotations: { readOnlyHint: true, idempotentHint: true },
  }, async (input: Record<string, unknown>) => {
    const parsed = getJobSchema.safeParse(input);
    if (!parsed.success) return invalidArguments(parsed.error.issues);
    return callApi(parsed.data.bearer_token, (token) => getJob(token, parsed.data.job_id));
  });
}

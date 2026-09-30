import { z } from "zod";
import { withToken } from "../shared";

// Mirror Max's public input contract; canonicalize before proxying or using an
// idempotency UUID, so incidental LinkedIn tracking parameters are not identity.
const linkedin = (kind: "in" | "company") => z.string().trim().url().max(500).refine(value => {
  try {
    const url = new URL(value);
    const path = kind === "in" ? /^\/in\/[a-zA-Z0-9_%.-]+\/?$/ : /^\/company\/[a-zA-Z0-9_%.-]+\/?$/;
    const handle = decodeURIComponent(url.pathname.split("/")[2] ?? "");
    return url.protocol === "https:" &&
      /^(?:[a-z]{2,3}\.)?linkedin\.com$/i.test(url.hostname) &&
      !url.username && !url.password && !url.port &&
      path.test(url.pathname) && !/[\u0000-\u0020\u007f/\\]/.test(handle);
  } catch {
    return false;
  }
}, "Use a valid HTTPS LinkedIn profile URL.").transform(value => {
  const url = new URL(value);
  url.search = "";
  url.hash = "";
  return url.toString();
});

const domain = z.string().trim().toLowerCase().max(253).refine(
  (value) => /^(?=.{1,253}$)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$/.test(value),
  "Use a company hostname such as example.com, without a scheme, port or path.",
);

export const lookupShape = {
  ...withToken,
  email: z.string().trim().email().max(320).optional().describe("Known email; Max first resolves its identity when needed."),
  linkedin_url: linkedin("in").optional().describe("Person's HTTPS LinkedIn /in/ profile URL. Regional LinkedIn hosts are accepted; tracking query/hash is removed."),
  person_name: z.string().trim().min(1).max(200).refine(value => !/[\u0000-\u001f\u007f]/.test(value), "Use a name without control characters.").optional().describe("Full person name; also provide company_domain or company_linkedin_url."),
  company_domain: domain.optional().describe("Company hostname, for example example.com. Required with a name unless company_linkedin_url is supplied."),
  company_linkedin_url: linkedin("company").optional().describe("Company's HTTPS LinkedIn /company/ URL; can identify a standalone company lookup. Regional hosts accepted; query/hash removed."),
  request_id: z.string().uuid().optional().describe("Idempotency UUID. Reuse only for the same category and identifiers to recover the same job without another paid submission."),
};

export const personLookupSchema = z.object(lookupShape).strict().refine(
  (value) => Boolean(value.email || value.linkedin_url || (value.person_name && (value.company_domain || value.company_linkedin_url))),
  "Provide email, linkedin_url, or person_name with a company_domain/company_linkedin_url.",
);

export const companyLookupSchema = z.object(lookupShape).strict().refine(
  (value) => Boolean(value.company_domain || value.company_linkedin_url || value.email || value.linkedin_url),
  "Provide company_domain, company_linkedin_url, email, or linkedin_url to identify the company.",
);

export const getJobSchema = z.object({
  ...withToken,
  job_id: z.string().uuid().describe("Max job UUID returned by one of the fullenrich_* lookup tools."),
}).strict();

export type LookupBody = Omit<z.infer<typeof personLookupSchema>, "bearer_token">;

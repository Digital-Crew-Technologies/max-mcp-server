import { apiUrl, authHeaders, fetchWithRetry } from "../shared";
import type { LookupBody } from "./schema";

export type FullenrichCategory = "emails" | "phones" | "identity" | "linkedin" | "career" | "education-skills" | "location" | "company";

// Only Max's backend holds FULLENRICH_API_KEY. MCP forwards the authenticated
// caller to Max; it never calls the provider or an independent Claire service.
export function lookupCategory(token: string, category: FullenrichCategory, body: LookupBody): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/fullenrich/${category}`), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  }, { maxRetries: 0, timeoutMs: 60_000 });
}

export function getJob(token: string, jobId: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/fullenrich/jobs/${encodeURIComponent(jobId)}`), {
    headers: authHeaders(token),
  }, { timeoutMs: 60_000 });
}

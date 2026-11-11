import { apiUrl, authHeaders, fetchWithRetry } from "../shared";

// Every Claire call starts a job billed to the workspace and runs for a minute
// or more (competitor finding takes 1-3 min). One attempt with a timeout that
// covers the job: a retry would start, and bill, a second job.
const CLAIRE_CONFIG = { timeoutMs: 200_000, maxRetries: 0 };

// All Claire calls go through max-agent's /api/v1/claire/* proxy. That layer
// holds the X-Service-Secret + X-On-Behalf-Of pair, so the MCP server only
// needs the user's standard bearer token — same auth model as Apollo,
// Explorium, etc. Routes are synchronous: max-agent submits + polls Claire
// internally and returns the final result.

export async function claireSearch(
  token: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/claire/search`), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  }, CLAIRE_CONFIG);
}

export async function claireDeepResearch(
  token: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/claire/deep-research`), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  }, CLAIRE_CONFIG);
}

export async function claireMarketWatch(
  token: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/claire/market-watch`), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  }, CLAIRE_CONFIG);
}

export async function claireCompetitorFinder(
  token: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/claire/competitor-finder`), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  }, CLAIRE_CONFIG);
}

export async function claireExtractProspects(
  token: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/claire/extract-prospects`), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  }, CLAIRE_CONFIG);
}

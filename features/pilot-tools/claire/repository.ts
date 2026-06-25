import { apiUrl, authHeaders, fetchWithRetry } from "../shared";

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
  });
}

export async function claireDeepResearch(
  token: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/claire/deep-research`), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

export async function claireMarketWatch(
  token: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/claire/market-watch`), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

export async function claireCompetitorFinder(
  token: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/claire/competitor-finder`), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

export async function claireExtractProspects(
  token: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/claire/extract-prospects`), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

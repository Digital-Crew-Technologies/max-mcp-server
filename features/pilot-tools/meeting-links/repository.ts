import { apiUrl, authHeaders, buildQuery, fetchWithRetry } from "../shared";

// Meeting links (booking pages): max-agent /api/v1/meeting-links/* (scopes
// prospects:read / prospects:write). The public visitor routes
// (/api/v1/booking/<slug>/*) are deliberately not proxied: they are the lead's
// own flow, rate-limited per network and authorized by a visitor token.

const BASE = "/api/v1/meeting-links";

const path = (id: string, suffix = "") => `${BASE}/${encodeURIComponent(id)}${suffix}`;

// Creating a page is not idempotent: a retry after a slow success would
// publish a second page at a second address.
const CREATE_CONFIG = { maxRetries: 0 };

export async function listMeetingLinks(token: string): Promise<Response> {
  return fetchWithRetry(apiUrl(BASE), { headers: authHeaders(token) });
}

export async function getMeetingLink(token: string, id: string): Promise<Response> {
  return fetchWithRetry(apiUrl(path(id)), { headers: authHeaders(token) });
}

export async function createMeetingLink(
  token: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(
    apiUrl(BASE),
    { method: "POST", headers: authHeaders(token), body: JSON.stringify(body) },
    CREATE_CONFIG,
  );
}

export async function updateMeetingLink(
  token: string,
  id: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(apiUrl(path(id)), {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

export async function deleteMeetingLink(token: string, id: string): Promise<Response> {
  return fetchWithRetry(apiUrl(path(id)), { method: "DELETE", headers: authHeaders(token) });
}

export async function listMeetingLinkSubmissions(token: string, id: string): Promise<Response> {
  return fetchWithRetry(apiUrl(path(id, "/submissions")), { headers: authHeaders(token) });
}

export async function suggestMeetingLinkSlug(token: string, title: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`${BASE}/slug-suggestion${buildQuery({ title })}`), {
    headers: authHeaders(token),
  });
}

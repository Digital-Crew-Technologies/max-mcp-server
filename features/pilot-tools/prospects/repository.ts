import { apiUrl, authHeaders, buildQuery, fetchWithRetry } from "../shared";

export async function listProspects(
  token: string,
  params: Record<string, unknown> = {},
): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/prospects${buildQuery(params)}`), {
    headers: authHeaders(token),
  });
}

export async function getProspect(token: string, id: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/prospects/${id}`), { headers: authHeaders(token) });
}

export async function createProspect(token: string, body: Record<string, unknown>): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/prospects`), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

export async function updateProspect(token: string, id: string, body: Record<string, unknown>): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/prospects/${id}`), {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

export async function deleteProspect(token: string, id: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/prospects/${id}`), {
    method: "DELETE",
    headers: authHeaders(token),
  });
}

export async function bulkImportProspects(token: string, body: Record<string, unknown>): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/prospects/bulk-import`), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

export async function bulkDeleteProspects(token: string, ids: string[]): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/prospects/bulk-delete`), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ ids }),
  });
}

export async function getProspectCampaignActivity(token: string, id: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/prospects/${id}/campaign-activity`), { headers: authHeaders(token) });
}

// ── Prospect sub-resources ───────────────────────────────────────────────────
// Claire enrichment, intelligence-watch and hook runs are synchronous upstream
// work (maxDuration=300 on those routes) and may bill the workspace, so they get
// a long timeout and NO retries — a retry could charge twice. Creates that are
// not idempotent (a new hook) also skip retries.

const LONG_RUN = { timeoutMs: 290_000, maxRetries: 0 };
const NO_RETRY = { maxRetries: 0 };

const prospectPath = (id: string) => `/api/v1/prospects/${encodeURIComponent(id)}`;

export async function listProspectCampaigns(token: string, id: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`${prospectPath(id)}/campaigns`), { headers: authHeaders(token) });
}

export async function getProspectQualification(token: string, id: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`${prospectPath(id)}/qualification`), { headers: authHeaders(token) });
}

export async function listProspectProfileActivities(token: string, id: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`${prospectPath(id)}/profile-activities`), { headers: authHeaders(token) });
}

export async function listProspectProfileHooks(token: string, id: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`${prospectPath(id)}/profile-hooks`), { headers: authHeaders(token) });
}

export async function createProspectProfileHook(
  token: string,
  id: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(
    apiUrl(`${prospectPath(id)}/profile-hooks`),
    { method: "POST", headers: authHeaders(token), body: JSON.stringify(body) },
    NO_RETRY,
  );
}

export async function updateProspectProfileHook(
  token: string,
  id: string,
  hookId: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(apiUrl(`${prospectPath(id)}/profile-hooks/${encodeURIComponent(hookId)}`), {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

export async function deleteProspectProfileHook(token: string, id: string, hookId: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`${prospectPath(id)}/profile-hooks/${encodeURIComponent(hookId)}`), {
    method: "DELETE",
    headers: authHeaders(token),
  });
}

export async function runProspectProfileHook(token: string, id: string, hookId: string): Promise<Response> {
  return fetchWithRetry(
    apiUrl(`${prospectPath(id)}/profile-hooks/${encodeURIComponent(hookId)}/run`),
    { method: "POST", headers: authHeaders(token) },
    LONG_RUN,
  );
}

export async function claireEnrichProspect(token: string, id: string): Promise<Response> {
  return fetchWithRetry(
    apiUrl(`${prospectPath(id)}/claire-enrich`),
    { method: "POST", headers: authHeaders(token) },
    LONG_RUN,
  );
}

export async function createProspectIntelligenceWatch(token: string, id: string): Promise<Response> {
  return fetchWithRetry(
    apiUrl(`${prospectPath(id)}/intelligence-watch`),
    { method: "POST", headers: authHeaders(token) },
    LONG_RUN,
  );
}

export async function refreshProspectImages(token: string, id: string): Promise<Response> {
  return fetchWithRetry(
    apiUrl(`${prospectPath(id)}/refresh-images`),
    { method: "POST", headers: authHeaders(token) },
    { timeoutMs: 45_000, maxRetries: 0 },
  );
}

export async function refreshProspectSocialProfiles(token: string, id: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`${prospectPath(id)}/social-profiles/refresh`), {
    method: "POST",
    headers: authHeaders(token),
  });
}

// ── Public share links (prospect + whole People database) ────────────────────

export async function getProspectShareLink(token: string, id: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`${prospectPath(id)}/share-link`), { headers: authHeaders(token) });
}

export async function createProspectShareLink(token: string, id: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`${prospectPath(id)}/share-link`), {
    method: "POST",
    headers: authHeaders(token),
  });
}

export async function revokeProspectShareLink(token: string, id: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`${prospectPath(id)}/share-link`), {
    method: "DELETE",
    headers: authHeaders(token),
  });
}

export async function getPeopleShareLink(token: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/workspace/people-share-link`), { headers: authHeaders(token) });
}

export async function createPeopleShareLink(token: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/workspace/people-share-link`), {
    method: "POST",
    headers: authHeaders(token),
  });
}

export async function revokePeopleShareLink(token: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/workspace/people-share-link`), {
    method: "DELETE",
    headers: authHeaders(token),
  });
}

// ── Global (⌘K) workspace search ─────────────────────────────────────────────

export async function searchWorkspace(token: string, params: Record<string, unknown>): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/search${buildQuery(params)}`), { headers: authHeaders(token) });
}

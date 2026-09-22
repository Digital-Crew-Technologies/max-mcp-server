import { apiUrl, authHeaders, buildQuery, fetchWithRetry } from "../shared";

export async function listCampaigns(
  token: string,
  params: { page?: number; pageSize?: number; status?: string; search?: string; sortBy?: string; sortOrder?: string } = {},
): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/campaigns${buildQuery(params)}`), {
    headers: authHeaders(token),
  });
}

export async function getCampaign(token: string, id: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/campaigns/${id}`), { headers: authHeaders(token) });
}

export async function getCampaignMemory(token: string, id: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/campaigns/${id}/memory`), { headers: authHeaders(token) });
}

export async function updateCampaignMemory(
  token: string,
  id: string,
  patch: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/campaigns/${id}/memory`), {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(patch),
  });
}

export async function createCampaign(token: string, body: Record<string, unknown>): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/campaigns`), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

export async function updateCampaign(token: string, id: string, body: Record<string, unknown>): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/campaigns/${id}`), {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

export async function deleteCampaign(token: string, id: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/campaigns/${id}`), {
    method: "DELETE",
    headers: authHeaders(token),
  });
}

export async function launchCampaign(token: string, id: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/campaigns/${id}/launch`), {
    method: "POST",
    headers: authHeaders(token),
  });
}

export async function pauseCampaign(token: string, id: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/campaigns/${id}/pause`), {
    method: "PATCH",
    headers: authHeaders(token),
  });
}

export async function resumeCampaign(token: string, id: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/campaigns/${id}/resume`), {
    method: "PATCH",
    headers: authHeaders(token),
  });
}

export async function stopCampaign(token: string, id: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/campaigns/${id}/stop`), {
    method: "PATCH",
    headers: authHeaders(token),
  });
}

export async function archiveCampaign(token: string, id: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/campaigns/${id}/archive`), {
    method: "PATCH",
    headers: authHeaders(token),
  });
}

export async function restoreCampaign(token: string, id: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/campaigns/${id}/restore`), {
    method: "PATCH",
    headers: authHeaders(token),
  });
}

export async function getCampaignStats(token: string, id: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/campaigns/${id}/stats`), { headers: authHeaders(token) });
}

export async function getCampaignLeadAnalytics(
  token: string,
  id: string,
  params: { page?: number; pageSize?: number } = {},
): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/campaigns/${id}/lead-analytics${buildQuery(params)}`), {
    headers: authHeaders(token),
  });
}

export async function getCampaignNodeRunCounts(token: string, id: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/campaigns/${id}/node-run-counts`), { headers: authHeaders(token) });
}

export async function listSchedulePresets(token: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/campaigns/schedule-presets`), { headers: authHeaders(token) });
}

export async function createSchedulePreset(token: string, body: Record<string, unknown>): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/campaigns/schedule-presets`), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

export async function updateSchedulePreset(
  token: string,
  id: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/campaigns/schedule-presets/${id}`), {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

export async function deleteSchedulePreset(token: string, id: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/campaigns/schedule-presets/${id}`), {
    method: "DELETE",
    headers: authHeaders(token),
  });
}

// ── A/B tests, audience, feeds, duplicate, share link ──────────────────────
//
// Audience writes enroll people and can start executions on a running
// campaign; duplicate creates a new row. A blind retry of either could double
// the side effect (or, for duplicate, create a second copy), so they get a
// longer timeout and no retries.
const WRITE_ONCE = { timeoutMs: 60_000, maxRetries: 0 };

function campaignPath(id: string, suffix = ""): string {
  return `/api/v1/campaigns/${encodeURIComponent(id)}${suffix}`;
}

export async function getCampaignAbTests(token: string, id: string): Promise<Response> {
  return fetchWithRetry(apiUrl(campaignPath(id, "/ab-tests")), { headers: authHeaders(token) });
}

export async function updateCampaignAbTest(
  token: string,
  id: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(apiUrl(campaignPath(id, "/ab-tests")), {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

export async function getCampaignAudience(token: string, id: string): Promise<Response> {
  return fetchWithRetry(apiUrl(campaignPath(id, "/audience")), { headers: authHeaders(token) });
}

export async function listCampaignAudienceProspects(
  token: string,
  id: string,
  params: Record<string, unknown> = {},
): Promise<Response> {
  return fetchWithRetry(apiUrl(`${campaignPath(id, "/audience/prospects")}${buildQuery(params)}`), {
    headers: authHeaders(token),
  });
}

export async function addCampaignAudienceProspects(
  token: string,
  id: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(
    apiUrl(campaignPath(id, "/audience/prospects")),
    { method: "POST", headers: authHeaders(token), body: JSON.stringify(body) },
    WRITE_ONCE,
  );
}

export async function removeCampaignAudienceProspects(
  token: string,
  id: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(apiUrl(campaignPath(id, "/audience/prospects/remove")), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

export async function attachCampaignAudienceList(
  token: string,
  id: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(
    apiUrl(campaignPath(id, "/audience/lists")),
    { method: "POST", headers: authHeaders(token), body: JSON.stringify(body) },
    WRITE_ONCE,
  );
}

export async function detachCampaignAudienceList(
  token: string,
  id: string,
  listId: string,
): Promise<Response> {
  return fetchWithRetry(apiUrl(campaignPath(id, `/audience/lists/${encodeURIComponent(listId)}`)), {
    method: "DELETE",
    headers: authHeaders(token),
  });
}

export async function syncCampaignAudience(token: string, id: string): Promise<Response> {
  return fetchWithRetry(
    apiUrl(campaignPath(id, "/audience/sync")),
    { method: "POST", headers: authHeaders(token) },
    WRITE_ONCE,
  );
}

export async function listCampaignConversations(token: string, id: string): Promise<Response> {
  return fetchWithRetry(apiUrl(campaignPath(id, "/conversations")), { headers: authHeaders(token) });
}

export async function duplicateCampaign(
  token: string,
  id: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(
    apiUrl(campaignPath(id, "/duplicate")),
    { method: "POST", headers: authHeaders(token), body: JSON.stringify(body) },
    WRITE_ONCE,
  );
}

export async function getCampaignFeed(
  token: string,
  id: string,
  params: { limit?: number } = {},
): Promise<Response> {
  return fetchWithRetry(apiUrl(`${campaignPath(id, "/feed")}${buildQuery(params)}`), {
    headers: authHeaders(token),
  });
}

export async function getCampaignLaunchPreflight(token: string, id: string): Promise<Response> {
  return fetchWithRetry(apiUrl(campaignPath(id, "/launch/preflight")), { headers: authHeaders(token) });
}

export async function bulkGetCampaignNodeRunCounts(token: string, ids: string[]): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/campaigns/node-run-counts${buildQuery({ id: ids })}`), {
    headers: authHeaders(token),
  });
}

export async function getCampaignShareLink(token: string, id: string): Promise<Response> {
  return fetchWithRetry(apiUrl(campaignPath(id, "/share-link")), { headers: authHeaders(token) });
}

export async function createCampaignShareLink(token: string, id: string): Promise<Response> {
  return fetchWithRetry(apiUrl(campaignPath(id, "/share-link")), {
    method: "POST",
    headers: authHeaders(token),
  });
}

export async function revokeCampaignShareLink(token: string, id: string): Promise<Response> {
  return fetchWithRetry(apiUrl(campaignPath(id, "/share-link")), {
    method: "DELETE",
    headers: authHeaders(token),
  });
}

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

import { apiUrl, authHeaders, buildQuery, fetchWithRetry } from "../shared";

export async function getEmailTrackingEvents(
  token: string,
  params: { prospect_id: string; event_types?: string[] },
): Promise<Response> {
  return fetchWithRetry(
    apiUrl(`/api/v1/analytics/email-events${buildQuery(params)}`),
    { headers: authHeaders(token) },
  );
}

export async function getProspectEngagementTimeline(
  token: string,
  prospectId: string,
): Promise<Response> {
  return fetchWithRetry(
    apiUrl(
      `/api/v1/analytics/prospect-timeline${buildQuery({ prospect_id: prospectId })}`,
    ),
    { headers: authHeaders(token) },
  );
}

export async function getLinkClickDetails(
  token: string,
  campaignId: string,
): Promise<Response> {
  return fetchWithRetry(
    apiUrl(
      `/api/v1/analytics/link-clicks${buildQuery({ campaign_id: campaignId })}`,
    ),
    { headers: authHeaders(token) },
  );
}

export async function getCampaignEngagementSummary(
  token: string,
  campaignId: string,
): Promise<Response> {
  return fetchWithRetry(
    apiUrl(
      `/api/v1/analytics/campaign-summary${buildQuery({ campaign_id: campaignId })}`,
    ),
    { headers: authHeaders(token) },
  );
}

// The overview aggregates every channel, deals, crew and signals for the
// period in one response — slow on big workspaces, so allow longer than the
// 30s default (still a GET, so retries stay on).
const OVERVIEW_CONFIG = { timeoutMs: 60_000 };

export async function getAnalyticsOverview(
  token: string,
  params: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(
    apiUrl(`/api/v1/analytics/overview${buildQuery(params)}`),
    { headers: authHeaders(token) },
    OVERVIEW_CONFIG,
  );
}

export async function getConversationAnalytics(
  token: string,
  params: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(
    apiUrl(`/api/v1/analytics/conversations${buildQuery(params)}`),
    { headers: authHeaders(token) },
  );
}

export async function getEntityAnalytics(
  token: string,
  params: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(
    apiUrl(`/api/v1/analytics/entity${buildQuery(params)}`),
    { headers: authHeaders(token) },
  );
}

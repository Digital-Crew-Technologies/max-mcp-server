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

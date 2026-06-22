import { apiUrl, authHeaders, fetchWithRetry } from "../shared";

// Thin proxy to max-agent's /api/v1/crm/* — max-agent owns the HubSpot
// connection, token, and (later) audit/controls. Same pattern as Claire/Apollo.

export async function crmSearchContacts(
  token: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/crm/search-contacts`), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

export async function crmGetContact(
  token: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/crm/get-contact`), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

export async function crmUpsertContact(
  token: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/crm/upsert-contact`), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

export async function crmUpsertCompany(
  token: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/crm/upsert-company`), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

export async function crmStatus(token: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/crm/status`), {
    method: "GET",
    headers: authHeaders(token),
  });
}

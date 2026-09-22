import { apiUrl, authHeaders, fetchWithRetry } from "../shared";

// max-agent's scoped CRM operation routes (src/features/crm/handlers/crm.handler.ts).
// max-agent keeps the HubSpot credential server-side and never returns it, so
// contact/company reads and upserts go through these routes rather than
// HubSpot directly. Scopes: crm:read / crm:write.

function post(token: string, path: string, body: Record<string, unknown>): Promise<Response> {
  return fetchWithRetry(apiUrl(path), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

export function searchContacts(token: string, body: Record<string, unknown>): Promise<Response> {
  return post(token, `/api/v1/crm/search-contacts`, body);
}

export function getContact(token: string, body: Record<string, unknown>): Promise<Response> {
  return post(token, `/api/v1/crm/get-contact`, body);
}

export function upsertContact(token: string, body: Record<string, unknown>): Promise<Response> {
  return post(token, `/api/v1/crm/upsert-contact`, body);
}

export function upsertCompany(token: string, body: Record<string, unknown>): Promise<Response> {
  return post(token, `/api/v1/crm/upsert-company`, body);
}

export function getStatus(token: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/crm/status`), { headers: authHeaders(token) });
}

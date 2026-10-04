import { apiUrl, authHeaders, buildQuery, fetchWithRetry } from "../shared";

// Sales OS crew and desktop: max-agent /api/v1/sales-os/*.
//
//   crew            GET  /crew            workspace:read   any workspace API key (incl. "Max MCP")
//   crew check-in   POST /crew/check-in   workspace:write  API keys check in as an agent or a digital worker
//   desktop items   GET  /items           sales_os:read    personal API key (or the signed-in member's JWT)
//   add an item     POST /items           sales_os:write   personal API key (or the signed-in member's JWT)
//
// The desktop routes act on the key OWNER's own desktop, so max-agent refuses
// the workspace's shared "Max MCP" key there (403 PERSONAL_KEY_REQUIRED).
// The desktop GET/PUT, files, shared folders and the Realtime presence token
// are not proxied: the full document is up to 256 KiB per read, file routes
// move bytes, and the token is a credential.
//
// Writes never retry:
//   - an add is not idempotent: a retried POST after a slow success would put
//     a second note or folder on the desktop;
//   - a check-in is an idempotent upsert, but it is a heartbeat (the next call
//     replaces a lost one) and max-agent limits it to 30 calls a minute per
//     key, so retrying a 429 inside that window would only burn the budget.

const BASE = "/api/v1/sales-os";

const NO_RETRY = { maxRetries: 0 };

type Body = Record<string, unknown>;

function post(token: string, path: string, body: Body): Promise<Response> {
  return fetchWithRetry(
    apiUrl(`${BASE}${path}`),
    { method: "POST", headers: authHeaders(token), body: JSON.stringify(body) },
    NO_RETRY,
  );
}

export async function listCrew(
  token: string,
  params: { include_ai?: boolean },
): Promise<Response> {
  return fetchWithRetry(apiUrl(`${BASE}/crew${buildQuery(params)}`), {
    headers: authHeaders(token),
  });
}

export async function checkInCrew(token: string, body: Body): Promise<Response> {
  return post(token, "/crew/check-in", body);
}

export async function listDesktopItems(
  token: string,
  params: { folder_id?: string },
): Promise<Response> {
  return fetchWithRetry(apiUrl(`${BASE}/items${buildQuery(params)}`), {
    headers: authHeaders(token),
  });
}

export async function addDesktopItem(token: string, body: Body): Promise<Response> {
  return post(token, "/items", body);
}

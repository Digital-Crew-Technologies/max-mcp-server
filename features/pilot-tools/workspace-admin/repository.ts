import { apiUrl, authHeaders, buildQuery, fetchWithRetry } from "../shared";

// Workspace settings & admin reads that a scoped workspace API key may call.
// Admin-only mutations (custom fields, roles, members, crew rates, budgets…)
// reject API keys upstream and are deliberately absent here.
//
// The two model-backed POSTs charge workspace credits, and a duplicate scan
// walks every prospect + organization: long timeouts, no retries (a retried
// timeout would re-run — and re-bill — the work).

const INTEL_CONFIG = { timeoutMs: 125_000, maxRetries: 0 };
const SCAN_CONFIG = { timeoutMs: 120_000, maxRetries: 0 };

function get(token: string, path: string): Promise<Response> {
  return fetchWithRetry(apiUrl(path), { headers: authHeaders(token) });
}

// ── Custom fields ───────────────────────────────────────────────────────────

export async function listCustomFields(
  token: string,
  params: Record<string, unknown>,
): Promise<Response> {
  return get(token, `/api/v1/custom-fields${buildQuery(params)}`);
}

// ── Data suppliers (bring-your-own-key providers) ───────────────────────────

export async function listDataSuppliers(token: string): Promise<Response> {
  return get(token, "/api/v1/data-suppliers");
}

export async function updateDataSupplierConfig(
  token: string,
  provider: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(
    apiUrl(`/api/v1/data-suppliers/${encodeURIComponent(provider)}/config`),
    { method: "PATCH", headers: authHeaders(token), body: JSON.stringify(body) },
  );
}

export async function disconnectDataSupplier(
  token: string,
  provider: string,
): Promise<Response> {
  return fetchWithRetry(
    apiUrl(`/api/v1/data-suppliers/${encodeURIComponent(provider)}/disconnect`),
    { method: "POST", headers: authHeaders(token), body: JSON.stringify({}) },
  );
}

// ── Data quality (duplicates) ───────────────────────────────────────────────

export async function listDuplicates(
  token: string,
  params: Record<string, unknown>,
): Promise<Response> {
  return get(token, `/api/v1/data-quality/duplicates${buildQuery(params)}`);
}

export async function dismissDuplicate(token: string, id: string): Promise<Response> {
  return fetchWithRetry(
    apiUrl(`/api/v1/data-quality/duplicates/${encodeURIComponent(id)}`),
    {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify({ status: "dismissed" }),
    },
  );
}

export async function scanDuplicates(token: string): Promise<Response> {
  return fetchWithRetry(
    apiUrl("/api/v1/data-quality/duplicates/scan"),
    { method: "POST", headers: authHeaders(token), body: JSON.stringify({}) },
    SCAN_CONFIG,
  );
}

export async function getDataQualitySettings(token: string): Promise<Response> {
  return get(token, "/api/v1/data-quality/settings");
}

// ── Agents & intel ──────────────────────────────────────────────────────────

export async function getWorkspaceAgents(token: string): Promise<Response> {
  return get(token, "/api/v1/workspace-agents");
}

export async function generateWorkspaceIntel(token: string): Promise<Response> {
  return fetchWithRetry(
    apiUrl("/api/v1/workspace-intel/generate"),
    { method: "POST", headers: authHeaders(token), body: JSON.stringify({}) },
    INTEL_CONFIG,
  );
}

// ── Team roster ─────────────────────────────────────────────────────────────

export async function listMembers(token: string): Promise<Response> {
  return get(token, "/api/v1/workspace/members");
}

export async function listRoles(token: string): Promise<Response> {
  return get(token, "/api/v1/workspace/roles");
}

export async function listCrewRates(token: string): Promise<Response> {
  return get(token, "/api/v1/workspace/crew-rates");
}

export async function listDigitalWorkers(token: string): Promise<Response> {
  return get(token, "/api/v1/workspace/digital-workers");
}

// ── Workspace wallet ────────────────────────────────────────────────────────

export async function getWallet(token: string): Promise<Response> {
  return get(token, "/api/v1/billing/workspace-wallet");
}

export async function listWalletBudgets(token: string): Promise<Response> {
  return get(token, "/api/v1/billing/workspace-wallet/budgets");
}

export async function listWalletConsumption(
  token: string,
  params: Record<string, unknown>,
): Promise<Response> {
  return get(token, `/api/v1/billing/workspace-wallet/consumption${buildQuery(params)}`);
}

export async function listWalletGifts(token: string): Promise<Response> {
  return get(token, "/api/v1/billing/workspace-wallet/gifts");
}

// ── Max chat history ────────────────────────────────────────────────────────

export async function listAgentSessions(
  token: string,
  params: Record<string, unknown>,
): Promise<Response> {
  return get(token, `/api/v1/agent/sessions${buildQuery(params)}`);
}

export async function getAgentSessionMessages(
  token: string,
  id: string,
): Promise<Response> {
  return get(token, `/api/v1/agent/sessions/${encodeURIComponent(id)}/messages`);
}

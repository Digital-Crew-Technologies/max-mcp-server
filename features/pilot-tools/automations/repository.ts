import { apiUrl, authHeaders, buildQuery, fetchWithRetry } from "../shared";

// General automation workflows (trigger → steps) via max-agent's
// /api/v1/automations/* routes. Read routes need prospects:read, writes
// prospects:write, both plus the workspace Pipeline (manage) permission for
// JWT callers. Workflows execute as their recorded author (for an API key:
// the key's owning member), re-checked on every run.
//
// Deliberately NOT here: /automations/cron/process (CRON_SECRET worker) and
// /automations/:id/webhook-token/rotate (returns a plaintext credential).

const BASE = "/api/v1/automations";
const NO_RETRY = { maxRetries: 0 };
// POST /:id/run executes the workflow inline (route maxDuration = 120s).
// Never retry: a retry would fire every action a second time.
const RUN_CONFIG = { timeoutMs: 125_000, maxRetries: 0 };

const seg = (id: string) => encodeURIComponent(id);

function send(
  token: string,
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
  config?: { maxRetries?: number; timeoutMs?: number },
): Promise<Response> {
  return fetchWithRetry(
    apiUrl(`${BASE}${path}`),
    {
      method,
      headers: authHeaders(token),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    },
    config,
  );
}

export function listAutomations(token: string): Promise<Response> {
  return fetchWithRetry(apiUrl(BASE), { headers: authHeaders(token) });
}

export function getAutomation(token: string, id: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`${BASE}/${seg(id)}`), { headers: authHeaders(token) });
}

export function createAutomation(token: string, body: Record<string, unknown>) {
  return send(token, "POST", "", body, NO_RETRY);
}

export function updateAutomation(token: string, id: string, body: Record<string, unknown>) {
  return send(token, "PATCH", `/${seg(id)}`, body);
}

export function deleteAutomation(token: string, id: string) {
  return send(token, "DELETE", `/${seg(id)}`);
}

export function saveDraft(token: string, id: string, body: Record<string, unknown>) {
  return send(token, "PUT", `/${seg(id)}/draft`, body);
}

export function discardDraft(token: string, id: string) {
  return send(token, "DELETE", `/${seg(id)}/draft`);
}

export function activateAutomation(token: string, id: string) {
  return send(token, "POST", `/${seg(id)}/activate`, {}, NO_RETRY);
}

export function deactivateAutomation(token: string, id: string) {
  return send(token, "POST", `/${seg(id)}/deactivate`, {});
}

export function resumeAutomation(token: string, id: string) {
  return send(token, "POST", `/${seg(id)}/resume`, {});
}

export function runAutomation(token: string, id: string, body: Record<string, unknown>) {
  return send(token, "POST", `/${seg(id)}/run`, body, RUN_CONFIG);
}

export function listRuns(token: string, id: string, params: Record<string, unknown>) {
  return fetchWithRetry(apiUrl(`${BASE}/${seg(id)}/runs${buildQuery(params)}`), {
    headers: authHeaders(token),
  });
}

export function listVersions(token: string, id: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`${BASE}/${seg(id)}/versions`), { headers: authHeaders(token) });
}

export function getRun(token: string, runId: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`${BASE}/runs/${seg(runId)}`), { headers: authHeaders(token) });
}

export function cancelRun(token: string, runId: string) {
  return send(token, "POST", `/runs/${seg(runId)}/cancel`, {});
}

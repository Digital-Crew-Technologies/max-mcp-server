import { apiUrl, authHeaders, buildQuery, fetchWithRetry } from "../shared";

// Pipeline webhook triggers (inbound lead-capture endpoints) and their routing
// branches, via max-agent's /api/v1/pipeline/webhooks/* and
// /api/v1/pipeline/webhook-routes/* routes (scopes prospects:read / :write).
//
// The /api/v1/webhooks/outbound/* routes are deliberately NOT wrapped: every
// handler there calls requireWorkspaceAdmin(gate) without { allowApiKey: true },
// so a workspace API key is always refused with 403.
//
// NO_RETRY: calls whose response carries a one-time secret (a retry after a lost
// response would hand back null or a different secret) and calls that can create
// or move prospects (a retry could ingest the same payload twice).
const NO_RETRY = { maxRetries: 0 };

const WEBHOOKS = "/api/v1/pipeline/webhooks";
const ROUTES = "/api/v1/pipeline/webhook-routes";

function webhookPath(webhookId: string): string {
  return `${WEBHOOKS}/${encodeURIComponent(webhookId)}`;
}

// ── Webhook endpoints ──────────────────────────────────────────────────────

export async function listPipelineWebhooks(token: string): Promise<Response> {
  return fetchWithRetry(apiUrl(WEBHOOKS), { headers: authHeaders(token) });
}

export async function getPipelineWebhook(
  token: string,
  webhookId: string,
): Promise<Response> {
  return fetchWithRetry(apiUrl(webhookPath(webhookId)), {
    headers: authHeaders(token),
  });
}

export async function createPipelineWebhook(
  token: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(
    apiUrl(WEBHOOKS),
    { method: "POST", headers: authHeaders(token), body: JSON.stringify(body) },
    NO_RETRY,
  );
}

export async function updatePipelineWebhook(
  token: string,
  webhookId: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(
    apiUrl(webhookPath(webhookId)),
    { method: "PATCH", headers: authHeaders(token), body: JSON.stringify(body) },
    NO_RETRY,
  );
}

export async function deletePipelineWebhook(
  token: string,
  webhookId: string,
): Promise<Response> {
  return fetchWithRetry(apiUrl(webhookPath(webhookId)), {
    method: "DELETE",
    headers: authHeaders(token),
  });
}

export async function rotatePipelineWebhook(
  token: string,
  webhookId: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(
    apiUrl(`${webhookPath(webhookId)}/rotate`),
    { method: "POST", headers: authHeaders(token), body: JSON.stringify(body) },
    NO_RETRY,
  );
}

export async function testPipelineWebhook(
  token: string,
  webhookId: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(
    apiUrl(`${webhookPath(webhookId)}/test`),
    { method: "POST", headers: authHeaders(token), body: JSON.stringify(body) },
    NO_RETRY,
  );
}

export async function listPipelineWebhookDeliveries(
  token: string,
  webhookId: string,
  params: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(
    apiUrl(`${webhookPath(webhookId)}/deliveries${buildQuery(params)}`),
    { headers: authHeaders(token) },
  );
}

export async function replayPipelineWebhookDelivery(
  token: string,
  webhookId: string,
  deliveryId: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(
    apiUrl(
      `${webhookPath(webhookId)}/deliveries/${encodeURIComponent(deliveryId)}/replay`,
    ),
    { method: "POST", headers: authHeaders(token), body: JSON.stringify(body) },
    NO_RETRY,
  );
}

// ── Routing branches ───────────────────────────────────────────────────────

export async function listPipelineWebhookRoutes(
  token: string,
  params: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(apiUrl(`${ROUTES}${buildQuery(params)}`), {
    headers: authHeaders(token),
  });
}

export async function createPipelineWebhookRoute(
  token: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(apiUrl(ROUTES), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

export async function reorderPipelineWebhookRoutes(
  token: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(apiUrl(ROUTES), {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

export async function updatePipelineWebhookRoute(
  token: string,
  routeId: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(apiUrl(`${ROUTES}/${encodeURIComponent(routeId)}`), {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

export async function deletePipelineWebhookRoute(
  token: string,
  routeId: string,
): Promise<Response> {
  return fetchWithRetry(apiUrl(`${ROUTES}/${encodeURIComponent(routeId)}`), {
    method: "DELETE",
    headers: authHeaders(token),
  });
}

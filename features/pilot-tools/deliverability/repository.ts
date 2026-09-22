import { apiUrl, authHeaders, buildQuery, fetchWithRetry } from "../shared";

// Deliverability + done-for-you mailbox infrastructure (Mailpool) via
// max-agent's /deliverability, /warmup and /mailpool routes. max-agent holds
// the Mailpool key and narrows every supplier read to the caller's workspace.
//
// Three calls SPEND REAL MONEY (accounts:purchase scope) and max-agent accepts
// no idempotency key for any of them, so they never retry: a replay after a
// lost response could buy the same domains/mailboxes or warm-up day twice.
// Order placement registers domains synchronously, hence the long timeout.
type RetryConfig = Parameters<typeof fetchWithRetry>[2];

const PURCHASE_CONFIG: RetryConfig = { timeoutMs: 290_000, maxRetries: 0 };
// Live Mailpool reads fan out (one detail call per warming inbox).
const MAILPOOL_READ_CONFIG: RetryConfig = { timeoutMs: 60_000 };

function get(
  token: string,
  path: string,
  query: Record<string, unknown> = {},
  config?: RetryConfig,
): Promise<Response> {
  return fetchWithRetry(apiUrl(`${path}${buildQuery(query)}`), { headers: authHeaders(token) }, config);
}

function send(
  token: string,
  method: "POST" | "PATCH",
  path: string,
  body?: Record<string, unknown>,
  config?: RetryConfig,
): Promise<Response> {
  return fetchWithRetry(
    apiUrl(path),
    {
      method,
      headers: authHeaders(token),
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
    config,
  );
}

// ── Deliverability (read-only, live from Mailpool) ──────────────────────────
export const listInboxPlacements = (token: string, query: Record<string, unknown>) =>
  get(token, `/api/v1/deliverability/inbox-placements`, query, MAILPOOL_READ_CONFIG);
export const getInboxPlacement = (token: string, id: string) =>
  get(token, `/api/v1/deliverability/inbox-placements/${encodeURIComponent(id)}`, {}, MAILPOOL_READ_CONFIG);
export const getWarmupDeliverability = (token: string) =>
  get(token, `/api/v1/deliverability/warmup`, {}, MAILPOOL_READ_CONFIG);

// ── Warm-up ─────────────────────────────────────────────────────────────────
export const listWarmups = (token: string) => get(token, `/api/v1/warmup`, {}, MAILPOOL_READ_CONFIG);
export const getWarmupPricing = (token: string) => get(token, `/api/v1/warmup/pricing`);
export const startWarmup = (token: string, body: Record<string, unknown>) =>
  send(token, "POST", `/api/v1/warmup`, body, PURCHASE_CONFIG);
export const updateWarmup = (token: string, id: string, body: Record<string, unknown>) =>
  send(token, "PATCH", `/api/v1/warmup/${id}`, body);
export const cancelWarmup = (token: string, id: string) =>
  send(token, "POST", `/api/v1/warmup/${id}/cancel`);
export const resumeWarmup = (token: string, id: string) =>
  send(token, "POST", `/api/v1/warmup/${id}/resume`, undefined, PURCHASE_CONFIG);
export const syncWarmup = (token: string, id: string) =>
  send(token, "POST", `/api/v1/warmup/${id}/sync`, undefined, MAILPOOL_READ_CONFIG);
export const syncAllWarmups = (token: string) =>
  send(token, "POST", `/api/v1/warmup/sync`, undefined, MAILPOOL_READ_CONFIG);

// ── Mailpool (done-for-you domains + mailboxes) ─────────────────────────────
export const listMailpoolDomains = (token: string) =>
  get(token, `/api/v1/mailpool/domains`, {}, MAILPOOL_READ_CONFIG);
export const searchMailpoolDomains = (token: string, body: Record<string, unknown>) =>
  send(token, "POST", `/api/v1/mailpool/domains/search`, body, MAILPOOL_READ_CONFIG);
export const getMailpoolPricing = (token: string) => get(token, `/api/v1/mailpool/pricing`);
export const listMailpoolOrders = (token: string) => get(token, `/api/v1/mailpool/orders`);
export const createMailpoolOrder = (token: string, body: Record<string, unknown>) =>
  send(token, "POST", `/api/v1/mailpool/orders`, body, PURCHASE_CONFIG);
export const syncMailpoolOrder = (token: string, id: string) =>
  send(token, "POST", `/api/v1/mailpool/orders/${id}/sync`, undefined, MAILPOOL_READ_CONFIG);

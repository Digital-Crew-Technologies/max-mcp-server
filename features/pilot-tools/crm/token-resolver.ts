// Per-workspace HubSpot access-token resolver.
//
// max-agent owns the per-workspace HubSpot OAuth token (auto-refreshing). This
// resolver fetches the CALLING workspace's current token via
//   GET /api/v1/crm/access-token   (Authorization: Bearer <maxBearer>)
// and caches it per-bearer (multi-tenancy: NEVER a single global slot) until
// just before it expires.
// ⚠️ Server-only.

import { createHash } from "node:crypto";
import { apiUrl, authHeaders, fetchWithRetry, responseBodyText } from "../shared";

type CacheEntry = { access_token: string; expires_at_ms: number };

const CACHE_MAX = 256;
const EXPIRY_BUFFER_MS = 30_000;

// Per-process LRU keyed by SHA-256(maxBearer). Map preserves insertion order;
// we re-insert on hit to make it recency-ordered, evict oldest when over cap.
const cache = new Map<string, CacheEntry>();

function keyFor(maxBearer: string): string {
  return createHash("sha256").update(maxBearer).digest("hex");
}

function setEntry(key: string, entry: CacheEntry): void {
  // Move-to-end semantics: delete then set so insertion order tracks recency.
  cache.delete(key);
  cache.set(key, entry);
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

/**
 * Resolve the workspace's current HubSpot access token. Caches per-bearer
 * until expires_at_ms - 30s. Throws:
 *   - "HUBSPOT_NOT_CONNECTED"            when max-agent returns 404
 *   - "HUBSPOT_TOKEN_FETCH_FAILED: ..."  on 5xx / network failure
 */
export async function getHubSpotAccessToken(maxBearer: string): Promise<string> {
  const key = keyFor(maxBearer);
  const now = Date.now();

  const cached = cache.get(key);
  if (cached && cached.expires_at_ms - EXPIRY_BUFFER_MS > now) {
    // Refresh recency.
    setEntry(key, cached);
    return cached.access_token;
  }

  let res: Response;
  try {
    res = await fetchWithRetry(apiUrl("/api/v1/crm/access-token"), {
      method: "GET",
      headers: authHeaders(maxBearer),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`HUBSPOT_TOKEN_FETCH_FAILED: ${msg}`);
  }

  if (res.status === 404) {
    throw new Error("HUBSPOT_NOT_CONNECTED");
  }
  if (res.status >= 500) {
    const body = await responseBodyText(res);
    throw new Error(`HUBSPOT_TOKEN_FETCH_FAILED: ${res.status} ${body || res.statusText}`);
  }
  if (!res.ok) {
    const body = await responseBodyText(res);
    throw new Error(`HUBSPOT_TOKEN_FETCH_FAILED: ${res.status} ${body || res.statusText}`);
  }

  const body = await responseBodyText(res);
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error(`HUBSPOT_TOKEN_FETCH_FAILED: invalid JSON from access-token endpoint`);
  }

  const data = (parsed as { data?: { access_token?: unknown; expires_at?: unknown } })?.data;
  const accessToken = typeof data?.access_token === "string" ? data.access_token : null;
  if (!accessToken) {
    throw new Error("HUBSPOT_TOKEN_FETCH_FAILED: no access_token in response");
  }

  const expiresAtRaw = data?.expires_at;
  const expiresAtMs =
    typeof expiresAtRaw === "string" && !Number.isNaN(Date.parse(expiresAtRaw))
      ? Date.parse(expiresAtRaw)
      : now + 5 * 60_000; // conservative 5-min TTL if upstream omits expiry

  setEntry(key, { access_token: accessToken, expires_at_ms: expiresAtMs });
  return accessToken;
}

/**
 * Evict one bearer's cached token. Call after a HubSpot 401 so the next call
 * re-fetches a fresh token from max-agent.
 */
export function invalidateHubSpotToken(maxBearer: string): void {
  cache.delete(keyFor(maxBearer));
}

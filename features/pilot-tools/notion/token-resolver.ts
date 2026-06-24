// Per-workspace Notion access-token resolver.
//
// max-agent owns the per-workspace Notion OAuth token. This resolver fetches the
// CALLING workspace's current token via
//   GET /api/v1/notion/access-token   (Authorization: Bearer <maxBearer>)
// and caches it per-bearer (multi-tenancy: NEVER a single global slot).
//
// Notion tokens don't expire (the upstream returns expires_at = null), so we
// cache them with a long TTL (1 hour) keyed per bearer; a bearer rotation or
// re-connect naturally refreshes via the cache miss. Mirrors the HubSpot
// token-resolver (crm/token-resolver.ts) but for Notion.
// ⚠️ Server-only.

import { createHash } from "node:crypto";
import { apiUrl, authHeaders, fetchWithRetry, responseBodyText } from "../shared";

type CacheEntry = { access_token: string; expires_at_ms: number };

const CACHE_MAX = 256;
const EXPIRY_BUFFER_MS = 30_000;
// Notion tokens don't expire; cache for an hour so a re-connect is picked up
// within a bounded window without re-hitting max-agent on every call.
const NOTION_DEFAULT_TTL_MS = 60 * 60_000;

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
 * Resolve the workspace's current Notion access token. Caches per-bearer for
 * up to 1h (Notion tokens don't expire). Throws:
 *   - "NOTION_NOT_CONNECTED"            when max-agent returns 404
 *   - "NOTION_TOKEN_FETCH_FAILED: ..."  on 5xx / other non-2xx / network failure
 */
export async function getNotionAccessToken(maxBearer: string): Promise<string> {
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
    res = await fetchWithRetry(apiUrl("/api/v1/notion/access-token"), {
      method: "GET",
      headers: authHeaders(maxBearer),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`NOTION_TOKEN_FETCH_FAILED: ${msg}`);
  }

  if (res.status === 404) {
    throw new Error("NOTION_NOT_CONNECTED");
  }
  if (res.status >= 500) {
    const body = await responseBodyText(res);
    throw new Error(`NOTION_TOKEN_FETCH_FAILED: ${res.status} ${body || res.statusText}`);
  }
  if (!res.ok) {
    const body = await responseBodyText(res);
    throw new Error(`NOTION_TOKEN_FETCH_FAILED: ${res.status} ${body || res.statusText}`);
  }

  const body = await responseBodyText(res);
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error("NOTION_TOKEN_FETCH_FAILED: invalid JSON from access-token endpoint");
  }

  const data = (parsed as { data?: { access_token?: unknown; expires_at?: unknown } })?.data;
  const accessToken = typeof data?.access_token === "string" ? data.access_token : null;
  if (!accessToken) {
    throw new Error("NOTION_TOKEN_FETCH_FAILED: no access_token in response");
  }

  // Notion tokens are long-lived; expires_at is typically null. Honor an
  // explicit expiry if upstream ever supplies one, else use the 1h default.
  const expiresAtRaw = data?.expires_at;
  const expiresAtMs =
    typeof expiresAtRaw === "string" && !Number.isNaN(Date.parse(expiresAtRaw))
      ? Date.parse(expiresAtRaw)
      : now + NOTION_DEFAULT_TTL_MS;

  setEntry(key, { access_token: accessToken, expires_at_ms: expiresAtMs });
  return accessToken;
}

/**
 * Evict one bearer's cached token. Call after a Notion 401 so the next call
 * re-fetches a fresh token from max-agent.
 */
export function invalidateNotionToken(maxBearer: string): void {
  cache.delete(keyFor(maxBearer));
}

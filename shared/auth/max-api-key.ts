// Admits a workspace's Max API key (`max_live_…`) at the MCP gateway.
//
// WHY: max-agent hands every workspace a ready-made MCP client config whose
// only credential is the workspace's "Max MCP" API key, sent as
// `Authorization: Bearer max_live_…`. Without this path the gateway only ever
// accepted `X-MCP-Gateway-Key`, so every pasted config was answered with 401
// and no external MCP client could connect.
//
// HOW: the key is validated by asking max-agent — the only service that can
// hash-match it against `api_keys` and honour revocation/expiry. Results are
// cached briefly so a chatty MCP session costs one round trip, not one per
// request.
//
// RUNTIME: this module runs inside Next.js middleware on the Edge runtime, so
// it uses only Web APIs (crypto.subtle, fetch, AbortSignal.timeout).

const KEY_PREFIX = "max_live_";
const VERIFY_PATH = "/api/v1/api-keys/verify";
const VERIFY_TIMEOUT_MS = 5_000;

/** Valid keys are re-checked every 5 min so a revocation takes effect quickly. */
const TTL_VALID_MS = 5 * 60_000;
/** Rejections are cached briefly to blunt brute-force probing of the gateway. */
const TTL_INVALID_MS = 30_000;
/** Bound the map so a flood of junk keys can't grow it without limit. */
const MAX_ENTRIES = 1_000;

type CacheEntry = { valid: boolean; expiresAt: number };

// Keyed by SHA-256 of the token: the cache outlives the request, and raw
// credentials should not sit in a long-lived module-level map.
const cache = new Map<string, CacheEntry>();

const encoder = new TextEncoder();

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(token));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function readCache(key: string, now: number): boolean | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (hit.expiresAt <= now) {
    cache.delete(key);
    return undefined;
  }
  return hit.valid;
}

function writeCache(key: string, valid: boolean, now: number): void {
  if (cache.size >= MAX_ENTRIES) {
    for (const [k, entry] of cache) {
      if (entry.expiresAt <= now) cache.delete(k);
    }
    // Still full of live entries — drop the oldest insertion to make room.
    if (cache.size >= MAX_ENTRIES) {
      const oldest = cache.keys().next();
      if (!oldest.done) cache.delete(oldest.value);
    }
  }
  cache.set(key, {
    valid,
    expiresAt: now + (valid ? TTL_VALID_MS : TTL_INVALID_MS),
  });
}

/** Test seam: drop all memoised verdicts. */
export function resetMaxApiKeyCache(): void {
  cache.clear();
}

/** Bearer tokens that are shaped like a Max API key (cheap pre-filter). */
export function looksLikeMaxApiKey(token: string): boolean {
  return token.startsWith(KEY_PREFIX) && token.length > KEY_PREFIX.length;
}

/** The bearer token on this request, or undefined when there isn't one. */
export function readBearerToken(headers: Headers): string | undefined {
  const header = headers.get("authorization")?.trim();
  if (!header?.toLowerCase().startsWith("bearer ")) return undefined;
  return header.slice(7).trim() || undefined;
}

/** True when max-agent is reachable enough for API-key admission to work. */
export function isMaxApiKeyAuthConfigured(): boolean {
  return !!process.env.DIGITALCREW_API_BASE_URL?.trim();
}

/**
 * Ask max-agent whether this key is live. Fails CLOSED: a timeout, a network
 * error or a 5xx returns false and is NOT cached, so the gate stays shut while
 * max-agent is down but recovers on the next request rather than 30s later.
 */
export async function verifyMaxApiKey(token: string): Promise<boolean> {
  const base = process.env.DIGITALCREW_API_BASE_URL?.trim();
  if (!base) return false;

  const cacheKey = await hashToken(token);
  const now = Date.now();
  const cached = readCache(cacheKey, now);
  if (cached !== undefined) return cached;

  const url = `${base.replace(/\/$/, "")}${VERIFY_PATH}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    });
  } catch (err) {
    console.error(
      "[max-api-key] verification request to max-agent failed:",
      err instanceof Error ? err.message : err,
    );
    return false;
  }

  if (res.ok) {
    writeCache(cacheKey, true, now);
    return true;
  }

  // 401/403 is a real verdict about the key; anything else is max-agent's
  // problem and must not be memoised as "this key is bad".
  if (res.status === 401 || res.status === 403) {
    writeCache(cacheKey, false, now);
    return false;
  }

  console.error(
    `[max-api-key] unexpected ${res.status} from max-agent ${VERIFY_PATH}`,
  );
  return false;
}

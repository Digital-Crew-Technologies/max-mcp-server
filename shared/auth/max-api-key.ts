// Admits a workspace's Max API key (`max_live_…`) at the MCP gateway.
//
// WHY: max-agent hands every workspace a ready-made MCP client config whose
// only credential is the workspace's "Max MCP" API key, sent as
// `Authorization: Bearer max_live_…`. Without this path the gateway only ever
// accepted `X-MCP-Gateway-Key`, so every pasted config was answered with 401
// and no external MCP client could connect.
//
// THREE SPELLINGS, ONE DOWNSTREAM HEADER. Besides the bearer, the key arrives:
//   - as `x-api-key: max_live_…` — Claude's "Add custom connector" dialog
//     reserves the `Authorization` header name for its own OAuth flow and greys
//     it out in the request-header picker, so a Claude app can only carry a
//     static key under a name from the picker's allowlist;
//   - as `?key=max_live_…` on the URL — ChatGPT's connector form offers OAuth
//     or "No authentication" and nothing in between, so the URL is the only
//     place a ChatGPT user can put a credential. The key shows up in request
//     logs for that path; middleware strips it before the route handler runs.
// Middleware normalises both back to `Authorization: Bearer` before the
// request reaches the tools, so everything downstream still reads one header.
//
// HOW: the key is validated by asking max-agent — the only service that can
// hash-match it against `api_keys` and honour revocation/expiry. Results are
// cached briefly so a chatty MCP session costs one round trip, not one per
// request.
//
// "INVALID" AND "UNREACHABLE" ARE DIFFERENT ANSWERS. Only a 401/403 from
// max-agent means the key is bad. A timeout, network error or 5xx means we
// could not ask. Both used to come back as 401, and a 401 tells an MCP client
// (Claude's connectors, ChatGPT) that the credential is dead: it drops the
// server's tools mid-conversation ("the Max connector disconnected"). A cold
// start or a slow deploy of max-agent took every open session down with it.
// Now an unreachable max-agent is reported as such — the middleware answers
// 503, which clients retry — and a key that verified recently keeps working
// through the blip. That grace cannot outlive a revocation for long: every
// tool call forwards the key to max-agent, which authenticates it again.
//
// RUNTIME: this module runs inside Next.js middleware on the Edge runtime, so
// it uses only Web APIs (crypto.subtle, fetch, AbortSignal.timeout).

const KEY_PREFIX = "max_live_";
const VERIFY_PATH = "/api/v1/api-keys/verify";
const VERIFY_TIMEOUT_MS = 5_000;

/** Valid keys are re-checked every 5 min so a revocation takes effect quickly. */
const TTL_VALID_MS = 5 * 60_000;
/**
 * How long a key that max-agent last confirmed keeps being admitted while
 * max-agent cannot be reached to re-check it.
 */
const STALE_GRACE_MS = 60 * 60_000;
/** Rejections are cached briefly to blunt brute-force probing of the gateway. */
const TTL_INVALID_MS = 30_000;
/** Bound the map so a flood of junk keys can't grow it without limit. */
const MAX_ENTRIES = 1_000;

type CacheEntry = { valid: boolean; expiresAt: number };

// Keyed by SHA-256 of the token: the cache outlives the request, and raw
// credentials should not sit in a long-lived module-level map.
const cache = new Map<string, CacheEntry>();
/** When max-agent last confirmed each key — the basis for STALE_GRACE_MS. */
const lastConfirmed = new Map<string, number>();

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

function rememberConfirmed(key: string, now: number): void {
  lastConfirmed.delete(key);
  lastConfirmed.set(key, now);
  while (lastConfirmed.size > MAX_ENTRIES) {
    const oldest = lastConfirmed.keys().next();
    if (oldest.done) break;
    lastConfirmed.delete(oldest.value);
  }
}

/** Test seam: drop all memoised verdicts. */
export function resetMaxApiKeyCache(): void {
  cache.clear();
  lastConfirmed.clear();
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

/** Header Claude's connector dialog lets a user attach a static key under. */
export const API_KEY_HEADER = "x-api-key";

/** Query parameter a ChatGPT user can carry the key in: `/mcp?key=max_live_…`. */
export const API_KEY_QUERY_PARAM = "key";

/**
 * The Max API key carried on the URL, or undefined. Only ever consulted after
 * the header forms, and only on paths that admit API keys at all.
 */
export function readMaxApiKeyFromUrl(
  searchParams: URLSearchParams,
): string | undefined {
  const raw = searchParams.get(API_KEY_QUERY_PARAM)?.trim();
  return raw && looksLikeMaxApiKey(raw) ? raw : undefined;
}

/**
 * The Max API key presented on this request, whichever header carries it:
 * `Authorization: Bearer max_live_…` (config-file clients, Claude Code, the
 * Anthropic API) or `x-api-key: max_live_…` (Claude's connector dialog). A
 * pasted "Bearer " prefix on `x-api-key` is tolerated — people copy the whole
 * value — but the raw key is the documented form.
 */
export function readMaxApiKey(headers: Headers): string | undefined {
  const bearer = readBearerToken(headers);
  if (bearer && looksLikeMaxApiKey(bearer)) return bearer;

  const raw = headers.get(API_KEY_HEADER)?.trim();
  if (!raw) return undefined;
  const key = raw.toLowerCase().startsWith("bearer ")
    ? raw.slice(7).trim()
    : raw;
  return looksLikeMaxApiKey(key) ? key : undefined;
}

/** True when max-agent is reachable enough for API-key admission to work. */
export function isMaxApiKeyAuthConfigured(): boolean {
  return !!process.env.DIGITALCREW_API_BASE_URL?.trim();
}

/**
 * - `valid`: max-agent confirmed the key (now, or recently enough to ride out
 *   an outage — see STALE_GRACE_MS).
 * - `invalid`: max-agent refused it (401/403). The only verdict that should
 *   reach a client as 401.
 * - `unavailable`: max-agent could not be asked (timeout, network error, 5xx)
 *   and the key has no recent confirmation. Not cached, so the next request
 *   asks again.
 */
export type MaxApiKeyVerdict = "valid" | "invalid" | "unavailable";

/** Ask max-agent whether this key is live. */
export async function checkMaxApiKey(token: string): Promise<MaxApiKeyVerdict> {
  const base = process.env.DIGITALCREW_API_BASE_URL?.trim();
  if (!base) return "unavailable";

  const cacheKey = await hashToken(token);
  const now = Date.now();
  const cached = readCache(cacheKey, now);
  if (cached !== undefined) return cached ? "valid" : "invalid";

  const unreachable = (): MaxApiKeyVerdict => {
    const confirmedAt = lastConfirmed.get(cacheKey);
    return confirmedAt !== undefined && now - confirmedAt <= STALE_GRACE_MS
      ? "valid"
      : "unavailable";
  };

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
    return unreachable();
  }

  if (res.ok) {
    writeCache(cacheKey, true, now);
    rememberConfirmed(cacheKey, now);
    return "valid";
  }

  // 401/403 is a real verdict about the key; anything else is max-agent's
  // problem and must not be memoised as "this key is bad".
  if (res.status === 401 || res.status === 403) {
    writeCache(cacheKey, false, now);
    lastConfirmed.delete(cacheKey);
    return "invalid";
  }

  console.error(
    `[max-api-key] unexpected ${res.status} from max-agent ${VERIFY_PATH}`,
  );
  return unreachable();
}

/**
 * Boolean form of checkMaxApiKey: true only for `valid`. Fails closed — an
 * unreachable max-agent with no recent confirmation of this key is `false`.
 */
export async function verifyMaxApiKey(token: string): Promise<boolean> {
  return (await checkMaxApiKey(token)) === "valid";
}

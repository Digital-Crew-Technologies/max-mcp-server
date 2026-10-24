// APP_ENV and the production-host guard.
//
// A staging or preprod deployment must never talk to production. If a variable
// is missing outside production, code that falls back to a production URL would
// silently call prod. This module makes that impossible:
//   - at startup, assertNoProductionHostsInEnv() refuses any environment
//     variable that names a production host;
//   - before every outgoing call, installProductionHostGuard() makes fetch()
//     refuse a production host, including one reached through a redirect.
// Both are no-ops when APP_ENV is production (the default), so production is
// unchanged.
//
// Copied from digitalcrew-orchestrator lib/env/app-env.ts (STG-02.2a). The two
// functions are called from instrumentation.ts (STG-02.3i).

export const APP_ENVS = ["production", "preprod", "staging"] as const;
export type AppEnv = (typeof APP_ENVS)[number];

export const PRODUCTION_APEX = "digitalcrew.tech";

type Env = Record<string, string | undefined>;

export class ProductionHostError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductionHostError";
  }
}

/** APP_ENV, defaulting to production. An unknown value is an error, not a silent default. */
export function appEnv(env: Env = process.env): AppEnv {
  const raw = env.APP_ENV?.trim().toLowerCase();
  if (!raw) return "production";
  if ((APP_ENVS as readonly string[]).includes(raw)) return raw as AppEnv;
  throw new Error(`APP_ENV must be one of ${APP_ENVS.join(", ")}; got "${env.APP_ENV}".`);
}

/** True for digitalcrew.tech and every *.digitalcrew.tech host. */
export function isProductionHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/^\*?\./, "").replace(/\.$/, "");
  return host === PRODUCTION_APEX || host.endsWith(`.${PRODUCTION_APEX}`);
}

function hostOf(url: string | URL): string | null {
  try {
    return new URL(String(url)).hostname;
  } catch {
    return null;
  }
}

/** Throws a ProductionHostError when a non-production app targets a production host. */
export function assertAllowedHost(url: string | URL, env: Env = process.env): void {
  const current = appEnv(env);
  if (current === "production") return;
  const host = hostOf(url);
  if (host && isProductionHost(host)) {
    throw new ProductionHostError(
      `Refusing a call to the production host "${host}" with APP_ENV=${current}. ` +
        "Set the matching variable to a non-production URL.",
    );
  }
}

// Hosts named in one variable value: URLs, bare hosts, cookie domains and
// comma-separated lists. Email addresses are not hosts the app calls.
function hostsIn(value: string): string[] {
  return value
    .split(/[\s,;]+/)
    .filter(Boolean)
    .flatMap((token) => {
      if (token.includes("://")) {
        const host = hostOf(token);
        return host ? [host] : [];
      }
      if (token.includes("@")) return [];
      return [token.split(/[/:?#]/)[0]];
    });
}

// npm_* variables are package.json metadata injected by pnpm/npm (for example
// npm_package_homepage), not configuration the server calls.
function isConfigVariable(name: string): boolean {
  return name !== "APP_ENV" && !name.startsWith("npm_");
}

/** Names of the variables that point to a production host. */
export function productionHostVariables(env: Env = process.env): string[] {
  return Object.entries(env)
    .filter(([name, value]) => isConfigVariable(name) && typeof value === "string" && value.length > 0)
    .filter(([, value]) => hostsIn(value as string).some(isProductionHost))
    .map(([name]) => name)
    .sort();
}

/** Startup check: refuses to run outside production with any production host in the environment. */
export function assertNoProductionHostsInEnv(env: Env = process.env): void {
  const current = appEnv(env);
  if (current === "production") return;
  const names = productionHostVariables(env);
  if (names.length > 0) {
    throw new ProductionHostError(
      `APP_ENV=${current} but these variables point to a production host (*.${PRODUCTION_APEX}): ` +
        `${names.join(", ")}. Set them to non-production URLs.`,
    );
  }
}

type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = NonNullable<Parameters<typeof fetch>[1]>;

function requestUrl(input: FetchInput): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

const GUARDED = Symbol.for("digitalcrew.productionHostGuard");
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 20;
const BODY_HEADERS = ["content-type", "content-length", "content-encoding", "content-language", "content-location"];
const CREDENTIAL_HEADERS = ["authorization", "cookie", "proxy-authorization"];

// fetch() follows redirects on its own, so a guard on the first URL alone lets a
// 3xx to a production host through. This follows them by hand, checking every
// hop, the way the Fetch spec does: 303 (and 301/302 after a POST) becomes a GET
// without a body, and a cross-origin hop drops the credential headers.
async function fetchCheckingRedirects(
  original: typeof fetch,
  input: FetchInput,
  init: FetchInit | undefined,
  env: Env,
): Promise<Response> {
  const request = input instanceof Request ? input : null;
  // A Request body can be read only once: keep a copy for 307/308.
  const replay = request?.body && init?.body === undefined ? request.clone() : null;
  let response = await original(input, { ...init, redirect: "manual" });
  let url = requestUrl(input);
  let method = (init?.method ?? request?.method ?? "GET").toUpperCase();
  let body = init?.body;
  const headers = new Headers(init?.headers ?? request?.headers);
  for (let hops = 0; REDIRECT_STATUSES.has(response.status); hops++) {
    const location = response.headers.get("location");
    if (!location) return response;
    await response.body?.cancel();
    if (hops >= MAX_REDIRECTS) throw new TypeError(`fetch failed: more than ${MAX_REDIRECTS} redirects`);
    const next = new URL(location, url);
    assertAllowedHost(next, env);
    if (response.status === 303 ? method !== "HEAD" : response.status <= 302 && method === "POST") {
      method = "GET";
      body = undefined;
      for (const name of BODY_HEADERS) headers.delete(name);
    } else if (body === undefined && replay) {
      body = await replay.arrayBuffer();
    }
    if (new URL(url).origin !== next.origin) for (const name of CREDENTIAL_HEADERS) headers.delete(name);
    url = next.href;
    response = await original(url, { ...init, method, headers, body, signal: init?.signal ?? request?.signal, redirect: "manual" });
  }
  return response;
}

/**
 * Wraps globalThis.fetch so that every outgoing call, and every redirect it
 * follows, goes through assertAllowedHost().
 */
export function installProductionHostGuard(env: Env = process.env): void {
  if (appEnv(env) === "production") return;
  const original = globalThis.fetch as typeof fetch & { [GUARDED]?: true };
  if (original[GUARDED]) return;
  const guarded = async (input: FetchInput, init?: FetchInit) => {
    assertAllowedHost(requestUrl(input), env);
    const redirect = init?.redirect ?? (input instanceof Request ? input.redirect : "follow");
    // "manual" and "error" never leave the first host: nothing more to check.
    if (redirect !== "follow") return original(input, init);
    return fetchCheckingRedirects(original, input, init, env);
  };
  // Keep the markers other wrappers (such as Next.js) set on fetch.
  Object.assign(guarded, original, { [GUARDED]: true });
  globalThis.fetch = guarded as typeof fetch;
}

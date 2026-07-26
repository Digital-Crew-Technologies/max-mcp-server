// Gateway authentication for MCP and chat endpoints.
//
// WHY: app/mcp/route.ts exposes ~100 powerful tools with no inbound auth.
// This middleware puts a gate in front of /mcp and /chat.
// (OWASP API2:2023 — Broken Authentication.)
//
// TWO WAYS THROUGH THE GATE:
//   1. Service callers (max-agent, hub, Hermes) present the shared secret in
//      `X-MCP-Gateway-Key` — unchanged.
//   2. End users on /mcp only: a Max API key (`max_live_…`) in
//      `Authorization` is accepted as the sole credential. It's verified
//      against max-agent (which also enforces workspace scoping on every
//      relayed tool call), so a user's MCP client needs exactly one secret —
//      the key auto-provisioned when their Max account was created. /chat
//      remains shared-secret only.
//
// RUNTIME: On Vercel this runs on the Edge runtime, so we use Web Crypto
// (crypto.subtle) — node:crypto.timingSafeEqual is NOT available on Edge.
//
// HEADER: services present the secret in `X-MCP-Gateway-Key` — NOT
// `Authorization`, which is reserved for the upstream max-agent token flow.
//
// TRUST BOUNDARIES: MCP_GATEWAY_SECRET (this gate) and DIGITALCREW_API_TOKEN
// (upstream credential) are DIFFERENT secrets — never reuse one for the other.

import { NextResponse, type NextRequest } from "next/server";
import {
  RAW_HERMES_CALLER_HEADER,
  VERIFIED_HERMES_CALLER_HEADER,
  verifyHermesCaller,
  HermesCallerError,
} from "@/shared/auth/hermes-caller";

export const config = {
  matcher: ["/mcp", "/mcp/:path*", "/chat", "/chat/:path*"],
};

const encoder = new TextEncoder();

async function sha256(input: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(input));
  return new Uint8Array(digest);
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function secretMatches(provided: string, expected: string): Promise<boolean> {
  const [p, e] = await Promise.all([sha256(provided), sha256(expected)]);
  return constantTimeEqual(p, e);
}

function deny(message: string, status: number): NextResponse {
  return NextResponse.json(
    { jsonrpc: "2.0", error: { code: -32001, message }, id: null },
    { status },
  );
}

// ── Max API key gate (end-user path, /mcp only) ─────────────────────────────
//
// A `max_live_…` bearer is verified by calling max-agent's
// GET /api/v1/workspace with it (any 2xx = valid key with workspace:read).
// Verdicts are cached in-memory per Edge isolate, keyed by the key's SHA-256,
// so steady-state MCP traffic costs zero upstream round-trips. The cache is
// only a latency optimization: even a stale "ok" is harmless, because every
// relayed tool call re-authenticates the same key against max-agent anyway.

const MAX_API_KEY_PREFIX = "max_live_";
const KEY_VERDICT_OK_MS = 5 * 60_000;
const KEY_VERDICT_BAD_MS = 30_000;
const KEY_CACHE_MAX = 1_000;
const keyVerdicts = new Map<string, { ok: boolean; exp: number }>();

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function verifyMaxApiKey(bearer: string): Promise<boolean> {
  const base = process.env.DIGITALCREW_API_BASE_URL?.trim();
  if (!base) return false;

  const id = toHex(await sha256(bearer));
  const now = Date.now();
  const hit = keyVerdicts.get(id);
  if (hit && hit.exp > now) return hit.ok;

  let ok = false;
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/api/v1/workspace`, {
      headers: { Authorization: `Bearer ${bearer}` },
      signal: AbortSignal.timeout(5_000),
    });
    ok = res.ok;
  } catch {
    ok = false; // upstream unreachable → fail closed
  }

  if (keyVerdicts.size >= KEY_CACHE_MAX) {
    for (const [k, v] of keyVerdicts) {
      if (v.exp <= now) keyVerdicts.delete(k);
    }
    // Still full of live entries? Drop the oldest insertion to stay bounded.
    if (keyVerdicts.size >= KEY_CACHE_MAX) {
      const oldest = keyVerdicts.keys().next().value;
      if (oldest) keyVerdicts.delete(oldest);
    }
  }
  keyVerdicts.set(id, {
    ok,
    exp: now + (ok ? KEY_VERDICT_OK_MS : KEY_VERDICT_BAD_MS),
  });
  return ok;
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  if (req.method === "OPTIONS") return NextResponse.next();

  const expected = process.env.MCP_GATEWAY_SECRET?.trim();
  const provided = req.headers.get("x-mcp-gateway-key")?.trim();

  if (provided) {
    // Service path: a presented gateway key MUST match — never fall through
    // to the API-key path with a wrong secret.
    if (!expected) {
      return deny("MCP gateway is not configured (set MCP_GATEWAY_SECRET)", 503);
    }
    if (!(await secretMatches(provided, expected))) {
      return deny("Unauthorized: missing or invalid X-MCP-Gateway-Key", 401);
    }
  } else {
    // End-user path: /mcp accepts a valid Max API key as the sole credential.
    const isMcp =
      req.nextUrl.pathname === "/mcp" ||
      req.nextUrl.pathname.startsWith("/mcp/");
    const bearer = req.headers
      .get("authorization")
      ?.replace(/^Bearer\s+/i, "")
      .trim();
    const isMaxKey = !!bearer && bearer.startsWith(MAX_API_KEY_PREFIX);
    if (!isMcp || !isMaxKey || !(await verifyMaxApiKey(bearer!))) {
      if (!expected) {
        return deny(
          "MCP gateway is not configured (set MCP_GATEWAY_SECRET)",
          503,
        );
      }
      return deny(
        "Unauthorized: provide X-MCP-Gateway-Key, or a valid Max API key (max_live_…) as Authorization Bearer on /mcp",
        401,
      );
    }
  }

  // ── Hermes caller identity (Contract 3) ──────────────────────────────────
  // Always strip any client-supplied VERIFIED header first, so it can only ever
  // be set by us after a real signature check (prevents identity spoofing).
  const forwardHeaders = new Headers(req.headers);
  forwardHeaders.delete(VERIFIED_HERMES_CALLER_HEADER);

  const rawCaller = req.headers.get(RAW_HERMES_CALLER_HEADER)?.trim();
  if (rawCaller) {
    const callerSecret = process.env.HERMES_CALLER_SECRET?.trim();
    if (callerSecret) {
      // A present envelope MUST verify — a bad/expired one is a hard 401 (don't
      // silently drop it: the caller intended to assert an identity).
      try {
        const caller = await verifyHermesCaller(rawCaller, callerSecret, Date.now());
        forwardHeaders.set(
          VERIFIED_HERMES_CALLER_HEADER,
          JSON.stringify(caller),
        );
      } catch (err) {
        const reason = err instanceof HermesCallerError ? err.reason : "invalid";
        return deny(`Unauthorized: invalid X-Hermes-Caller (${reason})`, 401);
      }
    }
    // If HERMES_CALLER_SECRET is unset the feature is off: we can't verify, so we
    // leave the verified header stripped and continue. The envelope has no effect.
  }

  return NextResponse.next({ request: { headers: forwardHeaders } });
}

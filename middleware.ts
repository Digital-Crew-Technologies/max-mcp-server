// Gateway authentication for MCP and chat endpoints.
//
// WHY: app/mcp/route.ts exposes ~100 powerful tools with no inbound auth.
// This middleware puts a shared-secret gate in front of /mcp and /chat.
// (OWASP API2:2023 — Broken Authentication.)
//
// RUNTIME: On Vercel this runs on the Edge runtime, so we use Web Crypto
// (crypto.subtle) — node:crypto.timingSafeEqual is NOT available on Edge.
//
// HEADER: callers present the secret in `X-MCP-Gateway-Key` — NOT
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

export async function middleware(req: NextRequest): Promise<NextResponse> {
  if (req.method === "OPTIONS") return NextResponse.next();

  const expected = process.env.MCP_GATEWAY_SECRET?.trim();
  if (!expected) {
    return deny("MCP gateway is not configured (set MCP_GATEWAY_SECRET)", 503);
  }

  const provided = req.headers.get("x-mcp-gateway-key")?.trim();
  if (!provided || !(await secretMatches(provided, expected))) {
    return deny("Unauthorized: missing or invalid X-MCP-Gateway-Key", 401);
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

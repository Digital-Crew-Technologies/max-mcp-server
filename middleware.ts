// Gateway authentication for the MCP endpoint.
//
// WHY: app/mcp/route.ts exposes ~100 powerful tools (delete, send email,
// LinkedIn DMs, webhook simulation, queue draining) with NO inbound auth.
// This middleware puts a shared-secret gate in front of /mcp so only callers
// holding the secret can reach the tools. (OWASP API2:2023 — Broken
// Authentication.) /chat is hardened separately (see issue 6.2).
//
// RUNTIME: On Vercel this runs on the Edge runtime, so we use Web Crypto
// (crypto.subtle) — node:crypto.timingSafeEqual is NOT available on Edge.
//
// HEADER CHOICE: callers present the secret in a DEDICATED `X-MCP-Gateway-Key`
// header — NOT `Authorization`. The Authorization header is already used by
// the per-caller UPSTREAM token flow (shared/auth/request-context.ts ->
// resolveBearerToken), so reusing it here would collide with that mechanism.
//
// TRUST BOUNDARIES: MCP_GATEWAY_SECRET (this gate) and DIGITALCREW_API_TOKEN
// (the upstream max-agent credential) are DIFFERENT secrets — never reuse one
// for the other. A leak of one must not compromise the other.
//
// ⚠️ ROLLOUT — this gate fails CLOSED. Before this reaches production you MUST:
//   1. Set MCP_GATEWAY_SECRET in the Vercel project env (Production + Preview).
//      Generate one with:  openssl rand -base64 32
//   2. Configure every MCP client (max-agent, Claude config, etc.) to send
//      `X-MCP-Gateway-Key: <that secret>` on requests to /mcp.
// Until MCP_GATEWAY_SECRET is set, /mcp returns 503 (a misconfig must never
// silently disable the gate).

import { NextResponse, type NextRequest } from "next/server";

export const config = {
  // Gate ONLY the MCP transport. Never touches the landing page or static assets.
  matcher: ["/mcp", "/mcp/:path*"],
};

const encoder = new TextEncoder();

async function sha256(input: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(input));
  return new Uint8Array(digest);
}

/** Constant-time comparison of two equal-length byte arrays. */
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false; // both are SHA-256 (32 bytes) → never leaks length
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/**
 * Compare a provided secret against the expected one in constant time.
 * Both are hashed to a fixed 32-byte digest first, so neither the comparison
 * nor the digest length leaks any information about the raw secret.
 */
async function secretMatches(provided: string, expected: string): Promise<boolean> {
  const [p, e] = await Promise.all([sha256(provided), sha256(expected)]);
  return constantTimeEqual(p, e);
}

function deny(message: string, status: number): NextResponse {
  // JSON-RPC-shaped body so MCP clients get a structured, non-HTML failure.
  return NextResponse.json(
    { jsonrpc: "2.0", error: { code: -32001, message }, id: null },
    { status },
  );
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  // Let CORS preflight through — clients send OPTIONS before connecting.
  if (req.method === "OPTIONS") return NextResponse.next();

  const expected = process.env.MCP_GATEWAY_SECRET?.trim();
  if (!expected) {
    // Fail CLOSED: a missing secret must not silently open the gate.
    return deny("MCP gateway is not configured (set MCP_GATEWAY_SECRET)", 503);
  }

  const provided = req.headers.get("x-mcp-gateway-key")?.trim();
  if (!provided || !(await secretMatches(provided, expected))) {
    return deny("Unauthorized: missing or invalid X-MCP-Gateway-Key", 401);
  }

  return NextResponse.next();
}

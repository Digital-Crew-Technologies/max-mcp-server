import { NextResponse } from "next/server";

// GET /health — unauthenticated liveness probe (flagged as missing in
// docs/ENDPOINT_CHECKLIST.md). Deliberately OUTSIDE the middleware matcher
// (/mcp, /chat), so it needs no gateway key: dockerized crew boxes and the
// hub use it to verify the gateway is reachable before wiring agents to it.
// It leaks nothing — a static body with no config, versions, or upstream state.
export const dynamic = "force-dynamic";

export function GET(): NextResponse {
  return NextResponse.json(
    { status: "ok", service: "max-mcp-server" },
    { headers: { "Cache-Control": "no-store" } },
  );
}

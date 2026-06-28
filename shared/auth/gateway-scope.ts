import { getMcpRequest } from "./request-context";

/**
 * Admin tools require a separate gateway key (MCP_ADMIN_GATEWAY_KEY).
 * Regular MCP_GATEWAY_SECRET callers cannot invoke dead-letter / breaker admin ops
 * even when ENABLE_ADMIN_TOOLS=true.
 */
export function getGatewayKeyFromRequest(): string | undefined {
  const req = getMcpRequest();
  return req?.headers.get("x-mcp-gateway-key")?.trim() || undefined;
}

/**
 * Constant-time string compare to avoid leaking the admin key via timing.
 * Length-mismatch returns early (a length oracle, but admin keys are
 * fixed-length random secrets — `openssl rand -base64 32` is always 44 chars —
 * so length carries no useful information for an attacker).
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function hasAdminScope(): boolean {
  const adminKey = process.env.MCP_ADMIN_GATEWAY_KEY?.trim();
  if (!adminKey) return false;
  const provided = getGatewayKeyFromRequest();
  return !!provided && constantTimeEqual(provided, adminKey);
}

export function requireAdmin(): void {
  if (!hasAdminScope()) {
    throw new Error("Forbidden: admin scope required (send MCP_ADMIN_GATEWAY_KEY as X-MCP-Gateway-Key)");
  }
}

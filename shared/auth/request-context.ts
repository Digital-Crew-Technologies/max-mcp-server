import { AsyncLocalStorage } from "async_hooks";
import {
  parseVerifiedCaller,
  VERIFIED_HERMES_CALLER_HEADER,
  type HermesCaller,
} from "./hermes-caller";

const mcpRequestStore = new AsyncLocalStorage<Request>();

/**
 * Run MCP HTTP handler with Request context available to tools.
 */
export function runWithMcpRequest<T>(request: Request, fn: () => T): T {
  return mcpRequestStore.run(request, fn);
}

export function getMcpRequest(): Request | undefined {
  return mcpRequestStore.getStore();
}

/**
 * Reads Bearer token from incoming MCP connection Authorization header.
 */
export function getAuthorizationBearerFromMcpRequest(): string | undefined {
  const req = mcpRequestStore.getStore();
  const header = req?.headers.get("Authorization")?.trim();
  if (!header?.toLowerCase().startsWith("bearer ")) {
    return undefined;
  }

  const token = header.slice(7).trim();
  return token || undefined;
}

/**
 * The VERIFIED Hermes caller identity for the current MCP request, or undefined if
 * the caller presented no (valid) X-Hermes-Caller envelope. Trustworthy because
 * middleware only sets the verified header after checking the signature + expiry
 * and strips any client-supplied copy first. Tool handlers use this to know which
 * company/agent is calling and (later) to enforce the capability allowlist.
 */
export function getHermesCaller(): HermesCaller | undefined {
  const req = mcpRequestStore.getStore();
  const raw = req?.headers.get(VERIFIED_HERMES_CALLER_HEADER);
  if (!raw) return undefined;
  return parseVerifiedCaller(raw);
}

/**
 * The RAW verified caller header value (canonical JSON) for the current MCP
 * request, or undefined if none. Forwarded verbatim on outbound calls to
 * max-agent so it can run its own tenant cross-check + capability allowlist.
 * We forward the exact string middleware set (already signature-verified) rather
 * than re-serializing, to preserve byte-for-byte fidelity.
 */
export function getVerifiedHermesCallerHeader(): string | undefined {
  const req = mcpRequestStore.getStore();
  const raw = req?.headers.get(VERIFIED_HERMES_CALLER_HEADER)?.trim();
  return raw || undefined;
}

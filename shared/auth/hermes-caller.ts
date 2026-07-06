// Hermes caller identity — verify the signed X-Hermes-Caller envelope.
//
// WHY: the MCP gateway key (middleware.ts) proves "an allowed caller"; this
// envelope proves WHICH company/agent is calling and what capability it intends,
// so Max API can (later) enforce a per-company capability allowlist + HitL.
//
// WIRE FORMAT (Contract 3):
//   X-Hermes-Caller: v1=<base64url(json)>.<hex_sig>
//   sig = HMAC-SHA256(HERMES_CALLER_SECRET, base64url(json))
//   json = { tenantId, agentId, capability, nonce, exp, approval_id? }  (exp: unix seconds)
//
// RUNTIME: this module must be Edge-safe (it runs in middleware.ts). It uses only
// Web Crypto (crypto.subtle), atob, and TextEncoder/Decoder — never node:crypto.
//
// TRUST HANDOFF: middleware verifies the RAW header, then forwards a canonical
// VERIFIED header downstream (and strips any client-supplied verified header so it
// cannot be spoofed). Tools read the verified identity via getHermesCaller()
// (defined in request-context.ts — this module stays Edge-safe with NO node deps).

/** Header the client sends (untrusted until verified). */
export const RAW_HERMES_CALLER_HEADER = "x-hermes-caller";
/** Header middleware sets after verifying — the only one downstream trusts. */
export const VERIFIED_HERMES_CALLER_HEADER = "x-hermes-caller-verified";

export interface HermesCaller {
  tenantId: string;
  agentId: string;
  capability: string;
  nonce: string;
  /** Expiry, unix seconds. */
  exp: number;
  /** Present when the caller carries a HitL approval token. */
  approvalId?: string;
}

export type HermesCallerFailure =
  | "malformed"
  | "bad_version"
  | "bad_signature"
  | "expired"
  | "bad_payload";

export class HermesCallerError extends Error {
  constructor(public readonly reason: HermesCallerFailure) {
    super(`Invalid X-Hermes-Caller: ${reason}`);
    this.name = "HermesCallerError";
  }
}

const encoder = new TextEncoder();

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
}

function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function base64UrlToBytes(input: string): Uint8Array {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64.padEnd(Math.ceil(b64.length / 4) * 4, "=");
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return bytesToHex(new Uint8Array(sig));
}

/**
 * Verify a raw `X-Hermes-Caller` value against the shared secret. Throws
 * {@link HermesCallerError} on any failure. `nowMs` is injected for testability.
 */
export async function verifyHermesCaller(
  raw: string,
  secret: string,
  nowMs: number,
): Promise<HermesCaller> {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("v1=")) throw new HermesCallerError("bad_version");
  const body = trimmed.slice(3);
  const dot = body.indexOf(".");
  if (dot <= 0 || dot === body.length - 1) {
    throw new HermesCallerError("malformed");
  }
  const b64 = body.slice(0, dot);
  const providedSig = body.slice(dot + 1);

  const expectedSig = await hmacSha256Hex(secret, b64);
  if (!constantTimeEqualHex(providedSig, expectedSig)) {
    throw new HermesCallerError("bad_signature");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(base64UrlToBytes(b64)));
  } catch {
    throw new HermesCallerError("malformed");
  }

  const caller = coerceCaller(parsed);
  if (!caller) throw new HermesCallerError("bad_payload");

  // exp is unix SECONDS; compare against nowMs.
  if (caller.exp * 1000 < nowMs) throw new HermesCallerError("expired");
  return caller;
}

/**
 * Parse a VERIFIED caller header value (canonical JSON that middleware set after
 * verification). Pure/Edge-safe — no signature check here, that already happened.
 * Returns undefined on malformed input.
 */
export function parseVerifiedCaller(raw: string): HermesCaller | undefined {
  try {
    return coerceCaller(JSON.parse(raw)) ?? undefined;
  } catch {
    return undefined;
  }
}

function coerceCaller(value: unknown): HermesCaller | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  const tenantId = v.tenantId;
  const agentId = v.agentId;
  const capability = v.capability;
  const nonce = v.nonce;
  const exp = v.exp;
  const approvalId = v.approval_id ?? v.approvalId;
  if (
    typeof tenantId !== "string" ||
    typeof agentId !== "string" ||
    typeof capability !== "string" ||
    typeof nonce !== "string" ||
    typeof exp !== "number" ||
    !Number.isFinite(exp)
  ) {
    return null;
  }
  return {
    tenantId,
    agentId,
    capability,
    nonce,
    exp,
    ...(typeof approvalId === "string" ? { approvalId } : {}),
  };
}

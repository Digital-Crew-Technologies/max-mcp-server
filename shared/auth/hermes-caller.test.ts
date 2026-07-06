import { describe, it, expect } from "vitest";
import {
  verifyHermesCaller,
  parseVerifiedCaller,
  HermesCallerError,
  type HermesCaller,
} from "@/shared/auth/hermes-caller";

const SECRET = "test-hermes-caller-secret";

function base64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Build a signed X-Hermes-Caller value for a payload, signing with `secret`. */
async function sign(
  payload: Record<string, unknown>,
  secret: string = SECRET,
): Promise<string> {
  const json = JSON.stringify(payload);
  const b64 = base64Url(new TextEncoder().encode(json));
  const sig = await hmacHex(secret, b64);
  return `v1=${b64}.${sig}`;
}

const NOW = 1_800_000_000_000; // fixed "now" in ms
const VALID_PAYLOAD = {
  tenantId: "digitalcrew",
  agentId: "max",
  capability: "unipile.mail",
  nonce: "abc123",
  exp: Math.floor(NOW / 1000) + 300, // 5 min in the future
};

describe("verifyHermesCaller", () => {
  it("accepts a correctly signed, unexpired envelope", async () => {
    const raw = await sign(VALID_PAYLOAD);
    const caller = await verifyHermesCaller(raw, SECRET, NOW);
    expect(caller.tenantId).toBe("digitalcrew");
    expect(caller.agentId).toBe("max");
    expect(caller.capability).toBe("unipile.mail");
    expect(caller.approvalId).toBeUndefined();
  });

  it("carries approval_id through when present", async () => {
    const raw = await sign({ ...VALID_PAYLOAD, approval_id: "appr_1" });
    const caller = await verifyHermesCaller(raw, SECRET, NOW);
    expect(caller.approvalId).toBe("appr_1");
  });

  it("rejects a tampered payload (signature mismatch)", async () => {
    const raw = await sign(VALID_PAYLOAD);
    // Flip the capability in the base64 segment without re-signing.
    const tampered = await sign({ ...VALID_PAYLOAD, capability: "mcp.max" });
    const forged = `${tampered.split(".")[0]}.${raw.split(".")[1]}`;
    await expect(verifyHermesCaller(forged, SECRET, NOW)).rejects.toMatchObject({
      reason: "bad_signature",
    } satisfies Partial<HermesCallerError>);
  });

  it("rejects a wrong signing secret", async () => {
    const raw = await sign(VALID_PAYLOAD, "the-wrong-secret");
    await expect(verifyHermesCaller(raw, SECRET, NOW)).rejects.toMatchObject({
      reason: "bad_signature",
    });
  });

  it("rejects an expired envelope", async () => {
    const raw = await sign({
      ...VALID_PAYLOAD,
      exp: Math.floor(NOW / 1000) - 1, // already expired
    });
    await expect(verifyHermesCaller(raw, SECRET, NOW)).rejects.toMatchObject({
      reason: "expired",
    });
  });

  it("rejects a missing version prefix", async () => {
    const raw = await sign(VALID_PAYLOAD);
    const noVersion = raw.slice(3); // strip "v1="
    await expect(verifyHermesCaller(noVersion, SECRET, NOW)).rejects.toMatchObject(
      { reason: "bad_version" },
    );
  });

  it("rejects a malformed body (no signature segment)", async () => {
    await expect(verifyHermesCaller("v1=onlybody", SECRET, NOW)).rejects.toThrow(
      HermesCallerError,
    );
  });

  it("rejects a payload missing required fields", async () => {
    const raw = await sign({ tenantId: "x", agentId: "max" }); // no capability/nonce/exp
    await expect(verifyHermesCaller(raw, SECRET, NOW)).rejects.toMatchObject({
      reason: "bad_payload",
    });
  });
});

describe("parseVerifiedCaller", () => {
  it("parses canonical verified JSON", () => {
    const caller: HermesCaller = {
      tenantId: "digitalcrew",
      agentId: "max",
      capability: "mcp.max",
      nonce: "n",
      exp: 123,
    };
    expect(parseVerifiedCaller(JSON.stringify(caller))).toEqual(caller);
  });

  it("returns undefined on garbage", () => {
    expect(parseVerifiedCaller("not json")).toBeUndefined();
    expect(parseVerifiedCaller("{}")).toBeUndefined();
  });
});

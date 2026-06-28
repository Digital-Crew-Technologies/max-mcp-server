import { getAuthorizationBearerFromMcpRequest } from "@/shared/auth/request-context";

export function getDigitalCrewBaseUrl(): string {
  const base = process.env.DIGITALCREW_API_BASE_URL?.trim();
  if (!base) {
    throw new Error("DIGITALCREW_API_BASE_URL is not set");
  }
  return base.replace(/\/$/, "");
}

/**
 * Token order: tool arg `bearer_token` -> MCP Authorization header.
 * Env fallback is opt-in only (ALLOW_ENV_TOKEN_FALLBACK=true) for legacy scripts.
 */
export function resolveBearerToken(override?: string | null): string {
  let token = override?.trim() || getAuthorizationBearerFromMcpRequest();

  if (!token && process.env.ALLOW_ENV_TOKEN_FALLBACK === "true") {
    token =
      process.env.DIGITALCREW_API_TOKEN?.trim() ||
      process.env.DIGITALCREW_BEARER_TOKEN?.trim() ||
      undefined;
  }

  if (!token) {
    throw new Error(
      "Bearer token missing: send Authorization: Bearer on the MCP request or pass bearer_token on the tool",
    );
  }
  return token;
}

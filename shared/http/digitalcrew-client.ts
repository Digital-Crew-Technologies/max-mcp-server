import { getAuthorizationBearerFromMcpRequest } from "@/shared/auth/request-context";

export function getDigitalCrewBaseUrl(): string {
  const base = process.env.DIGITALCREW_API_BASE_URL?.trim();
  if (!base) {
    throw new Error("DIGITALCREW_API_BASE_URL is not set");
  }
  return base.replace(/\/$/, "");
}

/**
 * Token order: tool arg `bearer_token` -> MCP Authorization header -> env.
 */
export function resolveBearerToken(override?: string | null): string {
  const token =
    override?.trim() ||
    getAuthorizationBearerFromMcpRequest() ||
    process.env.DIGITALCREW_API_TOKEN?.trim() ||
    process.env.DIGITALCREW_BEARER_TOKEN?.trim();

  if (!token) {
    throw new Error(
      "Bearer token missing: send Authorization: Bearer on MCP request, set DIGITALCREW_API_TOKEN / DIGITALCREW_BEARER_TOKEN, or pass bearer_token on the tool",
    );
  }
  return token;
}

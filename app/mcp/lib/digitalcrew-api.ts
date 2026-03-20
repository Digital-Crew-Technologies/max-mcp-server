import { getAuthorizationBearerFromMcpRequest } from "../request-context";

const PROFILE_PATH = "/api/v1/workspace-profile-settings";

function getBaseUrl(): string {
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

export async function getWorkspaceProfileSettings(
  bearerToken: string,
): Promise<Response> {
  const url = `${getBaseUrl()}${PROFILE_PATH}`;
  return fetch(url, {
    headers: { Authorization: `Bearer ${bearerToken}` },
  });
}

export async function putWorkspaceProfileSettings(
  bearerToken: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const url = `${getBaseUrl()}${PROFILE_PATH}`;
  return fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${bearerToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

export async function responseBodyText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

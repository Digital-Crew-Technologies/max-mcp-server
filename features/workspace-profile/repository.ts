import {
  getDigitalCrewBaseUrl,
  resolveBearerToken,
} from "@/shared/http/digitalcrew-client";
import { responseBodyText } from "@/shared/http/response";
import { fetchWithRetry } from "@/features/pilot-tools/http";
// authHeaders also forwards the verified Hermes caller, so max-agent runs the
// same tenant cross-check on these tools as on every other one.
import { authHeaders } from "@/features/pilot-tools/shared";

const PROFILE_PATH = "/api/v1/workspace-profile-settings";
export { resolveBearerToken, responseBodyText };

export async function getWorkspaceProfileSettings(
  bearerToken: string,
): Promise<Response> {
  const url = `${getDigitalCrewBaseUrl()}${PROFILE_PATH}`;
  return fetchWithRetry(url, {
    headers: authHeaders(bearerToken),
  });
}

export async function putWorkspaceProfileSettings(
  bearerToken: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const url = `${getDigitalCrewBaseUrl()}${PROFILE_PATH}`;
  return fetchWithRetry(url, {
    method: "PUT",
    headers: authHeaders(bearerToken),
    body: JSON.stringify(body),
  });
}

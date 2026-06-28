import {
  getDigitalCrewBaseUrl,
  resolveBearerToken,
} from "@/shared/http/digitalcrew-client";
import { responseBodyText } from "@/shared/http/response";
import { fetchWithRetry } from "@/features/pilot-tools/http";

const PROFILE_PATH = "/api/v1/workspace-profile-settings";
export { resolveBearerToken, responseBodyText };

export async function getWorkspaceProfileSettings(
  bearerToken: string,
): Promise<Response> {
  const url = `${getDigitalCrewBaseUrl()}${PROFILE_PATH}`;
  return fetchWithRetry(url, {
    headers: { Authorization: `Bearer ${bearerToken}` },
  });
}

export async function putWorkspaceProfileSettings(
  bearerToken: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const url = `${getDigitalCrewBaseUrl()}${PROFILE_PATH}`;
  return fetchWithRetry(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${bearerToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

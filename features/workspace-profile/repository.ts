import {
  getDigitalCrewBaseUrl,
  resolveBearerToken,
} from "@/shared/http/digitalcrew-client";

const PROFILE_PATH = "/api/v1/workspace-profile-settings";
export { resolveBearerToken };

export async function getWorkspaceProfileSettings(
  bearerToken: string,
): Promise<Response> {
  const url = `${getDigitalCrewBaseUrl()}${PROFILE_PATH}`;
  return fetch(url, {
    headers: { Authorization: `Bearer ${bearerToken}` },
  });
}

export async function putWorkspaceProfileSettings(
  bearerToken: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const url = `${getDigitalCrewBaseUrl()}${PROFILE_PATH}`;
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

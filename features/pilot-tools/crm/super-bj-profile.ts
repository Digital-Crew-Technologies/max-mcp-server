// Reader for the Super-BJ workspace-profile config namespace.
//
// max-agent's GET /api/v1/workspace-profile-settings returns
//   { data: WorkspaceProfileSettings | null }
// The Super-BJ controls live under a forward-looking `super_bj` key on that
// JSONB. The current max-agent DTO does not yet surface `super_bj` (it ships a
// flat company-profile shape), so we read it DEFENSIVELY: parse the JSON, look
// for `data.super_bj`, and degrade safely when absent (writes disabled, no
// rules). When max-agent adds the key, this reader picks it up with no change.
// ⚠️ Server-only.

import { apiUrl, authHeaders, fetchWithRetry, responseBodyText } from "../shared";

export interface IcpRules {
  countries?: string[];
  industries?: string[];
  employee_min?: number;
  employee_max?: number;
  title_keywords?: string[];
}

export interface AssignmentRule {
  if?: { country?: string[]; industry?: string[]; product?: string };
  assign_to_owner_id: string;
}

export interface SuperBjConfig {
  allow_crm_writes?: boolean;
  icp_rules?: IcpRules;
  assignment_rules?: AssignmentRule[];
}

/**
 * Fetch the workspace's `super_bj` config. Returns {} when the profile or the
 * `super_bj` key is absent (never throws on a missing key — only on a hard
 * request failure, which callers turn into an MCP error envelope).
 */
export async function getSuperBjConfig(maxBearer: string): Promise<SuperBjConfig> {
  const res = await fetchWithRetry(apiUrl("/api/v1/workspace-profile-settings"), {
    method: "GET",
    headers: authHeaders(maxBearer),
  });
  if (!res.ok) {
    const body = await responseBodyText(res);
    throw new Error(
      `WORKSPACE_PROFILE_FETCH_FAILED: ${res.status} ${body || res.statusText}`,
    );
  }
  const text = await responseBodyText(res);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {};
  }
  const data = (parsed as { data?: unknown })?.data;
  if (!data || typeof data !== "object") return {};
  const superBj = (data as Record<string, unknown>).super_bj;
  if (!superBj || typeof superBj !== "object") return {};
  return superBj as SuperBjConfig;
}

/** True only when allow_crm_writes is explicitly true. Missing/false → false. */
export async function areCrmWritesAllowed(maxBearer: string): Promise<boolean> {
  const cfg = await getSuperBjConfig(maxBearer);
  return cfg.allow_crm_writes === true;
}

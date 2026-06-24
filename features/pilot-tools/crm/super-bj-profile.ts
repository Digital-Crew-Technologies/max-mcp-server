// Reader for the Super-BJ workspace-profile config namespace.
//
// max-agent's GET /api/v1/workspace-profile-settings returns
//   { data: { super_bj: {...} } | null }
// The GET endpoint returns all Super-BJ keys defaulted, but we still read
// DEFENSIVELY: parse the JSON, look for `data.super_bj`, and degrade safely when
// absent (writes default sensibly, no rules, thresholds fall back to documented
// defaults). When the workspace returns no super_bj, callers still get a usable
// resolved config via getSuperBjResolved().
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

export interface RiskThresholds {
  inactive_days: number;
  close_date_slip_days: number;
  high_value_threshold_eur: number;
  low_activity_threshold_count: number;
}

/**
 * Raw super_bj config as it may appear on the workspace profile. All fields are
 * optional — the workspace may omit any of them. Use getSuperBjResolved() for a
 * fully-defaulted view.
 */
export interface SuperBjConfig {
  allow_crm_writes?: boolean;
  allow_notion_writes?: boolean;
  risk_thresholds?: Partial<RiskThresholds>;
  icp_rules?: IcpRules;
  assignment_rules?: AssignmentRule[];
  notion_drafts_parent_id?: string | null;
  notion_weekly_template_id?: string | null;
  super_bj_v?: number;
}

/**
 * Fully-resolved Super-BJ config: every field present with a safe default so
 * callers never have to re-implement defaulting. Writes default to TRUE (the
 * documented Super-BJ default); thresholds use the documented baseline.
 */
export interface ResolvedSuperBj {
  allow_crm_writes: boolean;
  allow_notion_writes: boolean;
  risk_thresholds: RiskThresholds;
  icp_rules: IcpRules;
  assignment_rules: AssignmentRule[];
  notion_drafts_parent_id: string | null;
  notion_weekly_template_id: string | null;
  super_bj_v: number | null;
}

export const DEFAULT_RISK_THRESHOLDS: RiskThresholds = {
  inactive_days: 14,
  close_date_slip_days: 7,
  high_value_threshold_eur: 50000,
  low_activity_threshold_count: 1,
};

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

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/** Merge a raw super_bj config with safe defaults into a resolved view. */
export function resolveSuperBj(cfg: SuperBjConfig): ResolvedSuperBj {
  const rt = cfg.risk_thresholds ?? {};
  return {
    // Writes default to TRUE (opt-out, not opt-in) — only an explicit false disables.
    allow_crm_writes: cfg.allow_crm_writes !== false,
    allow_notion_writes: cfg.allow_notion_writes !== false,
    risk_thresholds: {
      inactive_days: num(rt.inactive_days, DEFAULT_RISK_THRESHOLDS.inactive_days),
      close_date_slip_days: num(
        rt.close_date_slip_days,
        DEFAULT_RISK_THRESHOLDS.close_date_slip_days,
      ),
      high_value_threshold_eur: num(
        rt.high_value_threshold_eur,
        DEFAULT_RISK_THRESHOLDS.high_value_threshold_eur,
      ),
      low_activity_threshold_count: num(
        rt.low_activity_threshold_count,
        DEFAULT_RISK_THRESHOLDS.low_activity_threshold_count,
      ),
    },
    icp_rules: cfg.icp_rules ?? {},
    assignment_rules: cfg.assignment_rules ?? [],
    notion_drafts_parent_id: cfg.notion_drafts_parent_id ?? null,
    notion_weekly_template_id: cfg.notion_weekly_template_id ?? null,
    super_bj_v: typeof cfg.super_bj_v === "number" ? cfg.super_bj_v : null,
  };
}

/** Fetch + resolve in one call. */
export async function getSuperBjResolved(maxBearer: string): Promise<ResolvedSuperBj> {
  return resolveSuperBj(await getSuperBjConfig(maxBearer));
}

/** True only when allow_crm_writes is explicitly true. Missing/false → false. */
export async function areCrmWritesAllowed(maxBearer: string): Promise<boolean> {
  const cfg = await getSuperBjConfig(maxBearer);
  return cfg.allow_crm_writes === true;
}

/**
 * Notion writes default TRUE — only an explicit `allow_notion_writes: false`
 * disables them (opt-out gate, matching the Super-BJ default policy).
 */
export async function areNotionWritesAllowed(maxBearer: string): Promise<boolean> {
  const cfg = await getSuperBjConfig(maxBearer);
  return cfg.allow_notion_writes !== false;
}

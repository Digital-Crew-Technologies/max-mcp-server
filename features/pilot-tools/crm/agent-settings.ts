// Reader for the the assistant workspace-profile config namespace.
//
// max-agent's GET /api/v1/workspace-profile-settings returns
//   { data: { agent_settings: {...} } | null }
// The GET endpoint returns all the assistant keys defaulted, but we still read
// DEFENSIVELY: parse the JSON, look for `data.agent_settings`, and degrade safely when
// absent (writes default sensibly, no rules, thresholds fall back to documented
// defaults). When the workspace returns no agent_settings, callers still get a usable
// resolved config via getAgentSettingsResolved().
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
 * Raw agent_settings config as it may appear on the workspace profile. All fields are
 * optional — the workspace may omit any of them. Use getAgentSettingsResolved() for a
 * fully-defaulted view.
 */
export interface AgentSettingsConfig {
  allow_crm_writes?: boolean;
  allow_notion_writes?: boolean;
  risk_thresholds?: Partial<RiskThresholds>;
  icp_rules?: IcpRules;
  assignment_rules?: AssignmentRule[];
  notion_drafts_parent_id?: string | null;
  notion_weekly_template_id?: string | null;
  agent_settings_v?: number;
}

/**
 * Fully-resolved the assistant config: every field present with a safe default so
 * callers never have to re-implement defaulting. Writes default to TRUE (the
 * documented the assistant default); thresholds use the documented baseline.
 */
export interface ResolvedAgentSettings {
  allow_crm_writes: boolean;
  allow_notion_writes: boolean;
  risk_thresholds: RiskThresholds;
  icp_rules: IcpRules;
  assignment_rules: AssignmentRule[];
  notion_drafts_parent_id: string | null;
  notion_weekly_template_id: string | null;
  agent_settings_v: number | null;
}

export const DEFAULT_RISK_THRESHOLDS: RiskThresholds = {
  inactive_days: 14,
  close_date_slip_days: 7,
  high_value_threshold_eur: 50000,
  low_activity_threshold_count: 1,
};

/**
 * Fetch the workspace's `agent_settings` config. Returns {} when the profile or the
 * `agent_settings` key is absent (never throws on a missing key — only on a hard
 * request failure, which callers turn into an MCP error envelope).
 */
export async function getAgentSettingsConfig(maxBearer: string): Promise<AgentSettingsConfig> {
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
  const agentSettings = (data as Record<string, unknown>).agent_settings;
  if (!agentSettings || typeof agentSettings !== "object") return {};
  return agentSettings as AgentSettingsConfig;
}

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/** Merge a raw agent_settings config with safe defaults into a resolved view. */
export function resolveAgentSettings(cfg: AgentSettingsConfig): ResolvedAgentSettings {
  const rt = cfg.risk_thresholds ?? {};
  return {
    // READ-ONLY MODE: all third-party writes are permanently disabled.
    // Max holds clients' HubSpot + Notion OAuth tokens — it must never mutate
    // their accounts. These flags are pinned to false at the resolver layer;
    // any value in the underlying config is ignored.
    allow_crm_writes: false,
    allow_notion_writes: false,
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
    agent_settings_v: typeof cfg.agent_settings_v === "number" ? cfg.agent_settings_v : null,
  };
}

/** Fetch + resolve in one call. */
export async function getAgentSettingsResolved(maxBearer: string): Promise<ResolvedAgentSettings> {
  return resolveAgentSettings(await getAgentSettingsConfig(maxBearer));
}

/**
 * READ-ONLY MODE: HubSpot writes are permanently disabled.
 * Max uses clients' OAuth tokens — it must never mutate their CRM.
 * The HubSpot OAuth scope list also omits any `*.write` scope as defense in
 * depth, so the token itself cannot write even if this gate is bypassed.
 */
export async function areCrmWritesAllowed(_maxBearer: string): Promise<boolean> {
  return false;
}

/**
 * READ-ONLY MODE: Notion writes are permanently disabled.
 * Max uses clients' OAuth tokens — it must never mutate their workspace.
 * This includes weekly-brief publishing: callers should consume the
 * crm_weekly_brief_compose JSON directly instead.
 */
export async function areNotionWritesAllowed(_maxBearer: string): Promise<boolean> {
  return false;
}

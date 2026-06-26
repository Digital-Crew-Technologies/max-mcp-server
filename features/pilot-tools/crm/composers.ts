// CRM composite workflow tools (the assistant Task D2):
//   • crm_pipeline_risk_scan   — score open deals for risk, draft owner nudges
//   • crm_weekly_brief_compose — build a structured weekly sales brief
//
// These COMPOSE the read-only HubSpotClient methods (listDeals / listActivities
// / listOwners / listPipelineStages) ported in the prior batch. Those deal/
// owner/activity methods are UNVERIFIED against live HubSpot; if they throw
// HubSpotMcpError we let it propagate into the tool's isError envelope (we do
// not swallow it).
//
// The risk logic is factored into a single internal scanPipeline() so the
// weekly brief reuses it instead of duplicating.
// ⚠️ Server-only.

import { resolveBearerToken, type McpServer } from "../shared";
import * as S from "./schema";
import { HubSpotClient } from "./hubspot-client";
import { getHubSpotAccessToken } from "./token-resolver";
import { getAgentSettingsResolved, type RiskThresholds } from "./agent-settings";
import type {
  CrmActivity,
  CrmDeal,
  CrmOwner,
  CrmPipelineStage,
} from "./hubspot-client.types";

type McpEnvelope = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

function ok(payload: unknown): McpEnvelope {
  return { content: [{ type: "text", text: JSON.stringify(payload) }] };
}

function err(text: string): McpEnvelope {
  return { isError: true, content: [{ type: "text", text }] };
}

function mapError(e: unknown): McpEnvelope {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg === "HUBSPOT_NOT_CONNECTED") {
    return err(
      "HubSpot is not connected for this workspace. Connect HubSpot in workspace settings, then retry.",
    );
  }
  const cls = e instanceof Error ? e.name : "Error";
  return err(`${cls}: ${msg}`);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseMs(s: string | null | undefined): number | null {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : t;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function ownerName(o: CrmOwner | undefined): string | null {
  if (!o) return null;
  return [o.firstName, o.lastName].filter(Boolean).join(" ") || o.email || null;
}

function fmtAmount(amount: number | null): string {
  return amount != null ? `€${amount.toLocaleString("en-US")}` : "the deal value";
}

// ── Risk model (shared) ──────────────────────────────────────────────────────

export interface FlaggedDeal {
  deal_id: string;
  dealname: string | null;
  owner_id: string | null;
  owner_name: string | null;
  amount: number | null;
  stage: string | null;
  days_inactive: number | null;
  days_to_close: number | null;
  missing_fields: string[];
  close_date_slipping: boolean;
  high_value_low_activity: boolean;
  risk_score: number;
  suggested_nudge_draft: string;
}

export interface PipelineScanResult {
  scanned_count: number;
  flagged: FlaggedDeal[];
}

// Transparent weighted scoring (0–100), capped at 100. Each flag contributes a
// fixed weight; the total is clamped so the score stays interpretable.
const WEIGHTS = {
  inactive: 30, // days_inactive >= threshold
  slipping: 25, // close date already past
  high_value_low_activity: 25, // big deal, little activity in window
  missing_field: 7, // per missing field (amount/owner/next_step/no activity)
} as const;

/**
 * Core risk scan. Pure compute over already-fetched HubSpot data so both the
 * risk-scan tool and the weekly brief can share it.
 *
 * @param deals       open deals (caller pre-filters to open + owner if needed)
 * @param activities  activities within the window
 * @param owners      owners (for name resolution)
 * @param thresholds  resolved agent_settings.risk_thresholds
 * @param windowDays  the activity window in days (for messaging only)
 */
export function scanPipeline(
  deals: CrmDeal[],
  activities: CrmActivity[],
  owners: CrmOwner[],
  thresholds: RiskThresholds,
  windowDays: number,
  now: number = Date.now(),
): PipelineScanResult {
  void windowDays;
  const ownerById = new Map(owners.map((o) => [o.id, o]));

  // Activity count per deal owner within the window (proxy for deal activity;
  // HubSpot engagements aren't reliably associated to a deal id in this env).
  const activityCountByOwner = new Map<string, number>();
  for (const a of activities) {
    if (!a.ownerId) continue;
    activityCountByOwner.set(a.ownerId, (activityCountByOwner.get(a.ownerId) ?? 0) + 1);
  }

  const flagged: FlaggedDeal[] = [];

  for (const d of deals) {
    const lastActivityMs = parseMs(d.lastActivityDate) ?? parseMs(d.lastModified);
    const daysInactive =
      lastActivityMs != null ? Math.floor((now - lastActivityMs) / MS_PER_DAY) : null;

    const closeMs = parseMs(d.closeDate);
    const daysToClose = closeMs != null ? Math.floor((closeMs - now) / MS_PER_DAY) : null;

    const missing: string[] = [];
    if (d.amount == null) missing.push("amount");
    if (!d.ownerId) missing.push("owner");
    if (!d.nextStep) missing.push("next_step");
    if (!d.lastActivityDate) missing.push("last_activity");

    const closeDateSlipping = daysToClose != null && daysToClose < 0;

    const ownerActivity = d.ownerId ? activityCountByOwner.get(d.ownerId) ?? 0 : 0;
    const highValueLowActivity =
      d.amount != null &&
      d.amount >= thresholds.high_value_threshold_eur &&
      ownerActivity <= thresholds.low_activity_threshold_count;

    const inactiveFlag = daysInactive != null && daysInactive >= thresholds.inactive_days;

    // Weighted risk score (clamped 0–100).
    let score = 0;
    if (inactiveFlag) score += WEIGHTS.inactive;
    if (closeDateSlipping) score += WEIGHTS.slipping;
    if (highValueLowActivity) score += WEIGHTS.high_value_low_activity;
    score += missing.length * WEIGHTS.missing_field;
    const riskScore = Math.max(0, Math.min(100, score));

    // Only surface deals that tripped at least one signal.
    if (riskScore === 0) continue;

    const owner = d.ownerId ? ownerById.get(d.ownerId) : undefined;
    const oName = ownerName(owner) ?? "there";
    const dealLabel = d.dealname ?? "this deal";
    const inactivePhrase =
      daysInactive != null ? `${daysInactive} days` : "a while";
    const closePhrase =
      daysToClose != null
        ? daysToClose < 0
          ? `its close date passed ${Math.abs(daysToClose)} days ago`
          : `closes in ${daysToClose} days`
        : "has no close date set";

    const nudge = `Hi ${oName}, the ${dealLabel} deal (${fmtAmount(
      d.amount,
    )}) has had no activity for ${inactivePhrase} and ${closePhrase}. What's the next step?`;

    flagged.push({
      deal_id: d.id,
      dealname: d.dealname,
      owner_id: d.ownerId,
      owner_name: ownerName(owner),
      amount: d.amount,
      stage: d.stage,
      days_inactive: daysInactive,
      days_to_close: daysToClose,
      missing_fields: missing,
      close_date_slipping: closeDateSlipping,
      high_value_low_activity: highValueLowActivity,
      risk_score: riskScore,
      suggested_nudge_draft: nudge,
    });
  }

  // Highest risk first.
  flagged.sort((a, b) => b.risk_score - a.risk_score);

  return { scanned_count: deals.length, flagged };
}

/** True for stages flagged won/lost (closed) — used to keep only open deals. */
function isClosedStage(stageId: string | null, stages: CrmPipelineStage[]): boolean {
  if (!stageId) return false;
  const st = stages.find((s) => s.id === stageId);
  return st ? st.isWonStage || st.isLostStage : false;
}

// ── Internal compose helpers (shared by both tools) ──────────────────────────

interface PipelineData {
  deals: CrmDeal[];
  openDeals: CrmDeal[];
  activities: CrmActivity[];
  owners: CrmOwner[];
  stages: CrmPipelineStage[];
}

/**
 * Fetch the pipeline working set (deals/activities/owners/stages) and split out
 * open deals. Reused by both composite tools. Lets HubSpotMcpError propagate.
 */
async function loadPipeline(
  client: HubSpotClient,
  opts: { sinceIso: string; ownerId?: string },
): Promise<PipelineData> {
  const [deals, activities, owners, stages] = await Promise.all([
    client.listDeals({ ownerId: opts.ownerId, limit: 200 }),
    client.listActivities({ ownerId: opts.ownerId, since: opts.sinceIso, limit: 200 }),
    client.listOwners(),
    client.listPipelineStages(),
  ]);
  const openDeals = deals.filter((d) => !isClosedStage(d.stage, stages));
  return { deals, openDeals, activities, owners, stages };
}

// ── Tool registration ────────────────────────────────────────────────────────

export function registerCrmComposerTools(server: McpServer): void {
  server.registerTool(
    "crm_pipeline_risk_scan",
    {
      title: "Scan open pipeline for risk",
      description:
        "Scan open HubSpot deals for risk: days inactive, days-to-close, missing fields (amount/owner/next_step/last_activity), close-date slipping, and high-value-low-activity. Computes a transparent weighted risk_score (0–100) and a PRIVATE suggested nudge draft to the owner (never sent). Uses agent_settings.risk_thresholds. Returns { scanned_count, flagged:[...] }.",
      inputSchema: S.crmPipelineRiskScanSchema,
    },
    async (input) => {
      let bearer: string;
      try {
        bearer = resolveBearerToken(input.bearer_token);
      } catch (e) {
        return mapError(e);
      }

      const windowDays = typeof input.window_days === "number" ? input.window_days : 30;
      const now = Date.now();
      const sinceIso = new Date(now - windowDays * MS_PER_DAY).toISOString();

      try {
        const thresholds = (await getAgentSettingsResolved(bearer)).risk_thresholds;
        const { access_token, auth_method } = await getHubSpotAccessToken(bearer);
        const client = new HubSpotClient(access_token, auth_method);
        const { openDeals, activities, owners } = await loadPipeline(client, {
          sinceIso,
          ownerId: input.owner_id,
        });
        const result = scanPipeline(openDeals, activities, owners, thresholds, windowDays, now);
        return ok(result);
      } catch (e) {
        return mapError(e);
      }
    },
  );

  server.registerTool(
    "crm_weekly_brief_compose",
    {
      title: "Compose a weekly sales brief",
      description:
        "Compose a structured weekly sales brief from last week's activities, current open deals, the pipeline risk scan, and per-rep aggregates. Pure data (no writes). Returns { week_ending, last_week_summary, this_week_priorities, stale_deals, deals_without_next_step, top_risks, per_rep_questions, suggested_bj_notes, action_items }. Pass the result to notion_publish_weekly_brief to draft it in Notion.",
      inputSchema: S.crmWeeklyBriefComposeSchema,
    },
    async (input) => {
      let bearer: string;
      try {
        bearer = resolveBearerToken(input.bearer_token);
      } catch (e) {
        return mapError(e);
      }

      const now = Date.now();
      const weekEnding = resolveWeekEnding(input.week_ending, now);
      // The brief looks back one week of activity.
      const sinceIso = new Date(now - 7 * MS_PER_DAY).toISOString();

      try {
        const resolved = await getAgentSettingsResolved(bearer);
        const thresholds = resolved.risk_thresholds;
        const { access_token, auth_method } = await getHubSpotAccessToken(bearer);
        const client = new HubSpotClient(access_token, auth_method);
        const { openDeals, activities, owners } = await loadPipeline(client, {
          sinceIso,
          ownerId: input.owner_id,
        });

        const scan = scanPipeline(openDeals, activities, owners, thresholds, 7, now);
        const brief = buildWeeklyBrief({
          weekEnding,
          openDeals,
          activities,
          owners,
          scan,
        });
        return ok(brief);
      } catch (e) {
        return mapError(e);
      }
    },
  );
}

// ── Weekly brief composition ─────────────────────────────────────────────────

/** Resolve the week-ending date: explicit ISO, else the most recent Sunday. */
function resolveWeekEnding(explicit: string | undefined, now: number): string {
  if (explicit && !Number.isNaN(Date.parse(explicit))) {
    return new Date(explicit).toISOString().slice(0, 10);
  }
  const d = new Date(now);
  const dow = d.getUTCDay(); // 0 = Sunday
  // Most recent Sunday (today if today is Sunday).
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

interface BuildBriefInput {
  weekEnding: string;
  openDeals: CrmDeal[];
  activities: CrmActivity[];
  owners: CrmOwner[];
  scan: PipelineScanResult;
}

interface ActionItem {
  owner_id: string | null;
  owner_name: string | null;
  task: string;
  due: string;
}

interface WeeklyBrief {
  week_ending: string;
  last_week_summary: {
    activities_logged: number;
    by_type: Record<string, number>;
    open_deals: number;
    open_pipeline_value_eur: number;
  };
  this_week_priorities: string[];
  stale_deals: Array<{ deal_id: string; dealname: string | null; days_inactive: number | null }>;
  deals_without_next_step: Array<{ deal_id: string; dealname: string | null; owner_id: string | null }>;
  top_risks: FlaggedDeal[];
  per_rep_questions: Record<string, string[]>;
  suggested_bj_notes: string[];
  action_items: ActionItem[];
  per_rep_aggregates: Record<
    string,
    { owner_name: string | null; deals: number; amount_eur: number; activities: number }
  >;
}

function buildWeeklyBrief(input: BuildBriefInput): WeeklyBrief {
  const { weekEnding, openDeals, activities, owners, scan } = input;
  const ownerById = new Map(owners.map((o) => [o.id, o]));

  // Activity tallies.
  const byType: Record<string, number> = {};
  for (const a of activities) byType[a.type] = (byType[a.type] ?? 0) + 1;

  const openPipelineValue = openDeals.reduce((sum, d) => sum + (d.amount ?? 0), 0);

  // Per-rep aggregates: deals/amount/activities.
  const perRep: WeeklyBrief["per_rep_aggregates"] = {};
  const ensureRep = (id: string) => {
    if (!perRep[id]) {
      perRep[id] = {
        owner_name: ownerName(ownerById.get(id)),
        deals: 0,
        amount_eur: 0,
        activities: 0,
      };
    }
    return perRep[id];
  };
  for (const d of openDeals) {
    if (!d.ownerId) continue;
    const r = ensureRep(d.ownerId);
    r.deals += 1;
    r.amount_eur += d.amount ?? 0;
  }
  for (const a of activities) {
    if (!a.ownerId) continue;
    ensureRep(a.ownerId).activities += 1;
  }

  // Stale deals (flagged with a real inactivity number), sorted oldest first.
  const staleDeals = scan.flagged
    .filter((f) => f.days_inactive != null)
    .sort((a, b) => (b.days_inactive ?? 0) - (a.days_inactive ?? 0))
    .slice(0, 10)
    .map((f) => ({ deal_id: f.deal_id, dealname: f.dealname, days_inactive: f.days_inactive }));

  const dealsWithoutNextStep = openDeals
    .filter((d) => !d.nextStep)
    .map((d) => ({ deal_id: d.id, dealname: d.dealname, owner_id: d.ownerId }));

  const topRisks = scan.flagged.slice(0, 5);

  // Per-rep questions BJ should ask each owner.
  const perRepQuestions: Record<string, string[]> = {};
  for (const f of scan.flagged) {
    const key = f.owner_id ?? "unassigned";
    if (!perRepQuestions[key]) perRepQuestions[key] = [];
    const dealLabel = f.dealname ?? f.deal_id;
    if (f.close_date_slipping) {
      perRepQuestions[key].push(`Is "${dealLabel}" still live? Its close date has passed.`);
    } else if (f.days_inactive != null) {
      perRepQuestions[key].push(
        `What's the next step on "${dealLabel}"? No activity for ${f.days_inactive} days.`,
      );
    }
    if (f.missing_fields.includes("next_step")) {
      perRepQuestions[key].push(`Can you set a next step on "${dealLabel}"?`);
    }
  }

  // This-week priorities: top risks + stale + missing-next-step counts.
  const thisWeekPriorities: string[] = [];
  if (topRisks.length > 0) {
    thisWeekPriorities.push(
      `Review ${topRisks.length} high-risk deal(s): ${topRisks
        .map((r) => r.dealname ?? r.deal_id)
        .join(", ")}.`,
    );
  }
  if (staleDeals.length > 0) {
    thisWeekPriorities.push(`Re-engage ${staleDeals.length} stale deal(s).`);
  }
  if (dealsWithoutNextStep.length > 0) {
    thisWeekPriorities.push(
      `Set a next step on ${dealsWithoutNextStep.length} deal(s) currently missing one.`,
    );
  }

  // Suggested BJ notes — talking points for the weekly sync.
  const suggestedBjNotes: string[] = [];
  suggestedBjNotes.push(
    `${openDeals.length} open deal(s) worth €${openPipelineValue.toLocaleString("en-US")} in the pipeline.`,
  );
  suggestedBjNotes.push(`${activities.length} activities logged in the last week.`);
  if (scan.flagged.length > 0) {
    suggestedBjNotes.push(`${scan.flagged.length} deal(s) flagged for risk follow-up.`);
  }

  // Action items: one per top risk, due by week_ending.
  const actionItems: ActionItem[] = topRisks.map((f) => ({
    owner_id: f.owner_id,
    owner_name: f.owner_name,
    task: `Follow up on "${f.dealname ?? f.deal_id}" (risk ${f.risk_score}): ${f.suggested_nudge_draft}`,
    due: weekEnding,
  }));

  return {
    week_ending: weekEnding,
    last_week_summary: {
      activities_logged: activities.length,
      by_type: byType,
      open_deals: openDeals.length,
      open_pipeline_value_eur: openPipelineValue,
    },
    this_week_priorities: thisWeekPriorities,
    stale_deals: staleDeals,
    deals_without_next_step: dealsWithoutNextStep,
    top_risks: topRisks,
    per_rep_questions: perRepQuestions,
    suggested_bj_notes: suggestedBjNotes,
    action_items: actionItems,
    per_rep_aggregates: perRep,
  };
}

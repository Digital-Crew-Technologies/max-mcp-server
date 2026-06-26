// CRM forecast change detection (the assistant Task M-F1):
//   • crm_detect_forecast_changes — diff current open deals against a prior
//     snapshot (amount, stage, close_date), surfacing material changes.
//
// Depends on max-agent's crm_deal_snapshots table, exposed via
//   GET /api/v1/crm/deal-snapshots?at=<iso>
// which returns the most recent snapshot per deal AT OR BEFORE the given
// timestamp. If that endpoint is not yet live the tool returns a clear error
// envelope (snapshot data unavailable) — acceptable for V1.
// ⚠️ Server-only.

import {
  apiUrl,
  authHeaders,
  fetchWithRetry,
  resolveBearerToken,
  responseBodyText,
  type McpServer,
} from "../shared";
import * as S from "./schema";
import { HubSpotClient } from "./hubspot-client";
import { getHubSpotAccessToken } from "./token-resolver";
import type { CrmDeal, CrmOwner, CrmPipelineStage } from "./hubspot-client.types";

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
  if (msg.startsWith("HUBSPOT_TOKEN_FETCH_FAILED")) {
    return err(msg);
  }
  if (msg.startsWith("DEAL_SNAPSHOT_FETCH_FAILED")) {
    return err(msg);
  }
  const cls = e instanceof Error ? e.name : "Error";
  return err(`${cls}: ${msg}`);
}

// ── Snapshot shape ──────────────────────────────────────────────────────────

/**
 * One row from max-agent's crm_deal_snapshots, as returned via
 * GET /api/v1/crm/deal-snapshots?at=<iso>. All fields are tolerated as
 * optional; we resolve them defensively at use-time.
 */
export interface DealSnapshot {
  deal_id: string;
  snapshot_at: string | null;
  dealname: string | null;
  amount: number | null;
  owner_id: string | null;
  stage_id: string | null;
  pipeline_id: string | null;
  close_date: string | null;
}

function s(v: unknown): string | null {
  return v == null ? null : String(v);
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function mapSnapshot(r: Record<string, unknown>): DealSnapshot {
  return {
    deal_id: String(r.deal_id ?? r.dealId ?? r.id ?? ""),
    snapshot_at: s(r.snapshot_at ?? r.snapshotAt ?? r.captured_at),
    dealname: s(r.dealname ?? r.deal_name),
    amount: num(r.amount),
    owner_id: s(r.owner_id ?? r.ownerId ?? r.hubspot_owner_id),
    stage_id: s(r.stage_id ?? r.stageId ?? r.dealstage),
    pipeline_id: s(r.pipeline_id ?? r.pipelineId ?? r.pipeline),
    close_date: s(r.close_date ?? r.closeDate ?? r.closedate),
  };
}

/**
 * Fetch the most-recent-per-deal snapshot AT OR BEFORE the given ISO timestamp
 * from max-agent. Throws DEAL_SNAPSHOT_FETCH_FAILED on any non-OK response (the
 * caller maps that to the standard MCP error envelope).
 */
export async function getDealSnapshotsAt(
  maxBearer: string,
  atIso: string,
): Promise<DealSnapshot[]> {
  const url = `${apiUrl("/api/v1/crm/deal-snapshots")}?at=${encodeURIComponent(atIso)}`;
  let res: Response;
  try {
    res = await fetchWithRetry(url, {
      method: "GET",
      headers: authHeaders(maxBearer),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`DEAL_SNAPSHOT_FETCH_FAILED: ${msg}`);
  }
  if (!res.ok) {
    const body = await responseBodyText(res);
    throw new Error(
      `DEAL_SNAPSHOT_FETCH_FAILED: ${res.status} ${body || res.statusText}`,
    );
  }
  const body = await responseBodyText(res);
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error(`DEAL_SNAPSHOT_FETCH_FAILED: invalid JSON from snapshot endpoint`);
  }

  // Accept either { data: [...] } or { snapshots: [...] } or bare array.
  let rows: unknown;
  if (Array.isArray(parsed)) {
    rows = parsed;
  } else if (parsed && typeof parsed === "object") {
    const p = parsed as Record<string, unknown>;
    rows = p.data ?? p.snapshots ?? p.results ?? null;
  } else {
    rows = null;
  }
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
    .map(mapSnapshot)
    .filter((s) => s.deal_id !== "");
}

// ── Change detection ─────────────────────────────────────────────────────────

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function ownerName(o: CrmOwner | undefined): string | null {
  if (!o) return null;
  return [o.firstName, o.lastName].filter(Boolean).join(" ") || o.email || null;
}

function parseMs(v: string | null): number | null {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
}

type StageMovement = "forward" | "backward" | "unknown";

function classifyStageMovement(
  priorStageId: string | null,
  currentStageId: string | null,
  stages: CrmPipelineStage[],
): StageMovement {
  if (!priorStageId || !currentStageId || priorStageId === currentStageId) return "unknown";
  const prior = stages.find((s) => s.id === priorStageId);
  const curr = stages.find((s) => s.id === currentStageId);
  if (!prior || !curr) return "unknown";
  if (prior.displayOrder == null || curr.displayOrder == null) return "unknown";
  return curr.displayOrder > prior.displayOrder ? "forward" : "backward";
}

export interface ForecastChange {
  deal_id: string;
  dealname: string | null;
  owner_id: string | null;
  owner_name: string | null;
  amount: number | null;
  prior_amount: number | null;
  amount_delta_pct: number | null;
  stage: string | null;
  prior_stage: string | null;
  stage_movement: StageMovement | null;
  close_date: string | null;
  prior_close_date: string | null;
  close_date_slip_days: number | null;
  flag_reasons: string[];
}

export interface ForecastChangesResult {
  window_days: number;
  baseline_iso: string;
  current_iso: string;
  changes: ForecastChange[];
}

interface DetectOpts {
  minAmountDeltaPct: number;
  minCloseDateSlipDays: number;
}

export function detectForecastChanges(
  currentDeals: CrmDeal[],
  priorSnapshots: DealSnapshot[],
  owners: CrmOwner[],
  stages: CrmPipelineStage[],
  opts: DetectOpts,
): ForecastChange[] {
  const ownerById = new Map(owners.map((o) => [o.id, o]));
  const priorById = new Map(priorSnapshots.map((p) => [p.deal_id, p]));
  const currentIds = new Set(currentDeals.map((d) => d.id));
  const changes: ForecastChange[] = [];

  for (const d of currentDeals) {
    const prior = priorById.get(d.id);
    const reasons: string[] = [];

    let amountDeltaPct: number | null = null;
    let priorAmount: number | null = null;
    if (prior) {
      priorAmount = prior.amount;
      if (prior.amount != null && prior.amount !== 0 && d.amount != null) {
        amountDeltaPct = ((d.amount - prior.amount) / prior.amount) * 100;
        if (Math.abs(amountDeltaPct) > opts.minAmountDeltaPct) {
          reasons.push("amount_changed");
        }
      } else if (prior.amount == null && d.amount != null) {
        reasons.push("amount_set");
      } else if (prior.amount != null && d.amount == null) {
        reasons.push("amount_cleared");
      }
    }

    let stageMovement: StageMovement | null = null;
    let priorStage: string | null = null;
    if (prior) {
      priorStage = prior.stage_id;
      if (prior.stage_id && d.stage && prior.stage_id !== d.stage) {
        stageMovement = classifyStageMovement(prior.stage_id, d.stage, stages);
        reasons.push(
          stageMovement === "backward" ? "stage_moved_backward" : "stage_moved_forward",
        );
      }
    }

    let closeSlipDays: number | null = null;
    let priorCloseDate: string | null = null;
    if (prior) {
      priorCloseDate = prior.close_date;
      const priorMs = parseMs(prior.close_date);
      const currMs = parseMs(d.closeDate);
      if (priorMs != null && currMs != null) {
        closeSlipDays = Math.floor((currMs - priorMs) / MS_PER_DAY);
        if (closeSlipDays > opts.minCloseDateSlipDays) {
          reasons.push("close_date_slipped");
        }
      }
    }

    if (!prior) {
      reasons.push("new_deal_since_last_snapshot");
    }

    if (reasons.length === 0) continue;

    changes.push({
      deal_id: d.id,
      dealname: d.dealname,
      owner_id: d.ownerId,
      owner_name: ownerName(d.ownerId ? ownerById.get(d.ownerId) : undefined),
      amount: d.amount,
      prior_amount: priorAmount,
      amount_delta_pct: amountDeltaPct,
      stage: d.stage,
      prior_stage: priorStage,
      stage_movement: stageMovement,
      close_date: d.closeDate,
      prior_close_date: priorCloseDate,
      close_date_slip_days: closeSlipDays,
      flag_reasons: reasons,
    });
  }

  // Missing-now: prior snapshot exists but the deal isn't in the current open list.
  for (const prior of priorSnapshots) {
    if (currentIds.has(prior.deal_id)) continue;
    changes.push({
      deal_id: prior.deal_id,
      dealname: prior.dealname,
      owner_id: prior.owner_id,
      owner_name: ownerName(prior.owner_id ? ownerById.get(prior.owner_id) : undefined),
      amount: null,
      prior_amount: prior.amount,
      amount_delta_pct: null,
      stage: null,
      prior_stage: prior.stage_id,
      stage_movement: null,
      close_date: null,
      prior_close_date: prior.close_date,
      close_date_slip_days: null,
      flag_reasons: ["deal_closed_or_disappeared"],
    });
  }

  return changes;
}

// ── Tool registration ────────────────────────────────────────────────────────

export function registerCrmForecastTools(server: McpServer): void {
  server.registerTool(
    "crm_detect_forecast_changes",
    {
      title: "Detect forecast changes vs prior snapshot",
      description:
        "Compare current open HubSpot deals against the workspace's deal snapshot from window_days ago (read from max-agent's crm_deal_snapshots via GET /api/v1/crm/deal-snapshots). Flags amount changes (abs delta pct > threshold), stage moves (forward/backward via pipeline displayOrder), close-date slips (> threshold days), new deals since last snapshot, and deals that disappeared. Returns { window_days, baseline_iso, current_iso, changes:[{ deal_id, dealname, owner_id, owner_name, amount, prior_amount, amount_delta_pct, stage, prior_stage, stage_movement, close_date, prior_close_date, close_date_slip_days, flag_reasons[] }] }.",
      inputSchema: S.crmDetectForecastChangesSchema,
    },
    async (input) => {
      let bearer: string;
      try {
        bearer = resolveBearerToken(input.bearer_token);
      } catch (e) {
        return mapError(e);
      }

      const windowDays = typeof input.window_days === "number" ? input.window_days : 7;
      const minAmountDeltaPct =
        typeof input.min_amount_delta_pct === "number" ? input.min_amount_delta_pct : 10;
      const minCloseDateSlipDays =
        typeof input.min_close_date_slip_days === "number"
          ? input.min_close_date_slip_days
          : 7;

      const now = Date.now();
      const baselineIso = new Date(now - windowDays * MS_PER_DAY).toISOString();
      const currentIso = new Date(now).toISOString();

      try {
        const { access_token, auth_method } = await getHubSpotAccessToken(bearer);
        const client = new HubSpotClient(access_token, auth_method);
        const [currentDeals, priorSnapshots, owners, stages] = await Promise.all([
          client.listDeals(input.owner_id ? { ownerId: input.owner_id } : {}),
          getDealSnapshotsAt(bearer, baselineIso),
          client.listOwners(),
          client.listPipelineStages(),
        ]);

        // Restrict snapshots to the owner filter if provided — snapshots may
        // pre-date the filter, so apply it client-side for consistency.
        const filteredPrior = input.owner_id
          ? priorSnapshots.filter((p) => p.owner_id === input.owner_id)
          : priorSnapshots;

        const changes = detectForecastChanges(
          currentDeals,
          filteredPrior,
          owners,
          stages,
          { minAmountDeltaPct, minCloseDateSlipDays },
        );

        const result: ForecastChangesResult = {
          window_days: windowDays,
          baseline_iso: baselineIso,
          current_iso: currentIso,
          changes,
        };
        return ok(result);
      } catch (e) {
        return mapError(e);
      }
    },
  );
}

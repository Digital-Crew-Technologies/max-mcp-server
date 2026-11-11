// HubSpot reads through max-agent's scoped CRM routes.
//
// max-agent keeps the workspace's HubSpot credentials server-side and never
// returns them to API callers (the old GET /api/v1/crm/access-token is gone).
// It serves these reads instead, each gated by the `crm:read` scope:
//   POST /api/v1/crm/list-deals        GET /api/v1/crm/list-owners
//   POST /api/v1/crm/get-deal          GET /api/v1/crm/list-pipeline-stages
//   POST /api/v1/crm/list-activities
// Each answers { data } with max-agent's CRM shapes; deals carry `name`, which
// is mapped to this server's `dealname`.
//
// Errors use the messages the CRM tools already map:
//   409 crm_not_connected     → "HUBSPOT_NOT_CONNECTED"
//   409 crm_reauth_required   → a "reconnect HubSpot" message
//   anything else             → "HubSpot read failed (<status>): <detail>"

import { apiUrl, authHeaders, fetchWithRetry, responseBodyText } from "../shared";
import { sanitizeUpstreamError } from "@/shared/http/response";
import type {
  CrmActivity,
  CrmDeal,
  CrmOwner,
  CrmPipelineStage,
  ListActivitiesFilters,
  ListDealsFilters,
} from "./hubspot-client.types";

/** The HubSpot reads the CRM tools, composers and forecast use. */
export interface CrmReader {
  listDeals(filters?: ListDealsFilters): Promise<CrmDeal[]>;
  getDeal(id: string): Promise<CrmDeal | null>;
  listActivities(filters?: ListActivitiesFilters): Promise<CrmActivity[]>;
  listOwners(): Promise<CrmOwner[]>;
  listPipelineStages(pipelineId?: string): Promise<CrmPipelineStage[]>;
}

export const HUBSPOT_REAUTH_MESSAGE =
  "The HubSpot connection has expired. Reconnect HubSpot in workspace settings, then retry.";

/** max-agent's deal shape (`name`, optional fields). */
type MaxCrmDeal = {
  id: string;
  name?: string | null;
  amount?: number | null;
  ownerId?: string | null;
  stage?: string | null;
  pipeline?: string | null;
  closeDate?: string | null;
  lastModified?: string | null;
  lastActivityDate?: string | null;
  nextStep?: string | null;
  associatedCompanyIds?: string[];
  associatedContactIds?: string[];
  raw?: Record<string, unknown>;
};

export function toCrmDeal(d: MaxCrmDeal): CrmDeal {
  return {
    id: String(d.id),
    dealname: d.name ?? null,
    amount: d.amount ?? null,
    ownerId: d.ownerId ?? null,
    stage: d.stage ?? null,
    pipeline: d.pipeline ?? null,
    closeDate: d.closeDate ?? null,
    lastModified: d.lastModified ?? null,
    lastActivityDate: d.lastActivityDate ?? null,
    nextStep: d.nextStep ?? null,
    associatedCompanyIds: d.associatedCompanyIds ?? [],
    associatedContactIds: d.associatedContactIds ?? [],
    ...(d.raw ? { raw: d.raw } : {}),
  };
}

// Reads change nothing, so a lost answer is safe to ask for again.
const READ_CONFIG = { timeoutMs: 60_000, retryNonIdempotent: true };

export class MaxCrmReader implements CrmReader {
  constructor(private readonly token: string) {}

  private async read<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    const res = await fetchWithRetry(
      apiUrl(path),
      body === undefined
        ? { headers: authHeaders(this.token) }
        : { method: "POST", headers: authHeaders(this.token), body: JSON.stringify(body) },
      READ_CONFIG,
    );
    const text = await responseBodyText(res);
    if (res.ok) {
      try {
        return (JSON.parse(text) as { data: T }).data;
      } catch {
        throw new Error(`HubSpot read failed: invalid JSON from ${path}`);
      }
    }
    if (res.status === 409) {
      throw new Error(
        text.includes("crm_reauth_required") ? HUBSPOT_REAUTH_MESSAGE : "HUBSPOT_NOT_CONNECTED",
      );
    }
    const detail = text ? sanitizeUpstreamError(text) : res.statusText;
    throw new Error(`HubSpot read failed (${res.status}): ${detail}`);
  }

  async listDeals(filters: ListDealsFilters = {}): Promise<CrmDeal[]> {
    const deals = await this.read<MaxCrmDeal[]>("/api/v1/crm/list-deals", { ...filters });
    return (deals ?? []).map(toCrmDeal);
  }

  async getDeal(id: string): Promise<CrmDeal | null> {
    const deal = await this.read<MaxCrmDeal | null>("/api/v1/crm/get-deal", { id });
    return deal ? toCrmDeal(deal) : null;
  }

  async listActivities(filters: ListActivitiesFilters = {}): Promise<CrmActivity[]> {
    return (await this.read<CrmActivity[]>("/api/v1/crm/list-activities", { ...filters })) ?? [];
  }

  async listOwners(): Promise<CrmOwner[]> {
    return (await this.read<CrmOwner[]>("/api/v1/crm/list-owners")) ?? [];
  }

  async listPipelineStages(pipelineId?: string): Promise<CrmPipelineStage[]> {
    const query = pipelineId ? `?pipelineId=${encodeURIComponent(pipelineId)}` : "";
    return (await this.read<CrmPipelineStage[]>(`/api/v1/crm/list-pipeline-stages${query}`)) ?? [];
  }
}

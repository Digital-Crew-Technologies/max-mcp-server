// Typed readers over max-agent's scoped CRM read routes, for the tools that
// compute over CRM data (risk scan, weekly brief, forecast changes, prospect
// assignment). The single-read crm_* tools pass the route response through
// instead (see tools.ts).
// ⚠️ Server-only.

import { responseBodyText, sanitizeUpstreamError } from "@/shared/http/response";
import * as repo from "./repository";
import type {
  CrmActivity,
  CrmDeal,
  CrmOwner,
  CrmPipelineStage,
  ListActivitiesFilters,
  ListDealsFilters,
} from "./types";

export class CrmReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CrmReadError";
  }
}

/**
 * Unwrap the `{ data: [...] }` list of a CRM read route. A 409 throws
 * HUBSPOT_NOT_CONNECTED, which every CRM tool maps to the connect-HubSpot
 * message; any other failure throws a CrmReadError carrying max-agent's
 * (already provider-safe) error text.
 */
async function readList<T>(request: Promise<Response>): Promise<T[]> {
  const res = await request;
  const text = await responseBodyText(res);
  if (res.status === 409) throw new Error("HUBSPOT_NOT_CONNECTED");
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  if (!res.ok) {
    const error = (parsed as { error?: unknown } | null)?.error;
    const detail =
      typeof error === "string" ? error : text ? sanitizeUpstreamError(text) : res.statusText;
    throw new CrmReadError(`HubSpot read failed (${res.status}): ${detail}`);
  }
  const data = (parsed as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) {
    throw new CrmReadError("HubSpot read failed: max-agent returned an unexpected response.");
  }
  return data as T[];
}

export function fetchDeals(bearer: string, filters: ListDealsFilters = {}): Promise<CrmDeal[]> {
  return readList<CrmDeal>(repo.listDeals(bearer, { ...filters }));
}

export function fetchActivities(
  bearer: string,
  filters: ListActivitiesFilters = {},
): Promise<CrmActivity[]> {
  return readList<CrmActivity>(repo.listActivities(bearer, { ...filters }));
}

export function fetchOwners(bearer: string): Promise<CrmOwner[]> {
  return readList<CrmOwner>(repo.listOwners(bearer));
}

export function fetchPipelineStages(
  bearer: string,
  pipelineId?: string,
): Promise<CrmPipelineStage[]> {
  return readList<CrmPipelineStage>(repo.listPipelineStages(bearer, pipelineId));
}

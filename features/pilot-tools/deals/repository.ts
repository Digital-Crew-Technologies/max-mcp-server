import { apiUrl, authHeaders, buildQuery, fetchWithRetry } from "../shared";

/**
 * Query params for GET /api/v1/deals. Mixed casing because that is what
 * max-agent's handler parses (snake_case domain filters, camelCase paging —
 * the same split its own web client uses); the tool layer takes snake_case
 * args and maps them here.
 *
 * There is no workspaceId field, deliberately: max-agent derives the workspace
 * from the bearer and ignores anything a caller sends. See schema.ts.
 */
export type ListDealsParams = {
  pipeline_id?: string;
  stage_id?: string;
  status?: string;
  owner_id?: string;
  organization_id?: string;
  /** Filter WITHIN the authenticated workspace — never a tenant selector. */
  prospect_id?: string;
  search?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: string;
};

/**
 * GET /api/v1/deals — paginated deal list with the joined organization
 * summary and contacts.
 *
 * 200 → { data: DealWithRelations[], count, page, pageSize }
 */
export async function listDeals(
  token: string,
  params: ListDealsParams = {},
): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/deals${buildQuery(params)}`), {
    headers: authHeaders(token),
  });
}

/**
 * GET /api/v1/deals/:id — one deal in full (organization + contacts).
 *
 * 200 → { data: DealWithRelations } | 404 → { error: "Deal not found" }
 *
 * A deal in another workspace reads back as 404, never 403.
 */
export async function getDeal(token: string, id: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/deals/${id}`), {
    headers: authHeaders(token),
  });
}

/**
 * POST /api/v1/deals — create a deal. Stage defaults to the pipeline's first
 * open column; pipeline defaults to the workspace default (seeded lazily).
 *
 * 201 → { data: Deal } | 400 invalid body / custom-field validation.
 */
export async function createDeal(
  token: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/deals`), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

/**
 * PATCH /api/v1/deals/:id — edit fields. Stage moves go through move/win/lose,
 * never through this route.
 *
 * 200 → { data: Deal } | 400 invalid body | 404 not found.
 */
export async function updateDeal(
  token: string,
  id: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/deals/${id}`), {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

/**
 * POST /api/v1/deals/:id/move — move to another stage (any pipeline). Records
 * a stage event, syncs status/won_at/lost_at from the stage type, and fires
 * the destination stage's entry-automation rules.
 *
 * 200 → { data: Deal } | 400 unknown stage | 404 not found.
 */
export async function moveDealStage(
  token: string,
  id: string,
  stageId: string,
): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/deals/${id}/move`), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ stage_id: stageId }),
  });
}

/**
 * POST /api/v1/deals/:id/win — shortcut: move to the pipeline's won stage.
 *
 * 200 → { data: Deal } | 404 not found | 409 no won stage on the pipeline.
 */
export async function winDeal(token: string, id: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/deals/${id}/win`), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({}),
  });
}

/**
 * POST /api/v1/deals/:id/lose — shortcut: move to the pipeline's lost stage,
 * optionally recording why.
 *
 * 200 → { data: Deal } | 404 not found | 409 no lost stage on the pipeline.
 */
export async function loseDeal(
  token: string,
  id: string,
  lostReason?: string,
): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/deals/${id}/lose`), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(lostReason ? { lost_reason: lostReason } : {}),
  });
}

/**
 * GET /api/v1/deals/:id/stage-events — the deal's append-only stage history,
 * newest first.
 *
 * 200 → { data: DealStageEvent[] } | 404 not found.
 */
export async function listStageEvents(
  token: string,
  id: string,
): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/deals/${id}/stage-events`), {
    headers: authHeaders(token),
  });
}

/**
 * POST /api/v1/deals/:id/prospects — associate a prospect as a deal contact.
 *
 * 201 → { data: DealProspect } | 404 deal or prospect not found | 409 already
 * associated.
 */
export async function addContact(
  token: string,
  id: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/deals/${id}/prospects`), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

/**
 * DELETE /api/v1/deals/:id/prospects/:prospectId — remove a deal contact.
 * Only the association is removed — the prospect record is untouched.
 *
 * 200 → { success: true } | 404 deal or association not found.
 */
export async function removeContact(
  token: string,
  id: string,
  prospectId: string,
): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/deals/${id}/prospects/${prospectId}`), {
    method: "DELETE",
    headers: authHeaders(token),
  });
}

/**
 * GET /api/v1/deals/board-totals?pipeline_id= — per-stage counts and amount
 * sums (per currency, raw + probability-weighted) for board headers.
 *
 * 200 → { data: Record<stageId, { count, sums: [{currency, amount, weighted}] }> }
 */
export async function boardTotals(
  token: string,
  pipelineId: string,
): Promise<Response> {
  return fetchWithRetry(
    apiUrl(`/api/v1/deals/board-totals${buildQuery({ pipeline_id: pipelineId })}`),
    { headers: authHeaders(token) },
  );
}

/**
 * GET /api/v1/deals/pipelines — the workspace's pipelines with their ordered
 * stages. Seeds the default "Sales pipeline" on first read.
 *
 * 200 → { data: DealPipeline[] } (each with stages: DealStage[]).
 */
export async function listPipelines(
  token: string,
  includeArchived?: boolean,
): Promise<Response> {
  const qs = buildQuery({ includeArchived: includeArchived ? "true" : undefined });
  return fetchWithRetry(apiUrl(`/api/v1/deals/pipelines${qs}`), {
    headers: authHeaders(token),
  });
}

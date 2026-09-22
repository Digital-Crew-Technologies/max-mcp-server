import { apiUrl, authHeaders, buildQuery, fetchWithRetry } from "../shared";

// Max's NATIVE deals pipeline (max-agent /api/v1/deals/**), the sales catalog
// (/api/v1/sales-catalog/**) and the sales-workspace map. Every route runs
// authenticateWorkspaceWithScope(deals:read|deals:write, or workspace:read for
// the map) and accepts scoped workspace API keys; an API key's assigned role,
// when it has one, can further restrict objects/fields.
//
// Creates are not idempotent upstream, so they never retry: a retried POST
// after a timeout could duplicate the deal / pipeline / stage / rule / item.

const NO_RETRY = { maxRetries: 0 };

type Body = Record<string, unknown>;
type Params = Record<string, unknown>;

const enc = encodeURIComponent;

function get(token: string, path: string): Promise<Response> {
  return fetchWithRetry(apiUrl(path), { headers: authHeaders(token) });
}

function send(
  token: string,
  method: "POST" | "PATCH" | "DELETE",
  path: string,
  body?: Body,
  config?: { maxRetries?: number; timeoutMs?: number },
): Promise<Response> {
  return fetchWithRetry(
    apiUrl(path),
    {
      method,
      headers: authHeaders(token),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    },
    config,
  );
}

// ── Deals ─────────────────────────────────────────────────────────────────

export async function listDeals(token: string, params: Params): Promise<Response> {
  return get(token, `/api/v1/deals${buildQuery(params)}`);
}

export async function createDeal(token: string, body: Body): Promise<Response> {
  return send(token, "POST", `/api/v1/deals`, body, NO_RETRY);
}

export async function getDeal(token: string, dealId: string): Promise<Response> {
  return get(token, `/api/v1/deals/${enc(dealId)}`);
}

export async function updateDeal(token: string, dealId: string, body: Body): Promise<Response> {
  return send(token, "PATCH", `/api/v1/deals/${enc(dealId)}`, body);
}

export async function deleteDeal(token: string, dealId: string): Promise<Response> {
  return send(token, "DELETE", `/api/v1/deals/${enc(dealId)}`);
}

export async function getDealBoardTotals(token: string, params: Params): Promise<Response> {
  return get(token, `/api/v1/deals/board-totals${buildQuery(params)}`);
}

export async function moveDeal(token: string, dealId: string, stageId: string): Promise<Response> {
  return send(token, "POST", `/api/v1/deals/${enc(dealId)}/move`, { stage_id: stageId });
}

export async function winDeal(token: string, dealId: string): Promise<Response> {
  return send(token, "POST", `/api/v1/deals/${enc(dealId)}/win`, {});
}

export async function loseDeal(token: string, dealId: string, body: Body): Promise<Response> {
  return send(token, "POST", `/api/v1/deals/${enc(dealId)}/lose`, body);
}

export async function listDealStageEvents(token: string, dealId: string): Promise<Response> {
  return get(token, `/api/v1/deals/${enc(dealId)}/stage-events`);
}

export async function addDealProspect(token: string, dealId: string, body: Body): Promise<Response> {
  return send(token, "POST", `/api/v1/deals/${enc(dealId)}/prospects`, body);
}

export async function removeDealProspect(
  token: string,
  dealId: string,
  prospectId: string,
): Promise<Response> {
  return send(token, "DELETE", `/api/v1/deals/${enc(dealId)}/prospects/${enc(prospectId)}`);
}

// ── Pipelines & stages ────────────────────────────────────────────────────

export async function listDealPipelines(token: string, params: Params): Promise<Response> {
  return get(token, `/api/v1/deals/pipelines${buildQuery(params)}`);
}

export async function createDealPipeline(token: string, body: Body): Promise<Response> {
  return send(token, "POST", `/api/v1/deals/pipelines`, body, NO_RETRY);
}

export async function updateDealPipeline(token: string, pipelineId: string, body: Body): Promise<Response> {
  return send(token, "PATCH", `/api/v1/deals/pipelines/${enc(pipelineId)}`, body);
}

export async function deleteDealPipeline(token: string, pipelineId: string): Promise<Response> {
  return send(token, "DELETE", `/api/v1/deals/pipelines/${enc(pipelineId)}`);
}

export async function createDealStage(token: string, body: Body): Promise<Response> {
  return send(token, "POST", `/api/v1/deals/stages`, body, NO_RETRY);
}

export async function updateDealStage(token: string, stageId: string, body: Body): Promise<Response> {
  return send(token, "PATCH", `/api/v1/deals/stages/${enc(stageId)}`, body);
}

export async function deleteDealStage(
  token: string,
  stageId: string,
  params: Params,
): Promise<Response> {
  return send(token, "DELETE", `/api/v1/deals/stages/${enc(stageId)}${buildQuery(params)}`);
}

export async function reorderDealStages(token: string, body: Body): Promise<Response> {
  return send(token, "PATCH", `/api/v1/deals/stages/reorder`, body);
}

// ── Stage entry-automation rules ──────────────────────────────────────────

export async function listDealStageRules(token: string, stageId: string): Promise<Response> {
  return get(token, `/api/v1/deals/stages/${enc(stageId)}/rules`);
}

export async function createDealStageRule(token: string, stageId: string, body: Body): Promise<Response> {
  return send(token, "POST", `/api/v1/deals/stages/${enc(stageId)}/rules`, body, NO_RETRY);
}

export async function updateDealStageRule(token: string, ruleId: string, body: Body): Promise<Response> {
  return send(token, "PATCH", `/api/v1/deals/rules/${enc(ruleId)}`, body);
}

export async function deleteDealStageRule(token: string, ruleId: string): Promise<Response> {
  return send(token, "DELETE", `/api/v1/deals/rules/${enc(ruleId)}`);
}

// ── Attachments (metadata only — no upload / byte download) ───────────────

export async function listDealAttachments(token: string, dealId: string): Promise<Response> {
  return get(token, `/api/v1/deals/${enc(dealId)}/attachments`);
}

export async function deleteDealAttachment(
  token: string,
  dealId: string,
  attachmentId: string,
): Promise<Response> {
  return send(token, "DELETE", `/api/v1/deals/${enc(dealId)}/attachments/${enc(attachmentId)}`);
}

// ── Sales workspace & catalog ─────────────────────────────────────────────

export async function getSalesWorkspace(token: string, params: Params): Promise<Response> {
  return get(token, `/api/v1/sales-workspace${buildQuery(params)}`);
}

export async function listSalesCatalogItems(token: string, params: Params): Promise<Response> {
  return get(token, `/api/v1/sales-catalog${buildQuery(params)}`);
}

export async function createSalesCatalogItem(token: string, body: Body): Promise<Response> {
  return send(token, "POST", `/api/v1/sales-catalog`, body, NO_RETRY);
}

export async function updateSalesCatalogItem(token: string, itemId: string, body: Body): Promise<Response> {
  return send(token, "PATCH", `/api/v1/sales-catalog/${enc(itemId)}`, body);
}

export async function listSalesCatalogFields(token: string): Promise<Response> {
  return get(token, `/api/v1/sales-catalog/fields`);
}

export async function createSalesCatalogField(token: string, body: Body): Promise<Response> {
  return send(token, "POST", `/api/v1/sales-catalog/fields`, body, NO_RETRY);
}

export async function listDealLineItems(token: string, dealId: string): Promise<Response> {
  return get(token, `/api/v1/sales-catalog/deals/${enc(dealId)}/items`);
}

export async function addDealLineItem(token: string, dealId: string, body: Body): Promise<Response> {
  return send(token, "POST", `/api/v1/sales-catalog/deals/${enc(dealId)}/items`, body, NO_RETRY);
}

export async function removeDealLineItem(
  token: string,
  dealId: string,
  lineItemId: string,
): Promise<Response> {
  return send(
    token,
    "DELETE",
    `/api/v1/sales-catalog/deals/${enc(dealId)}/items/${enc(lineItemId)}`,
  );
}

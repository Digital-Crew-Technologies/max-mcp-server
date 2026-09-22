import { apiUrl, authHeaders, buildQuery, fetchWithRetry } from "../shared";

// Pipeline automation: workspace pipelines (funnels), their columns (stages),
// per-column on-enter rules, pipeline links, campaign outcome routes, canvas
// placements, the journey canvas read model, and reviewed Production change
// sets ("canvas drafts"). All calls go through max-agent's /api/v1/pipeline/*
// routes, which accept a scoped workspace API key (prospects:read / :write)
// plus the workspace Pipeline (manage) permission for JWT callers.
//
// Non-idempotent creates run with retries off: a retried POST after a network
// blip would add a duplicate column, rule, link or change set. Publishing is
// retry-safe on its own (the idempotency_key dedupes server-side).

const BASE = "/api/v1/pipeline";
const NO_RETRY = { maxRetries: 0 };

const seg = (id: string) => encodeURIComponent(id);

function get(token: string, path: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`${BASE}${path}`), { headers: authHeaders(token) });
}

function send(
  token: string,
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
  config?: { maxRetries?: number; timeoutMs?: number },
): Promise<Response> {
  return fetchWithRetry(
    apiUrl(`${BASE}${path}`),
    {
      method,
      headers: authHeaders(token),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    },
    config,
  );
}

// ── Pipelines ──────────────────────────────────────────────────────────────

export function listPipelines(token: string, params: Record<string, unknown>) {
  return get(token, `/pipelines${buildQuery(params)}`);
}

export function getPipeline(token: string, id: string) {
  return get(token, `/pipelines/${seg(id)}`);
}

export function createPipeline(token: string, body: Record<string, unknown>) {
  return send(token, "POST", `/pipelines`, body, NO_RETRY);
}

export function updatePipeline(token: string, id: string, body: Record<string, unknown>) {
  return send(token, "PATCH", `/pipelines/${seg(id)}`, body);
}

export function deletePipeline(token: string, id: string, params: Record<string, unknown>) {
  return send(token, "DELETE", `/pipelines/${seg(id)}${buildQuery(params)}`);
}

// ── Stages (board columns) ─────────────────────────────────────────────────

export function listStages(token: string, params: Record<string, unknown>) {
  return get(token, `/stages${buildQuery(params)}`);
}

export function createStage(token: string, body: Record<string, unknown>) {
  return send(token, "POST", `/stages`, body, NO_RETRY);
}

export function updateStage(token: string, id: string, body: Record<string, unknown>) {
  return send(token, "PATCH", `/stages/${seg(id)}`, body);
}

export function deleteStage(token: string, id: string, params: Record<string, unknown>) {
  return send(token, "DELETE", `/stages/${seg(id)}${buildQuery(params)}`);
}

export function reorderStages(token: string, body: Record<string, unknown>) {
  return send(token, "PATCH", `/stages/reorder`, body);
}

// ── Stage entry rules ──────────────────────────────────────────────────────

export function listStageRules(token: string, stageId: string) {
  return get(token, `/stages/${seg(stageId)}/rules`);
}

export function createStageRule(token: string, stageId: string, body: Record<string, unknown>) {
  return send(token, "POST", `/stages/${seg(stageId)}/rules`, body, NO_RETRY);
}

export function updateStageRule(token: string, ruleId: string, body: Record<string, unknown>) {
  return send(token, "PATCH", `/rules/${seg(ruleId)}`, body);
}

export function deleteStageRule(token: string, ruleId: string) {
  return send(token, "DELETE", `/rules/${seg(ruleId)}`);
}

export function previewRuleAssignment(
  token: string,
  ruleId: string,
  params: Record<string, unknown>,
) {
  return get(token, `/rules/${seg(ruleId)}/assignment-preview${buildQuery(params)}`);
}

// ── Pipeline links ─────────────────────────────────────────────────────────

export function listLinks(token: string) {
  return get(token, `/links`);
}

export function createLink(token: string, body: Record<string, unknown>) {
  return send(token, "POST", `/links`, body, NO_RETRY);
}

export function updateLink(token: string, id: string, body: Record<string, unknown>) {
  return send(token, "PATCH", `/links/${seg(id)}`, body);
}

export function deleteLink(token: string, id: string) {
  return send(token, "DELETE", `/links/${seg(id)}`);
}

// ── Canvas placements ──────────────────────────────────────────────────────

export function listPlacements(token: string, params: Record<string, unknown>) {
  return get(token, `/placements${buildQuery(params)}`);
}

export function upsertPlacement(token: string, body: Record<string, unknown>) {
  return send(token, "PUT", `/placements`, body);
}

export function deletePlacement(token: string, params: Record<string, unknown>) {
  return send(token, "DELETE", `/placements${buildQuery(params)}`);
}

// ── Campaign outcome routes ────────────────────────────────────────────────

export function listCampaignRoutes(token: string) {
  return get(token, `/campaign-routes`);
}

export function createCampaignRoute(token: string, body: Record<string, unknown>) {
  return send(token, "POST", `/campaign-routes`, body, NO_RETRY);
}

export function updateCampaignRoute(token: string, id: string, body: Record<string, unknown>) {
  return send(token, "PATCH", `/campaign-routes/${seg(id)}`, body);
}

export function deleteCampaignRoute(token: string, id: string) {
  return send(token, "DELETE", `/campaign-routes/${seg(id)}`);
}

// ── Canvas + journey reads ─────────────────────────────────────────────────

export function getCanvas(token: string, params: Record<string, unknown>) {
  return get(token, `/canvas${buildQuery(params)}`);
}

export function getProspectJourney(token: string, params: Record<string, unknown>) {
  return get(token, `/journey${buildQuery(params)}`);
}

// ── Production change sets (canvas drafts) ─────────────────────────────────

export function listCanvasDrafts(token: string) {
  return get(token, `/canvas-drafts`);
}

export function createCanvasDraft(token: string, body: Record<string, unknown>) {
  return send(token, "POST", `/canvas-drafts`, body, NO_RETRY);
}

export function updateCanvasDraft(token: string, id: string, body: Record<string, unknown>) {
  return send(token, "PATCH", `/canvas-drafts/${seg(id)}`, body);
}

export function deleteCanvasDraft(token: string, id: string) {
  return send(token, "DELETE", `/canvas-drafts/${seg(id)}`);
}

export function getCanvasDraftDiff(token: string, id: string) {
  return get(token, `/canvas-drafts/${seg(id)}/diff`);
}

export function validateCanvasDraft(token: string, id: string) {
  return send(token, "POST", `/canvas-drafts/${seg(id)}/validate`, {});
}

export function rebaseCanvasDraft(token: string, id: string, body: Record<string, unknown>) {
  return send(token, "POST", `/canvas-drafts/${seg(id)}/rebase`, body, NO_RETRY);
}

export function publishCanvasDraft(token: string, id: string, body: Record<string, unknown>) {
  // idempotency_key makes a retried publish return the original result.
  return send(token, "POST", `/canvas-drafts/${seg(id)}/publish`, body, { timeoutMs: 60_000 });
}

export function listCanvasDraftPublications(token: string, id: string) {
  return get(token, `/canvas-drafts/${seg(id)}/publications`);
}

export function rollbackCanvasPublication(token: string, id: string, publicationId: string) {
  return send(
    token,
    "POST",
    `/canvas-drafts/${seg(id)}/publications/${seg(publicationId)}/rollback`,
    {},
    NO_RETRY,
  );
}

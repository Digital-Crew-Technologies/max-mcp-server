import { callApi, strip, toolHints, type McpServer } from "../shared";
import * as repo from "./repository";
import * as S from "./schema";

// Pipeline automation: prospect pipelines (funnels) and their columns, the
// on-enter rules that fire when a prospect lands in a column, pipeline links
// (journey edges / auto-move handoffs), campaign outcome routes, the journey
// canvas read model, and reviewed Production change sets. All proxy
// max-agent's /api/v1/pipeline/* routes with the caller's bearer token.
//
// Deliberately NOT here: /pipeline/transfer-destinations (browser-session
// only — rejects API keys) and /pipeline/webhooks* + /pipeline/webhook-routes*
// (owned by the webhooks domain).

/** The stage rule's `action` body field travels as `rule_action` (see schema.ts). */
function ruleBody(input: Record<string, unknown>, ...pathKeys: string[]) {
  const { rule_action, ...rest } = strip(input, "bearer_token", ...pathKeys);
  return rule_action === undefined ? rest : { action: rule_action, ...rest };
}

export function registerPipelineTools(server: McpServer): void {
  // ── Pipelines ────────────────────────────────────────────────────────────

  server.registerTool("pipeline_list_pipelines", {
    title: "List pipelines",
    description: "List the workspace's prospect pipelines (funnels); seeds the default one on first call. Returns {data: Pipeline[]}.",
    inputSchema: S.listPipelinesSchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.listPipelines(t, { includeArchived: input.include_archived })));

  server.registerTool("pipeline_get_pipeline", {
    title: "Get pipeline",
    description: "Get one pipeline with all its stages (archived included). Returns {data: Pipeline & {stages: Stage[]}}.",
    inputSchema: S.pipelineIdSchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) => repo.getPipeline(t, input.pipeline_id)));

  server.registerTool("pipeline_create_pipeline", {
    title: "Create pipeline",
    description: "Create a pipeline (max 12 per workspace); starter columns are seeded unless seed_stages=false. Returns {data: Pipeline}.",
    inputSchema: S.createPipelineSchema,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.createPipeline(t, strip(input, "bearer_token"))));

  server.registerTool("pipeline_update_pipeline", {
    title: "Update pipeline",
    description: "Rename, recolor, reorder or archive a pipeline, make it the default (is_default=true), or set its canvas position. Returns {data: Pipeline}.",
    inputSchema: S.updatePipelineSchema,
    ...toolHints.idempotent,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.updatePipeline(t, input.pipeline_id, strip(input, "bearer_token", "pipeline_id"))));

  server.registerTool("pipeline_delete_pipeline", {
    title: "Delete pipeline",
    description: "Permanently delete a non-default pipeline with its stages and links. If it holds prospects pass reassign_to, else 409 reassign_required. Returns {success}.",
    inputSchema: S.deletePipelineSchema,
    ...toolHints.destructive,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.deletePipeline(t, input.pipeline_id, { reassignTo: input.reassign_to })));

  // ── Stages ───────────────────────────────────────────────────────────────

  server.registerTool("pipeline_list_stages", {
    title: "List pipeline stages",
    description: "List pipeline columns (stages), optionally for one pipeline. Returns {data: Stage[]} with id, pipeline_id, key, label, type, position.",
    inputSchema: S.listStagesSchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.listStages(t, { includeArchived: input.include_archived, pipelineId: input.pipeline_id })));

  server.registerTool("pipeline_create_stage", {
    title: "Create pipeline stage",
    description: "Add a column to a pipeline (workspace default when pipeline_id omitted; max 24 per pipeline). Returns {data: Stage}.",
    inputSchema: S.createStageSchema,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.createStage(t, strip(input, "bearer_token"))));

  server.registerTool("pipeline_update_stage", {
    title: "Update pipeline stage",
    description: "Rename, recolor, retype, move or archive a column. Returns {data: Stage}.",
    inputSchema: S.updateStageSchema,
    ...toolHints.idempotent,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.updateStage(t, input.stage_id, strip(input, "bearer_token", "stage_id"))));

  server.registerTool("pipeline_delete_stage", {
    title: "Delete pipeline stage",
    description: "Permanently delete a custom column (system columns can't be deleted; archive instead). If it holds prospects pass reassign_to, else 409. Returns {success}.",
    inputSchema: S.deleteStageSchema,
    ...toolHints.destructive,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.deleteStage(t, input.stage_id, { reassignTo: input.reassign_to })));

  server.registerTool("pipeline_reorder_stages", {
    title: "Reorder pipeline stages",
    description: "Set a new left-to-right column order. Returns {data: Stage[]} (every column).",
    inputSchema: S.reorderStagesSchema,
    ...toolHints.idempotent,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.reorderStages(t, strip(input, "bearer_token"))));

  // ── Stage entry rules ────────────────────────────────────────────────────

  server.registerTool("pipeline_list_stage_rules", {
    title: "List stage rules",
    description: "List a column's on-enter automation rules. Returns {data: StageRule[]} with id, action, config, is_enabled, position.",
    inputSchema: S.stageIdSchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) => repo.listStageRules(t, input.stage_id)));

  server.registerTool("pipeline_create_stage_rule", {
    title: "Create stage rule",
    description: "Add an on-enter rule to a column: every prospect entering it gets rule_action (enroll in campaign, notify, assign, create deal, move, set field) — fires for real prospects once enabled. Cross-workspace move_stage needs a signed-in user, not an API key. Returns {data: StageRule}.",
    inputSchema: S.createStageRuleSchema,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.createStageRule(t, input.stage_id, ruleBody(input, "stage_id"))));

  server.registerTool("pipeline_update_stage_rule", {
    title: "Update stage rule",
    description: "Change a stage rule's action, config, enabled flag or order. Returns {data: StageRule}.",
    inputSchema: S.updateStageRuleSchema,
    ...toolHints.idempotent,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.updateStageRule(t, input.rule_id, ruleBody(input, "rule_id"))));

  server.registerTool("pipeline_delete_stage_rule", {
    title: "Delete stage rule",
    description: "Permanently delete a stage rule. Returns {success}.",
    inputSchema: S.ruleIdSchema,
    ...toolHints.destructive,
  }, async (input) => callApi(input.bearer_token, (t) => repo.deleteStageRule(t, input.rule_id)));

  server.registerTool("pipeline_preview_rule_assignment", {
    title: "Preview rule assignment",
    description: "Dry-run an `assign` stage rule: who it would assign now (or at `at`) and why, with each candidate's calendar availability. Changes nothing. Returns {data: {assignees, candidates, strategy, reason}}.",
    inputSchema: S.previewRuleAssignmentSchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.previewRuleAssignment(t, input.rule_id, { at: input.at })));

  // ── Pipeline links ───────────────────────────────────────────────────────

  server.registerTool("pipeline_list_links", {
    title: "List pipeline links",
    description: "List pipeline links: journey edges between pipelines, or column-to-column handoffs when both stage ids are set. Returns {data: Link[]}.",
    inputSchema: S.tokenOnlySchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) => repo.listLinks(t)));

  server.registerTool("pipeline_create_link", {
    title: "Create pipeline link",
    description: "Link two pipelines, or two columns (both stage ids) as a handoff; auto_move=true moves every prospect entering from_stage into to_stage. Returns {data: Link}.",
    inputSchema: S.createLinkSchema,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.createLink(t, strip(input, "bearer_token"))));

  server.registerTool("pipeline_update_link", {
    title: "Update pipeline link",
    description: "Relabel, re-point, pin/unpin columns or arm/disarm auto_move on a pipeline link. Returns {data: Link}.",
    inputSchema: S.updateLinkSchema,
    ...toolHints.idempotent,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.updateLink(t, input.link_id, strip(input, "bearer_token", "link_id"))));

  server.registerTool("pipeline_delete_link", {
    title: "Delete pipeline link",
    description: "Delete a pipeline link (stops its auto_move handoff). Returns {success}.",
    inputSchema: S.linkIdSchema,
    ...toolHints.destructive,
  }, async (input) => callApi(input.bearer_token, (t) => repo.deleteLink(t, input.link_id)));

  // ── Canvas placements (layout only) ──────────────────────────────────────

  server.registerTool("pipeline_list_placements", {
    title: "List canvas placements",
    description: "List saved journey-canvas positions of campaign / webhook / deal-pipeline nodes. Returns {data: Placement[]}.",
    inputSchema: S.listPlacementsSchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.listPlacements(t, { kind: input.kind })));

  server.registerTool("pipeline_set_placement", {
    title: "Set canvas placement",
    description: "Save where a campaign / webhook / deal-pipeline node sits on the journey canvas (upsert by kind + ref_id). Layout only. Returns {data: Placement}.",
    inputSchema: S.upsertPlacementSchema,
    ...toolHints.idempotent,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.upsertPlacement(t, strip(input, "bearer_token"))));

  server.registerTool("pipeline_delete_placement", {
    title: "Delete canvas placement",
    description: "Forget a canvas node's saved position so it is auto-laid-out. Layout only. Returns {success}.",
    inputSchema: S.deletePlacementSchema,
    ...toolHints.destructive,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.deletePlacement(t, { kind: input.kind, ref_id: input.ref_id })));

  // ── Campaign outcome routes ──────────────────────────────────────────────

  server.registerTool("pipeline_list_campaign_routes", {
    title: "List campaign routes",
    description: "List campaign outcome routes (campaign outcome → column). Returns {data: CampaignRoute[]}.",
    inputSchema: S.tokenOnlySchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) => repo.listCampaignRoutes(t)));

  server.registerTool("pipeline_create_campaign_route", {
    title: "Create campaign route",
    description: "Route a campaign outcome (contacted/replied/bounced/opted_out) into a column: prospects are moved there automatically when it happens. One route per campaign+outcome (409 if taken). Returns {data: CampaignRoute}.",
    inputSchema: S.createCampaignRouteSchema,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.createCampaignRoute(t, strip(input, "bearer_token"))));

  server.registerTool("pipeline_update_campaign_route", {
    title: "Update campaign route",
    description: "Point a campaign route at another column, or arm/disarm it. Returns {data: CampaignRoute}.",
    inputSchema: S.updateCampaignRouteSchema,
    ...toolHints.idempotent,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.updateCampaignRoute(t, input.route_id, strip(input, "bearer_token", "route_id"))));

  server.registerTool("pipeline_delete_campaign_route", {
    title: "Delete campaign route",
    description: "Delete a campaign outcome route. Returns {success}.",
    inputSchema: S.routeIdSchema,
    ...toolHints.destructive,
  }, async (input) => callApi(input.bearer_token, (t) => repo.deleteCampaignRoute(t, input.route_id)));

  // ── Canvas + journey reads ───────────────────────────────────────────────

  server.registerTool("pipeline_get_canvas", {
    title: "Get journey canvas",
    description: "The whole journey graph in one read: pipelines with stages, prospect and rule counts, links, campaigns and their routes, stage automations, webhooks and their routes, deal pipelines. Returns {data: {...}}.",
    inputSchema: S.getCanvasSchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.getCanvas(t, { includeArchived: input.include_archived })));

  server.registerTool("pipeline_get_prospect_journey", {
    title: "Get prospect journey",
    description: "One prospect's stage-change trail across pipelines, oldest first. Returns {data: {current, entry, steps[], pipelines_visited[], truncated}}.",
    inputSchema: S.getProspectJourneySchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.getProspectJourney(t, { prospect_id: input.prospect_id })));

  // ── Production change sets (canvas drafts) ───────────────────────────────
  // Reviewed, atomic batches of topology edits. Flow: create → update
  // (definition) → update status 'ready' → publish. 404 on every route when the
  // deployment has change sets turned off.

  server.registerTool("pipeline_list_canvas_drafts", {
    title: "List change sets",
    description: "List Production change sets (reviewed batches of pipeline edits) with status, revision and operations. Returns {data: ChangeSet[]}; 404 if change sets are disabled.",
    inputSchema: S.tokenOnlySchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) => repo.listCanvasDrafts(t)));

  server.registerTool("pipeline_create_canvas_draft", {
    title: "Create change set",
    description: "Start a change set based on current Production (empty, or duplicate_from another); add operations with pipeline_update_canvas_draft. Returns {data: ChangeSet} incl. revision and definition.base.",
    inputSchema: S.createCanvasDraftSchema,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.createCanvasDraft(t, strip(input, "bearer_token"))));

  server.registerTool("pipeline_update_canvas_draft", {
    title: "Update change set",
    description: "Save a change set's name, full `definition` (operations) or status. Flow: save definition → status 'ready' (validates; 409 production_drift / 422 invalid) → pipeline_publish_canvas_draft. Returns {data: ChangeSet} with the new revision.",
    inputSchema: S.updateCanvasDraftSchema,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.updateCanvasDraft(t, input.draft_id, strip(input, "bearer_token", "draft_id"))));

  server.registerTool("pipeline_delete_canvas_draft", {
    title: "Delete change set",
    description: "Delete an unpublished change set. Returns an empty body (204) on success.",
    inputSchema: S.draftIdSchema,
    ...toolHints.destructive,
  }, async (input) => callApi(input.bearer_token, (t) => repo.deleteCanvasDraft(t, input.draft_id)));

  server.registerTool("pipeline_get_canvas_draft_diff", {
    title: "Diff change set",
    description: "Review a change set against current Production: additions, edits, removals, relocations, warnings, conflicts and drift. Returns {data: Diff}.",
    inputSchema: S.draftIdSchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) => repo.getCanvasDraftDiff(t, input.draft_id)));

  server.registerTool("pipeline_validate_canvas_draft", {
    title: "Validate change set",
    description: "Check a change set against current Production without saving anything. Returns {data: {valid, drifted, issues[]}}.",
    inputSchema: S.draftIdSchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) => repo.validateCanvasDraft(t, input.draft_id)));

  server.registerTool("pipeline_rebase_canvas_draft", {
    title: "Rebase change set",
    description: "Re-base a drifted change set onto current Production (new base fingerprint); review and mark ready again before publishing. Returns {data: ChangeSet}.",
    inputSchema: S.rebaseCanvasDraftSchema,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.rebaseCanvasDraft(t, input.draft_id, { expected_revision: input.expected_revision })));

  server.registerTool("pipeline_publish_canvas_draft", {
    title: "Publish change set",
    description: "Atomically apply a 'ready' change set to Production — immediately changes live routing and automation for real prospects (may remove columns/archive pipelines). 409 production_drift if Production moved (rebase first). Returns {data: {publication_id, status, fingerprint, revision}}.",
    inputSchema: S.publishCanvasDraftSchema,
    ...toolHints.destructive,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.publishCanvasDraft(t, input.draft_id, strip(input, "bearer_token", "draft_id"))));

  server.registerTool("pipeline_list_canvas_draft_publications", {
    title: "List change-set publications",
    description: "A change set's publication history (reason, actor, before/after fingerprints, operations). Returns {data: Publication[]}.",
    inputSchema: S.draftIdSchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.listCanvasDraftPublications(t, input.draft_id)));

  server.registerTool("pipeline_rollback_canvas_publication", {
    title: "Roll back a publication",
    description: "Create a NEW draft change set that reverts a publication (422 if Production changed since). Nothing goes live until it is marked ready and published. Returns {data: ChangeSet}.",
    inputSchema: S.rollbackCanvasPublicationSchema,
    ...toolHints.destructive,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.rollbackCanvasPublication(t, input.draft_id, input.publication_id)));
}

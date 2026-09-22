import { z } from "zod";
import { withToken } from "../shared";

// Mirrors max-agent src/features/pipeline/schemas/* and
// src/features/gtm-canvases/schemas/gtm-canvas-draft.schema.ts.
//
// Naming note: path ids are spelled per entity (pipeline_id, stage_id,
// rule_id, ...) so the grouped tool's merged arg list stays unambiguous, and
// the stage rule's `action` body field is exposed as `rule_action` because
// `action` is the grouped tool's discriminator.

const uuid = (what: string) => z.string().uuid().describe(what);

const STAGE_COLORS = [
  "slate", "blue", "sky", "cyan", "teal", "emerald", "green", "lime", "amber",
  "orange", "red", "rose", "pink", "fuchsia", "purple", "violet", "indigo",
] as const;
const colorSchema = z.enum(STAGE_COLORS).describe("Color token.");
const stageTypeSchema = z
  .enum(["new", "active", "won", "lost"])
  .describe("Semantic stage type: new | active | won | lost.");
const RULE_ACTIONS = [
  "enroll_campaign", "notify", "assign", "create_deal", "move_stage", "set_field",
] as const;
const CAMPAIGN_OUTCOMES = ["contacted", "replied", "bounced", "opted_out"] as const;
const PLACEMENT_KINDS = ["campaign", "webhook", "deal_pipeline"] as const;

const includeArchived = z
  .boolean()
  .optional()
  .describe("Include archived rows (default false).");

/** List routes that take no arguments. */
export const tokenOnlySchema = z.object({ ...withToken });

// ── Pipelines ──────────────────────────────────────────────────────────────

export const listPipelinesSchema = z.object({
  ...withToken,
  include_archived: includeArchived,
});

export const pipelineIdSchema = z.object({
  ...withToken,
  pipeline_id: uuid("Pipeline UUID."),
});

export const createPipelineSchema = z.object({
  ...withToken,
  name: z.string().trim().min(1).max(60).describe("Name (max 60)."),
  description: z.string().trim().max(300).optional().describe("Description (max 300)."),
  color: colorSchema.optional(),
  source: z.string().trim().max(120).optional().describe("Free-text lead source (max 120)."),
  position: z.number().int().min(0).optional().describe("0-based order; appended when omitted."),
  seed_stages: z.boolean().optional().describe("Seed starter columns (default true)."),
});

export const updatePipelineSchema = z.object({
  ...withToken,
  pipeline_id: uuid("Pipeline UUID."),
  name: z.string().trim().min(1).max(60).optional().describe("Name (max 60)."),
  description: z.string().trim().max(300).nullable().optional().describe("Description; null clears."),
  color: colorSchema.optional(),
  source: z.string().trim().max(120).nullable().optional().describe("Lead source; null clears."),
  position: z.number().int().min(0).optional().describe("0-based order."),
  is_default: z.literal(true).optional().describe("true makes this the default pipeline."),
  is_archived: z.boolean().optional().describe("Archive/unarchive (default pipeline can't be archived)."),
  canvas_x: z.number().finite().nullable().optional().describe("Canvas node x; null = auto-layout."),
  canvas_y: z.number().finite().nullable().optional().describe("Canvas node y; null = auto-layout."),
});

export const deletePipelineSchema = z.object({
  ...withToken,
  pipeline_id: uuid("Pipeline UUID."),
  reassign_to: z
    .string()
    .uuid()
    .optional()
    .describe("Pipeline UUID to move this pipeline's prospects into (required if it has any)."),
});

// ── Stages ─────────────────────────────────────────────────────────────────

export const listStagesSchema = z.object({
  ...withToken,
  pipeline_id: z.string().uuid().optional().describe("Only this pipeline's columns."),
  include_archived: includeArchived,
});

export const createStageSchema = z.object({
  ...withToken,
  label: z.string().trim().min(1).max(40).describe("Column label (max 40)."),
  pipeline_id: z.string().uuid().optional().describe("Target pipeline; workspace default when omitted."),
  color: colorSchema.optional(),
  type: stageTypeSchema.optional(),
  position: z.number().int().min(0).optional().describe("0-based order; appended when omitted."),
});

export const updateStageSchema = z.object({
  ...withToken,
  stage_id: uuid("Stage (column) UUID."),
  label: z.string().trim().min(1).max(40).optional().describe("Column label (max 40)."),
  color: colorSchema.optional(),
  type: stageTypeSchema.optional(),
  position: z.number().int().min(0).optional().describe("0-based order."),
  is_archived: z.boolean().optional().describe("Hide/unhide the column."),
});

export const deleteStageSchema = z.object({
  ...withToken,
  stage_id: uuid("Stage (column) UUID."),
  reassign_to: z
    .string()
    .uuid()
    .optional()
    .describe("Stage UUID to move this column's prospects into (required if it has any)."),
});

export const reorderStagesSchema = z.object({
  ...withToken,
  ordered_ids: z
    .array(z.string().uuid())
    .min(1)
    .describe("Stage UUIDs in the new left-to-right order."),
});

// ── Stage entry rules ──────────────────────────────────────────────────────

const ruleConfig = z
  .record(z.unknown())
  .describe(
    "Per rule_action: enroll_campaign {campaign_id}; notify {message?}; " +
      "assign {assignee_ids[1-50], strategy?: collective|round_robin|least_busy|first_available, weights?: {user_id: 1-10}, availability?, merge?: add|replace}; " +
      "create_deal {pipeline_id?, stage_id?, assignment?: {mode: unassigned|manual|ai, owner_id?, prompt?, candidate_ids?}}; " +
      "move_stage {target?: stage|next, stage_id? (required for stage), pipeline_id?}; " +
      "set_field {entity?: prospect|organization, field_key, value, only_if_empty?}.",
  );

export const stageIdSchema = z.object({
  ...withToken,
  stage_id: uuid("Stage (column) UUID."),
});

export const createStageRuleSchema = z.object({
  ...withToken,
  stage_id: uuid("Stage (column) UUID the rule fires on."),
  rule_action: z.enum(RULE_ACTIONS).describe("What the rule does when a prospect enters the column."),
  config: ruleConfig.optional(),
  is_enabled: z.boolean().optional().describe("Default true."),
  position: z.number().int().min(0).optional().describe("Order among the column's rules."),
});

export const updateStageRuleSchema = z.object({
  ...withToken,
  rule_id: uuid("Stage rule UUID."),
  rule_action: z.enum(RULE_ACTIONS).optional().describe("Change the rule's action (config re-validated)."),
  config: ruleConfig.optional(),
  is_enabled: z.boolean().optional().describe("Arm/disarm the rule."),
  position: z.number().int().min(0).optional().describe("Order among the column's rules."),
});

export const ruleIdSchema = z.object({
  ...withToken,
  rule_id: uuid("Stage rule UUID."),
});

export const previewRuleAssignmentSchema = z.object({
  ...withToken,
  rule_id: uuid("UUID of an `assign` stage rule."),
  at: z.string().max(64).optional().describe("ISO 8601 instant to evaluate at (default now)."),
});

// ── Pipeline links ─────────────────────────────────────────────────────────

export const createLinkSchema = z.object({
  ...withToken,
  from_pipeline_id: uuid("Source pipeline UUID."),
  to_pipeline_id: uuid("Destination pipeline UUID."),
  from_stage_id: z.string().uuid().nullable().optional().describe("Source column (set both stage ids or neither)."),
  to_stage_id: z.string().uuid().nullable().optional().describe("Destination column (set both stage ids or neither)."),
  auto_move: z.boolean().optional().describe("Entering from_stage auto-moves the prospect to to_stage; needs both stage ids."),
  label: z.string().trim().max(60).optional().describe("Edge label (max 60)."),
});

export const updateLinkSchema = z.object({
  ...withToken,
  link_id: uuid("Pipeline link UUID."),
  label: z.string().trim().max(60).nullable().optional().describe("Edge label; null clears."),
  from_pipeline_id: z.string().uuid().optional().describe("New source pipeline."),
  to_pipeline_id: z.string().uuid().optional().describe("New destination pipeline."),
  from_stage_id: z.string().uuid().nullable().optional().describe("Source column; null unpins (pin/unpin both ends together)."),
  to_stage_id: z.string().uuid().nullable().optional().describe("Destination column; null unpins."),
  auto_move: z.boolean().optional().describe("Arm/disarm the automatic move."),
});

export const linkIdSchema = z.object({
  ...withToken,
  link_id: uuid("Pipeline link UUID."),
});

// ── Canvas placements ──────────────────────────────────────────────────────

const placementKind = z.enum(PLACEMENT_KINDS).describe("Canvas node kind.");

export const listPlacementsSchema = z.object({
  ...withToken,
  kind: placementKind.optional(),
});

export const upsertPlacementSchema = z.object({
  ...withToken,
  kind: placementKind,
  ref_id: uuid("UUID of the campaign / webhook / deal pipeline the node shows."),
  canvas_x: z.number().finite().describe("Canvas x."),
  canvas_y: z.number().finite().describe("Canvas y."),
});

export const deletePlacementSchema = z.object({
  ...withToken,
  kind: placementKind,
  ref_id: uuid("UUID of the node's campaign / webhook / deal pipeline."),
});

// ── Campaign outcome routes ────────────────────────────────────────────────

export const createCampaignRouteSchema = z.object({
  ...withToken,
  campaign_id: uuid("Campaign UUID (this workspace)."),
  outcome: z.enum(CAMPAIGN_OUTCOMES).describe("Campaign outcome that fires the route."),
  to_stage_id: uuid("Destination column UUID (not archived)."),
  is_enabled: z.boolean().optional().describe("Default true."),
});

export const updateCampaignRouteSchema = z.object({
  ...withToken,
  route_id: uuid("Campaign route UUID."),
  to_stage_id: z.string().uuid().optional().describe("New destination column."),
  is_enabled: z.boolean().optional().describe("Arm/disarm the route."),
});

export const routeIdSchema = z.object({
  ...withToken,
  route_id: uuid("Campaign route UUID."),
});

// ── Canvas + journey reads ─────────────────────────────────────────────────

export const getCanvasSchema = z.object({
  ...withToken,
  include_archived: includeArchived,
});

export const getProspectJourneySchema = z.object({
  ...withToken,
  prospect_id: uuid("Prospect UUID."),
});

// ── Production change sets ─────────────────────────────────────────────────

const CHANGE_OPERATION_TYPES = [
  "pipeline.create", "pipeline.update", "pipeline.archive",
  "stage.create", "stage.update", "stage.remove",
  "link.upsert", "link.remove",
  "stage_rule.upsert", "stage_rule.remove",
  "campaign_route.upsert", "campaign_route.remove",
  "webhook_route.upsert", "webhook_route.remove",
] as const;

const changeOperationSchema = z
  .object({
    operation_id: z.string().uuid().describe("New UUID, unique within the change set."),
    type: z.enum(CHANGE_OPERATION_TYPES).describe("Operation type; other fields depend on it."),
  })
  .passthrough();

const changeSetDefinitionSchema = z
  .object({
    version: z.literal(2),
    scope: z.literal("production_topology"),
    base: z
      .object({
        fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
        captured_at: z.string().datetime(),
      })
      .describe("Copy unchanged from the draft."),
    changes: z
      .array(changeOperationSchema)
      .max(500)
      .describe(
        "Full ordered operation list (replaces the stored one). Fields per type: " +
          "pipeline.create {pipeline_id(new uuid), name, description?, color?, source?, position}; " +
          "pipeline.update {pipeline_id, patch{name?,description?,color?,source?,position?}}; " +
          "pipeline.archive {pipeline_id, relocate_to_pipeline_id}; " +
          "stage.create {stage_id(new uuid), pipeline_id, key(slug), label, color?, stage_type?, position}; " +
          "stage.update {stage_id, patch{label?,color?,type?,position?}}; " +
          "stage.remove {stage_id, relocate_to_stage_id}; " +
          "link.upsert {link_id, from_pipeline_id, to_pipeline_id, from_stage_id|null, to_stage_id|null, auto_move, label|null}; " +
          "stage_rule.upsert {rule_id, stage_id, action, config, is_enabled, position}; " +
          "campaign_route.upsert {route_id, campaign_id, outcome, to_stage_id, is_enabled}; " +
          "webhook_route.upsert {route_id, webhook_id, to_stage_id, label|null, filter{match,conditions}, position, is_enabled}; " +
          "*.remove {<entity>_id}.",
      ),
  })
  .describe("Change-set document: {version:2, scope:'production_topology', base, changes}.");

const expectedRevision = z
  .number()
  .int()
  .positive()
  .describe("The draft's current `revision` (optimistic lock; 409 revision_conflict if stale).");

export const draftIdSchema = z.object({
  ...withToken,
  draft_id: uuid("Change-set (canvas draft) UUID."),
});

export const createCanvasDraftSchema = z.object({
  ...withToken,
  name: z.string().trim().min(1).max(80).describe("Change-set name (max 80)."),
  description: z.string().trim().max(300).nullable().optional().describe("Description (max 300)."),
  duplicate_from: z.string().uuid().optional().describe("Copy the operations of this existing change set."),
});

export const updateCanvasDraftSchema = z.object({
  ...withToken,
  draft_id: uuid("Change-set (canvas draft) UUID."),
  expected_revision: expectedRevision,
  name: z.string().trim().min(1).max(80).optional().describe("Change-set name."),
  description: z.string().trim().max(300).nullable().optional().describe("Description; null clears."),
  definition: changeSetDefinitionSchema.optional(),
  status: z
    .enum(["draft", "ready"])
    .optional()
    .describe("'ready' validates and submits for publish (send without definition); 'draft' reopens."),
});

export const rebaseCanvasDraftSchema = z.object({
  ...withToken,
  draft_id: uuid("Change-set (canvas draft) UUID."),
  expected_revision: expectedRevision,
});

export const publishCanvasDraftSchema = z.object({
  ...withToken,
  draft_id: uuid("Change-set (canvas draft) UUID; must be status 'ready'."),
  expected_revision: expectedRevision,
  idempotency_key: uuid("New UUID per publish attempt; reuse it only to retry the same publish."),
  reason: z.string().trim().min(3).max(500).describe("Why this change ships (3-500 chars, audited)."),
});

export const rollbackCanvasPublicationSchema = z.object({
  ...withToken,
  draft_id: uuid("Published change-set UUID."),
  publication_id: uuid("Publication UUID (from pipeline_list_canvas_draft_publications)."),
});

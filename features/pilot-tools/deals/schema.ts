import { z } from "zod";
import { withToken } from "../shared";

// Max's NATIVE deals (its own sales pipeline in max-agent) plus the sales
// catalog and sales-workspace map — NOT HubSpot (that is the crm_* tools).
// Mirrors max-agent src/features/deals/schemas/*, src/features/sales-catalog/
// catalog.schema.ts and the sales-workspace handler.
//
// Path params use descriptive names (deal_id, stage_id, rule_id, ...) rather
// than a bare `id`: this domain is published as ONE grouped tool, where every
// action's fields are merged into a single argument list.
//
// No .refine()/.superRefine() here: the grouped adapter needs plain z.object
// shapes. max-agent re-validates (e.g. "No fields to update", rule config vs
// action, select-field options) and returns a 400 with the reason.

const uuid = (what: string) => z.string().uuid().describe(what);
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
const currency = z
  .string()
  .regex(/^\s*[A-Za-z]{3}\s*$/, "Expected a 3-letter currency code");
const dealStatus = z.enum(["open", "won", "lost"]);
const stageColor = z.enum([
  "slate", "blue", "sky", "cyan", "teal", "emerald", "green", "lime", "amber",
  "orange", "red", "rose", "pink", "fuchsia", "purple", "violet", "indigo",
]);
const catalogKind = z.enum(["product", "service"]);
/** Non-negative, at most four decimal places (max-agent's `decimal`). */
const decimal = (max: number) => z.number().finite().nonnegative().max(max);

// ── Deals ─────────────────────────────────────────────────────────────────

export const listDealsSchema = z.object({
  ...withToken,
  page: z.number().int().min(1).optional().describe("Page number (default 1)"),
  pageSize: z.number().int().min(1).max(100).optional().describe("Results per page (default 20, max 100)"),
  pipeline_id: uuid("Deal pipeline UUID").optional(),
  stage_id: uuid("Deal stage (column) UUID").optional(),
  status: dealStatus.optional().describe("Deal status: open | won | lost"),
  owner_id: uuid("Owner (workspace member) user UUID").optional(),
  organization_id: uuid("Organization UUID").optional(),
  prospect_id: uuid("Prospect (contact) UUID").optional(),
  search: z.string().max(200).optional().describe("Search text (max 200)"),
  close_date_from: isoDate.optional().describe("Close date on/after (YYYY-MM-DD)"),
  close_date_to: isoDate.optional().describe("Close date on/before (YYYY-MM-DD)"),
  has_close_date: z.boolean().optional().describe("true = only dated deals, false = only undated"),
  sortBy: z.enum(["created_at", "updated_at", "close_date", "amount", "name"]).optional().describe("Sort column"),
  sortOrder: z.enum(["asc", "desc"]).optional().describe("Sort direction (default desc)"),
});

const dealEditable = {
  amount: z.number().finite().nonnegative().nullable().optional().describe("Deal value (>= 0); null clears"),
  currency: currency.optional().describe("ISO 4217 code, e.g. EUR (default EUR on create)"),
  close_date: isoDate.nullable().optional().describe("Expected close date YYYY-MM-DD; null clears"),
  probability: z.number().min(0).max(100).nullable().optional().describe("Win probability 0-100 override; null = stage default"),
  owner_id: uuid("Owner (workspace member) user UUID").nullable().optional(),
  organization_id: uuid("Organization UUID").nullable().optional(),
  description: z.string().max(20000).nullable().optional().describe("Free-text description"),
  custom_fields: z.record(z.unknown()).optional().describe("Deal custom field values keyed by field key"),
};

export const createDealSchema = z.object({
  ...withToken,
  name: z.string().min(1).max(200).describe("Name (max 200 chars)"),
  pipeline_id: uuid("Deal pipeline UUID (default: workspace default pipeline)").optional(),
  stage_id: uuid("Deal stage UUID (default: pipeline's first open stage)").optional(),
  ...dealEditable,
  source: z.enum(["manual", "stage_rule", "import", "agent", "automation"]).optional().describe("Origin of the deal (default manual)"),
  prospect_ids: z.array(z.string().uuid()).max(50).optional().describe("Prospect UUIDs to link as contacts; first is primary"),
});

export const dealIdSchema = z.object({
  ...withToken,
  deal_id: uuid("Deal UUID"),
});

export const updateDealSchema = z.object({
  ...withToken,
  deal_id: uuid("Deal UUID"),
  name: z.string().min(1).max(200).optional().describe("Name (max 200 chars)"),
  ...dealEditable,
  lost_reason: z.string().max(1000).nullable().optional().describe("Reason the deal was lost"),
});

export const getDealBoardTotalsSchema = z.object({
  ...withToken,
  pipeline_id: uuid("Deal pipeline UUID"),
  status: dealStatus.optional().describe("Deal status: open | won | lost"),
  owner_id: uuid("Owner (workspace member) user UUID").optional(),
  organization_id: uuid("Organization UUID").optional(),
  search: z.string().max(200).optional().describe("Search text (max 200)"),
});

export const moveDealSchema = z.object({
  ...withToken,
  deal_id: uuid("Deal UUID"),
  stage_id: uuid("Target deal stage UUID (any pipeline)"),
});

export const loseDealSchema = z.object({
  ...withToken,
  deal_id: uuid("Deal UUID"),
  lost_reason: z.string().max(1000).optional().describe("Reason the deal was lost"),
});

export const addDealProspectSchema = z.object({
  ...withToken,
  deal_id: uuid("Deal UUID"),
  prospect_id: uuid("Prospect (contact) UUID"),
  role: z.string().max(100).nullable().optional().describe("Contact's role on the deal, e.g. Decision maker"),
  is_primary: z.boolean().optional().describe("Make this the primary contact"),
});

export const removeDealProspectSchema = z.object({
  ...withToken,
  deal_id: uuid("Deal UUID"),
  prospect_id: uuid("Prospect (contact) UUID"),
});

// ── Pipelines & stages ────────────────────────────────────────────────────

export const listDealPipelinesSchema = z.object({
  ...withToken,
  includeArchived: z.boolean().optional().describe("Include archived pipelines"),
});

export const createDealPipelineSchema = z.object({
  ...withToken,
  name: z.string().min(1).max(60).describe("Pipeline name (max 60)"),
});

export const updateDealPipelineSchema = z.object({
  ...withToken,
  pipeline_id: uuid("Deal pipeline UUID"),
  name: z.string().min(1).max(60).optional().describe("Pipeline name (max 60)"),
  is_default: z.boolean().optional().describe("Make this the default pipeline"),
  position: z.number().int().min(0).optional().describe("0-based display position"),
  is_archived: z.boolean().optional().describe("Archive (true) or restore (false)"),
});

export const dealPipelineIdSchema = z.object({
  ...withToken,
  pipeline_id: uuid("Deal pipeline UUID"),
});

const stageEditable = {
  color: stageColor.optional().describe("Column color"),
  type: dealStatus.optional().describe("Stage type: open | won | lost (default open)"),
  win_probability: z.number().min(0).max(100).nullable().optional().describe("Default win probability 0-100"),
  position: z.number().int().min(0).optional().describe("0-based display position"),
};

export const createDealStageSchema = z.object({
  ...withToken,
  pipeline_id: uuid("Deal pipeline UUID"),
  label: z.string().min(1).max(40).describe("Stage label (max 40)"),
  ...stageEditable,
});

export const updateDealStageSchema = z.object({
  ...withToken,
  stage_id: uuid("Deal stage UUID"),
  label: z.string().min(1).max(40).optional().describe("Stage label (max 40)"),
  ...stageEditable,
});

export const deleteDealStageSchema = z.object({
  ...withToken,
  stage_id: uuid("Deal stage UUID"),
  reassignTo: uuid("Stage in the same pipeline to move this stage's deals to (required if it holds deals)").optional(),
});

export const reorderDealStagesSchema = z.object({
  ...withToken,
  pipeline_id: uuid("Deal pipeline UUID"),
  ordered_ids: z.array(z.string().uuid()).min(1).describe("All stage UUIDs of the pipeline in the new order"),
});

// ── Stage entry-automation rules ──────────────────────────────────────────
// max-agent's body field is `action`, which is the grouped tool's
// discriminator — so it is `rule_action` here and renamed in the handler.

const ruleAction = z
  .enum(["notify", "assign", "enroll_campaign"])
  .describe("notify | assign | enroll_campaign");
const ruleConfig = z
  .record(z.unknown())
  .describe("notify: {message?}; assign: {owner_id, overwrite?}; enroll_campaign: {campaign_id}");

export const dealStageIdSchema = z.object({
  ...withToken,
  stage_id: uuid("Deal stage UUID"),
});

export const createDealStageRuleSchema = z.object({
  ...withToken,
  stage_id: uuid("Deal stage UUID"),
  rule_action: ruleAction,
  config: ruleConfig.optional(),
  is_enabled: z.boolean().optional().describe("Enabled (default true)"),
  position: z.number().int().min(0).optional().describe("0-based display position"),
});

export const updateDealStageRuleSchema = z.object({
  ...withToken,
  rule_id: uuid("Deal stage rule UUID"),
  rule_action: ruleAction.optional(),
  config: ruleConfig.optional(),
  is_enabled: z.boolean().optional().describe("Enabled (default true)"),
  position: z.number().int().min(0).optional().describe("0-based display position"),
});

export const dealStageRuleIdSchema = z.object({
  ...withToken,
  rule_id: uuid("Deal stage rule UUID"),
});

// ── Attachments (metadata only) ───────────────────────────────────────────

export const deleteDealAttachmentSchema = z.object({
  ...withToken,
  deal_id: uuid("Deal UUID"),
  attachment_id: uuid("Deal attachment UUID"),
});

// ── Sales workspace & catalog ─────────────────────────────────────────────

export const getSalesWorkspaceSchema = z.object({
  ...withToken,
  limit: z.number().int().min(1).max(100).optional().describe("Max items per source collection (default 50)"),
});

export const listSalesCatalogItemsSchema = z.object({
  ...withToken,
  page: z.number().int().min(1).max(10000).optional().describe("Page number (default 1)"),
  search: z.string().max(200).optional().describe("Search text (max 200)"),
  kind: catalogKind.optional().describe("product | service"),
});

const offeringFields = {
  name: z.string().min(1).max(200).describe("Name (max 200 chars)"),
  kind: catalogKind.describe("product | service"),
  description: z.string().max(10000).optional().describe("Free-text description"),
  status: z.enum(["draft", "active", "archived"]).optional().describe("draft | active | archived (default draft)"),
  unit_price: decimal(9_999_999_999).nullable().optional().describe("List price per unit, max 4 decimals; null with currency null = custom pricing"),
  currency: currency.nullable().optional().describe("ISO 4217 code; set together with unit_price"),
  unit_label: z.string().min(1).max(50).optional().describe("Unit name (default 'unit')"),
  attributes: z
    .record(z.union([z.string().max(4000), z.number().finite(), z.boolean(), z.null()]))
    .optional()
    .describe("Custom catalog field values keyed by field key (see list_sales_catalog_fields)"),
};

export const createSalesCatalogItemSchema = z.object({
  ...withToken,
  ...offeringFields,
});

export const updateSalesCatalogItemSchema = z.object({
  ...withToken,
  catalog_item_id: uuid("Sales catalog item (offering) UUID"),
  ...offeringFields,
  expected_updated_at: z
    .string()
    .datetime({ offset: true })
    .describe("The item's current updated_at (optimistic lock; 409 if it changed)"),
});

export const listSalesCatalogFieldsSchema = z.object({ ...withToken });

export const createSalesCatalogFieldSchema = z.object({
  ...withToken,
  key: z
    .string()
    .regex(/^[a-z][a-z0-9_]{0,47}$/)
    .describe("Field key: lowercase, starts with a letter, [a-z0-9_], max 48"),
  label: z.string().min(1).max(100).describe("Display label (max 100)"),
  type: z.enum(["text", "number", "boolean", "date", "select"]).describe("text | number | boolean | date | select"),
  kind: z.enum(["product", "service", "both"]).optional().describe("Applies to product | service | both (default both)"),
  options: z
    .array(z.string().min(1).max(100))
    .max(50)
    .optional()
    .describe("Unique choices; required for select, must be empty otherwise"),
});

export const listDealLineItemsSchema = z.object({
  ...withToken,
  deal_id: uuid("Deal UUID"),
});

export const addDealLineItemSchema = z.object({
  ...withToken,
  deal_id: uuid("Deal UUID"),
  offering_id: uuid("Active sales catalog item (offering) UUID"),
  unit_price: decimal(9_999_999_999).describe("Agreed unit price, max 4 decimals"),
  currency: currency.describe("Must equal the deal's currency"),
  quantity: decimal(1_000_000).positive().optional().describe("Quantity > 0, max 4 decimals (default 1)"),
  scope: z.string().max(10000).optional().describe("Scope / notes for this line"),
  id: uuid("Client submission UUID for idempotency (auto-generated if omitted)").optional(),
});

export const removeDealLineItemSchema = z.object({
  ...withToken,
  deal_id: uuid("Deal UUID"),
  line_item_id: uuid("Deal line item UUID"),
});

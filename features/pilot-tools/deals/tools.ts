import { randomUUID } from "node:crypto";
import { callApi, strip, toolHints, type McpServer } from "../shared";
import * as repo from "./repository";
import * as S from "./schema";

// Max's NATIVE deals — its own multi-pipeline sales board in max-agent — plus
// the products/services catalog, deal line items and the sales-workspace map.
// This is NOT HubSpot: the crm_* tools talk to a connected HubSpot portal.
// Scopes: deals:read / deals:write (sales-workspace: workspace:read).

export function registerDealTools(server: McpServer): void {
  // ── Deals ───────────────────────────────────────────────────────────────

  server.registerTool("list_deals", {
    title: "List deals",
    description: "List deals in Max's native pipeline (not HubSpot — that is crm_*). Filter by pipeline_id, stage_id, status, owner_id, organization_id, prospect_id, search or close-date window; paginate/sort. Returns {data: Deal[], count, page, pageSize}.",
    inputSchema: S.listDealsSchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.listDeals(t, strip(input, "bearer_token"))));

  server.registerTool("create_deal", {
    title: "Create deal",
    description: "Create a native Max deal. Requires name; defaults to the default pipeline's first open stage and EUR. prospect_ids links contacts (first = primary; required if created in a won stage). Returns {data: Deal}.",
    inputSchema: S.createDealSchema,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.createDeal(t, strip(input, "bearer_token"))));

  server.registerTool("get_deal", {
    title: "Get deal",
    description: "Get one native deal by deal_id with its organization and linked contacts (each omitted if the key lacks organizations:read / prospects:read). Returns {data: Deal}.",
    inputSchema: S.dealIdSchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) => repo.getDeal(t, input.deal_id)));

  server.registerTool("update_deal", {
    title: "Update deal",
    description: "Partially update a deal (name, amount, currency, close_date, probability, owner_id, organization_id, description, custom_fields, lost_reason). Change stage with move_deal / win_deal / lose_deal. Returns {data: Deal}.",
    inputSchema: S.updateDealSchema,
    ...toolHints.idempotent,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.updateDeal(t, input.deal_id, strip(input, "bearer_token", "deal_id"))));

  server.registerTool("delete_deal", {
    title: "Delete deal",
    description: "Permanently delete a deal, its line items and attached files. Irreversible. Fails (500) if documents are linked to it. Returns {success: true}.",
    inputSchema: S.dealIdSchema,
    ...toolHints.destructive,
  }, async (input) => callApi(input.bearer_token, (t) => repo.deleteDeal(t, input.deal_id)));

  server.registerTool("get_deal_board_totals", {
    title: "Get deal board totals",
    description: "Per-stage totals for one deal pipeline, optionally filtered by status/owner_id/organization_id/search. Returns {data: {<stage_id>: {count, sums: [{currency, amount, weighted}]}}}; weighted = amount × probability.",
    inputSchema: S.getDealBoardTotalsSchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.getDealBoardTotals(t, strip(input, "bearer_token"))));

  server.registerTool("move_deal", {
    title: "Move deal to stage",
    description: "Move a deal to stage_id (any pipeline). Runs the target stage's entry rules (notify, assign owner, or enroll the primary contact in a campaign). A won stage needs a linked contact. Returns {data: Deal}.",
    inputSchema: S.moveDealSchema,
    ...toolHints.idempotent,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.moveDeal(t, input.deal_id, input.stage_id)));

  server.registerTool("win_deal", {
    title: "Win deal",
    description: "Mark a deal won: moves it to its pipeline's won stage and runs that stage's entry rules. 400 deal_contact_required if no contact is linked (add_deal_prospect first). Returns {data: Deal}.",
    inputSchema: S.dealIdSchema,
    ...toolHints.idempotent,
  }, async (input) => callApi(input.bearer_token, (t) => repo.winDeal(t, input.deal_id)));

  server.registerTool("lose_deal", {
    title: "Lose deal",
    description: "Mark a deal lost with optional lost_reason: moves it to its pipeline's lost stage and runs that stage's entry rules. Returns {data: Deal}.",
    inputSchema: S.loseDealSchema,
    ...toolHints.idempotent,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.loseDeal(t, input.deal_id, strip(input, "bearer_token", "deal_id"))));

  server.registerTool("list_deal_stage_events", {
    title: "List deal stage history",
    description: "A deal's stage-change history, newest first. Returns {data: [{from_stage_id, to_stage_id, amount_at_change, changed_by, changed_at}]}.",
    inputSchema: S.dealIdSchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.listDealStageEvents(t, input.deal_id)));

  server.registerTool("add_deal_prospect", {
    title: "Add contact to deal",
    description: "Link a prospect to a deal as a contact, with optional role and is_primary. Returns {data: DealContact[]} (all the deal's contacts).",
    inputSchema: S.addDealProspectSchema,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.addDealProspect(t, input.deal_id, strip(input, "bearer_token", "deal_id"))));

  server.registerTool("remove_deal_prospect", {
    title: "Remove contact from deal",
    description: "Unlink a contact (prospect_id) from a deal. A won deal must keep at least one contact. Returns {success: true}.",
    inputSchema: S.removeDealProspectSchema,
    ...toolHints.destructive,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.removeDealProspect(t, input.deal_id, input.prospect_id)));

  // ── Pipelines & stages ──────────────────────────────────────────────────

  server.registerTool("list_deal_pipelines", {
    title: "List deal pipelines",
    description: "List deal pipelines with their ordered stages (id, label, type open/won/lost, win_probability, rule_count). Seeds the default pipeline on first use. Returns {data: Pipeline[]}.",
    inputSchema: S.listDealPipelinesSchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.listDealPipelines(t, strip(input, "bearer_token"))));

  server.registerTool("create_deal_pipeline", {
    title: "Create deal pipeline",
    description: "Create a deal pipeline seeded with the default stages (max 10 per workspace). Returns {data: Pipeline}.",
    inputSchema: S.createDealPipelineSchema,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.createDealPipeline(t, strip(input, "bearer_token"))));

  server.registerTool("update_deal_pipeline", {
    title: "Update deal pipeline",
    description: "Rename, reposition, make default, or archive/restore a deal pipeline. Returns {data: Pipeline}.",
    inputSchema: S.updateDealPipelineSchema,
    ...toolHints.idempotent,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.updateDealPipeline(t, input.pipeline_id, strip(input, "bearer_token", "pipeline_id"))));

  server.registerTool("delete_deal_pipeline", {
    title: "Delete deal pipeline",
    description: "Permanently delete an EMPTY deal pipeline; 409 pipeline_in_use if it holds deals (archive it instead). The last pipeline can't be deleted. Returns {success: true}.",
    inputSchema: S.dealPipelineIdSchema,
    ...toolHints.destructive,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.deleteDealPipeline(t, input.pipeline_id)));

  server.registerTool("create_deal_stage", {
    title: "Create deal stage",
    description: "Add a stage (column) to a deal pipeline (max 24): label, optional color, type, win_probability, position. Returns {data: Stage}.",
    inputSchema: S.createDealStageSchema,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.createDealStage(t, strip(input, "bearer_token"))));

  server.registerTool("update_deal_stage", {
    title: "Update deal stage",
    description: "Update a deal stage's label, color, type, win_probability or position. Changing type re-syncs its deals' status. Returns {data: Stage}.",
    inputSchema: S.updateDealStageSchema,
    ...toolHints.idempotent,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.updateDealStage(t, input.stage_id, strip(input, "bearer_token", "stage_id"))));

  server.registerTool("delete_deal_stage", {
    title: "Delete deal stage",
    description: "Delete a custom deal stage (default stages can't be). If it holds deals, pass reassignTo (a stage in the same pipeline) or it 409s reassign_required. Returns {success: true}.",
    inputSchema: S.deleteDealStageSchema,
    ...toolHints.destructive,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.deleteDealStage(t, input.stage_id, { reassignTo: input.reassignTo })));

  server.registerTool("reorder_deal_stages", {
    title: "Reorder deal stages",
    description: "Reorder a deal pipeline's stages; ordered_ids lists every stage id in the new order. Returns {data: Stage[]}.",
    inputSchema: S.reorderDealStagesSchema,
    ...toolHints.idempotent,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.reorderDealStages(t, strip(input, "bearer_token"))));

  // ── Stage entry-automation rules ────────────────────────────────────────

  server.registerTool("list_deal_stage_rules", {
    title: "List deal stage rules",
    description: "List a deal stage's entry-automation rules (run whenever a deal enters the stage). Returns {data: Rule[]}.",
    inputSchema: S.dealStageIdSchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.listDealStageRules(t, input.stage_id)));

  server.registerTool("create_deal_stage_rule", {
    title: "Create deal stage rule",
    description: "Add an entry rule to a deal stage: rule_action notify, assign or enroll_campaign (enrolls the deal's primary contact in a campaign, which sends outreach) with matching config. Returns {data: Rule}.",
    inputSchema: S.createDealStageRuleSchema,
  }, async (input) => {
    const { rule_action, ...rest } = strip(input, "bearer_token", "stage_id");
    return callApi(input.bearer_token, (t) =>
      repo.createDealStageRule(t, input.stage_id, { ...rest, action: rule_action }));
  });

  server.registerTool("update_deal_stage_rule", {
    title: "Update deal stage rule",
    description: "Update a deal stage rule's rule_action, config, is_enabled or position; config is re-validated against the action. Returns {data: Rule}.",
    inputSchema: S.updateDealStageRuleSchema,
    ...toolHints.idempotent,
  }, async (input) => {
    const { rule_action, ...rest } = strip(input, "bearer_token", "rule_id");
    const body = rule_action === undefined ? rest : { ...rest, action: rule_action };
    return callApi(input.bearer_token, (t) => repo.updateDealStageRule(t, input.rule_id, body));
  });

  server.registerTool("delete_deal_stage_rule", {
    title: "Delete deal stage rule",
    description: "Delete a deal stage entry rule. Returns {success: true}.",
    inputSchema: S.dealStageRuleIdSchema,
    ...toolHints.destructive,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.deleteDealStageRule(t, input.rule_id)));

  // ── Attachments (metadata only) ─────────────────────────────────────────

  server.registerTool("list_deal_attachments", {
    title: "List deal attachments",
    description: "List files attached to a deal — metadata only (file_name, mime_type, size_bytes, created_at, derivation status); no file contents. Returns {data: Attachment[]}.",
    inputSchema: S.dealIdSchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.listDealAttachments(t, input.deal_id)));

  server.registerTool("delete_deal_attachment", {
    title: "Delete deal attachment",
    description: "Permanently delete a file attached to a deal. Irreversible. Returns {success: true}.",
    inputSchema: S.deleteDealAttachmentSchema,
    ...toolHints.destructive,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.deleteDealAttachment(t, input.deal_id, input.attachment_id)));

  // ── Sales workspace & catalog ───────────────────────────────────────────

  server.registerTool("get_sales_workspace", {
    title: "Get sales workspace map",
    description: "Read-only map of the sales setup (lists, campaigns, signals, people/deal pipelines and stages, stage rules, meetings) as {nodes, edges, notices, updatedAt}. limit caps each source (1-100, default 50).",
    inputSchema: S.getSalesWorkspaceSchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.getSalesWorkspace(t, strip(input, "bearer_token"))));

  server.registerTool("list_sales_catalog_items", {
    title: "List sales catalog items",
    description: "Search the products/services catalog (30 per page) by name or kind. Returns {data: Offering[], count}.",
    inputSchema: S.listSalesCatalogItemsSchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.listSalesCatalogItems(t, strip(input, "bearer_token"))));

  server.registerTool("create_sales_catalog_item", {
    title: "Create sales catalog item",
    description: "Create a catalog product/service: name, kind; optional description, status draft|active|archived (default draft; only active can go on deals), unit_price+currency (both or neither), unit_label, attributes. Returns {data: Offering}.",
    inputSchema: S.createSalesCatalogItemSchema,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.createSalesCatalogItem(t, strip(input, "bearer_token"))));

  server.registerTool("update_sales_catalog_item", {
    title: "Update sales catalog item",
    description: "REPLACE a catalog item: omitted optional fields reset to defaults, so send the full record plus expected_updated_at (its current updated_at; 409 if it changed). Returns {data: Offering}.",
    inputSchema: S.updateSalesCatalogItemSchema,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.updateSalesCatalogItem(t, input.catalog_item_id, strip(input, "bearer_token", "catalog_item_id"))));

  server.registerTool("list_sales_catalog_fields", {
    title: "List sales catalog fields",
    description: "List the custom catalog field definitions (key, label, type, kind, options) that catalog items' attributes use. Returns {data: Field[]}.",
    inputSchema: S.listSalesCatalogFieldsSchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) => repo.listSalesCatalogFields(t)));

  server.registerTool("create_sales_catalog_field", {
    title: "Create sales catalog field",
    description: "Define a custom catalog field (max 50): key, label, type text|number|boolean|date|select, kind product|service|both, options (required for select only). Returns {data: Field}.",
    inputSchema: S.createSalesCatalogFieldSchema,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.createSalesCatalogField(t, strip(input, "bearer_token"))));

  server.registerTool("list_deal_line_items", {
    title: "List deal line items",
    description: "List a deal's product/service line items (snapshots, including removed ones with removed_at set). Returns {data: LineItem[]}.",
    inputSchema: S.listDealLineItemsSchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.listDealLineItems(t, input.deal_id)));

  server.registerTool("add_deal_line_item", {
    title: "Add deal line item",
    description: "Add an active catalog item (offering_id) to an OPEN deal at an agreed unit_price in the deal's currency, with quantity (default 1) and scope. Returns {data: LineItem}.",
    inputSchema: S.addDealLineItemSchema,
  }, async (input) => {
    const body = { ...strip(input, "bearer_token", "deal_id"), id: input.id ?? randomUUID() };
    return callApi(input.bearer_token, (t) => repo.addDealLineItem(t, input.deal_id, body));
  });

  server.registerTool("remove_deal_line_item", {
    title: "Remove deal line item",
    description: "Remove a line item from an OPEN deal (soft-removed, kept in history). Returns {data: {id}}.",
    inputSchema: S.removeDealLineItemSchema,
    ...toolHints.destructive,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.removeDealLineItem(t, input.deal_id, input.line_item_id)));
}

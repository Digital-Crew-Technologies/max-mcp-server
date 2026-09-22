import { callApi, omitKey, strip, toolHints, type McpServer } from "../shared";
import * as repo from "./repository";
import * as S from "./schema";

export function registerCampaignTools(server: McpServer): void {
  server.registerTool("list_campaigns", {
    title: "List campaigns",
    description: "List all outreach campaigns. Filter by status, search by name, paginate and sort.",
    inputSchema: S.listCampaignsSchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.listCampaigns(t, omitKey(input, "bearer_token"))));

  server.registerTool("get_campaign", {
    title: "Get campaign",
    description: "Get full details of a campaign by ID — workflow, scheduling, accounts, prospect lists, stats.",
    inputSchema: S.getCampaignSchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) => repo.getCampaign(t, input.id)));

  server.registerTool("get_campaign_memory", {
    title: "Get campaign memory",
    description: "Read Max's durable memory for a campaign (ICP, decisions, notes). Recall this when working on one of several simultaneous campaigns so you keep them straight.",
    inputSchema: S.getCampaignMemorySchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) => repo.getCampaignMemory(t, input.id)));

  server.registerTool("update_campaign_memory", {
    title: "Update campaign memory",
    description: "Record/update Max's durable memory for a campaign. Pass a partial 'memory' object (top-level keys merge; send the full array to change decisions/notes). Use it to remember ICP, decisions, and progress per campaign.",
    inputSchema: S.updateCampaignMemorySchema,
    ...toolHints.idempotent,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.updateCampaignMemory(t, input.id, input.memory as Record<string, unknown>)));

  server.registerTool("create_campaign", {
    title: "Create campaign",
    description: "Create a new campaign in draft state. Requires name, included_lists, and accounts. Won't send until launched.",
    inputSchema: S.createCampaignSchema,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.createCampaign(t, strip(input, "bearer_token"))));

  server.registerTool("update_campaign", {
    title: "Update campaign",
    description: "Partial update of a campaign — name, description, workflow, lists, accounts, scheduling. Name and description can be changed at any status (including launched campaigns); all other fields require the campaign to be in 'draft' or 'stopped'.",
    inputSchema: S.updateCampaignSchema,
    ...toolHints.idempotent,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.updateCampaign(t, input.id, strip(input, "bearer_token", "id"))));

  server.registerTool("delete_campaign", {
    title: "Delete campaign",
    description: "Permanently delete a campaign and all its workflow executions. Prefer archive for soft removal.",
    inputSchema: S.deleteCampaignSchema,
    ...toolHints.destructive,
  }, async (input) => callApi(input.bearer_token, (t) => repo.deleteCampaign(t, input.id)));

  server.registerTool("launch_campaign", {
    title: "Launch campaign",
    description: "Launch a draft campaign — transitions draft → active and creates workflow executions for each prospect.",
    inputSchema: S.campaignTransitionSchema,
  }, async (input) => callApi(input.bearer_token, (t) => repo.launchCampaign(t, input.id)));

  server.registerTool("pause_campaign", {
    title: "Pause campaign",
    description: "Pause an active campaign — stops dequeueing new actions (in-flight calls finish).",
    inputSchema: S.campaignTransitionSchema,
    ...toolHints.destructive,
  }, async (input) => callApi(input.bearer_token, (t) => repo.pauseCampaign(t, input.id)));

  server.registerTool("resume_campaign", {
    title: "Resume campaign",
    description: "Resume a paused campaign — transitions paused → active.",
    inputSchema: S.campaignTransitionSchema,
  }, async (input) => callApi(input.bearer_token, (t) => repo.resumeCampaign(t, input.id)));

  server.registerTool("stop_campaign", {
    title: "Stop campaign",
    description: "Stop an active or paused campaign permanently — cannot be resumed.",
    inputSchema: S.campaignTransitionSchema,
    ...toolHints.destructive,
  }, async (input) => callApi(input.bearer_token, (t) => repo.stopCampaign(t, input.id)));

  server.registerTool("archive_campaign", {
    title: "Archive campaign",
    description: "Archive a campaign (soft delete) — hidden from default views but restorable.",
    inputSchema: S.campaignTransitionSchema,
    ...toolHints.destructive,
  }, async (input) => callApi(input.bearer_token, (t) => repo.archiveCampaign(t, input.id)));

  server.registerTool("restore_campaign", {
    title: "Restore campaign",
    description: "Restore an archived campaign back to draft status.",
    inputSchema: S.campaignTransitionSchema,
  }, async (input) => callApi(input.bearer_token, (t) => repo.restoreCampaign(t, input.id)));

  server.registerTool("get_campaign_stats", {
    title: "Get campaign stats",
    description: "Aggregate performance stats — email open/reply rates, LinkedIn connection/reply rates, execution counts.",
    inputSchema: S.getCampaignStatsSchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) => repo.getCampaignStats(t, input.id)));

  server.registerTool("get_campaign_lead_analytics", {
    title: "Get campaign lead analytics",
    description: "Per-prospect breakdown — where each lead is in the workflow and message event history.",
    inputSchema: S.getCampaignLeadAnalyticsSchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.getCampaignLeadAnalytics(t, input.id, { page: input.page, pageSize: input.pageSize })));

  server.registerTool("get_campaign_node_run_counts", {
    title: "Get campaign node run counts",
    description: "Map of workflow node ID → execution count. Useful for funnel visualization.",
    inputSchema: S.getCampaignNodeRunCountsSchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) => repo.getCampaignNodeRunCounts(t, input.id)));

  server.registerTool("list_schedule_presets", {
    title: "List saved campaign schedules",
    description: "List the workspace's reusable sending schedules (timezone, available days, time windows). Check these before asking someone to spell out a schedule — copy the default one's scheduling_config into a new campaign.",
    inputSchema: S.listSchedulePresetsSchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) => repo.listSchedulePresets(t)));

  server.registerTool("create_schedule_preset", {
    title: "Save a campaign schedule",
    description: "Save a scheduling_config under a name so later campaigns can reuse it. Names are unique per workspace. Set is_default to pre-fill it on new campaigns. Applying a preset copies it — later edits never retime a running campaign.",
    inputSchema: S.createSchedulePresetSchema,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.createSchedulePreset(t, strip(input, "bearer_token"))));

  server.registerTool("update_schedule_preset", {
    title: "Update a saved campaign schedule",
    description: "Rename a saved schedule, replace its scheduling_config, or make it the workspace default. At least one field beyond the id is required.",
    inputSchema: S.updateSchedulePresetSchema,
    ...toolHints.idempotent,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.updateSchedulePreset(t, input.id, strip(input, "bearer_token", "id"))));

  server.registerTool("delete_schedule_preset", {
    title: "Delete a saved campaign schedule",
    description: "Delete a saved schedule. Campaigns keep their own copy, so this never changes how an existing campaign sends.",
    inputSchema: S.deleteSchedulePresetSchema,
    ...toolHints.destructive,
  }, async (input) => callApi(input.bearer_token, (t) => repo.deleteSchedulePreset(t, input.id)));

  // ── A/B tests ──────────────────────────────────────────────────────────────

  server.registerTool("get_campaign_ab_tests", {
    title: "Get campaign A/B tests",
    description: "Every email step testing 2+ variants: weights, live traffic share, per-variant sent/open/click/reply/bounce rates and a verdict (collecting/inconclusive/winner with confidence). Empty tests[] when none run.",
    inputSchema: S.getCampaignAbTestsSchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) => repo.getCampaignAbTests(t, input.id)));

  server.registerTool("update_campaign_ab_test", {
    title: "Control a campaign A/B test",
    description: "Apply one live traffic control to an email step's A/B test: pause/activate/promote a variant (needs variant_id), set_weights (needs weights), or reset. Takes effect on the next send, including already-enrolled prospects.",
    inputSchema: S.updateCampaignAbTestSchema,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.updateCampaignAbTest(t, input.id, {
      action: input.operation,
      node_id: input.node_id,
      variant_id: input.variant_id,
      weights: input.weights,
    })));

  // ── Audience ───────────────────────────────────────────────────────────────

  server.registerTool("get_campaign_audience", {
    title: "Get campaign audience",
    description: "Lists the campaign draws from (included/excluded, live member count, pending_count not yet enrolled) plus a rollup: in_campaign, active, finished, removed, manual, pending_from_lists. Also says whether the audience is editable and enrolls immediately.",
    inputSchema: S.getCampaignAudienceSchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) => repo.getCampaignAudience(t, input.id)));

  server.registerTool("list_campaign_audience_prospects", {
    title: "List people in a campaign",
    description: "Paginated people in a campaign with enrollment status, source (list/manual) and workflow execution status. Filter by search, enrollment_status, source. Returns { data, count, page, pageSize }.",
    inputSchema: S.listCampaignAudienceProspectsSchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.listCampaignAudienceProspects(t, input.id, {
      page: input.page,
      pageSize: input.pageSize,
      search: input.search,
      status: input.enrollment_status,
      source: input.source,
    })));

  server.registerTool("add_campaign_audience_prospects", {
    title: "Add people to a campaign",
    description: "Add people directly (no list) by prospect_ids, organization_ids and/or stage_keys — at least one required. On an active/paused campaign they START THE SEQUENCE IMMEDIATELY (outreach is sent). Returns enrolled/already_enrolled/reactivated counts and *_truncated flags when the 1000-person cap was hit.",
    inputSchema: S.addCampaignAudienceProspectsSchema,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.addCampaignAudienceProspects(t, input.id, {
      prospect_ids: input.prospect_ids,
      organization_ids: input.organization_ids,
      stage_keys: input.stage_keys,
    })));

  server.registerTool("remove_campaign_audience_prospects", {
    title: "Remove people from a campaign",
    description: "Take people out of a campaign and stop any in-flight executions so they get no further outreach. Enrollment is kept as 'removed'; a later sync never re-adds them.",
    inputSchema: S.removeCampaignAudienceProspectsSchema,
    ...toolHints.destructive,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.removeCampaignAudienceProspects(t, input.id, { prospect_ids: input.prospect_ids })));

  server.registerTool("attach_campaign_audience_list", {
    title: "Attach a list to a campaign",
    description: "Attach a prospect list as included (default) or excluded, also while running. Unless enroll_now=false, an included list's new members are enrolled at once — on an active/paused campaign that starts outreach to them.",
    inputSchema: S.attachCampaignAudienceListSchema,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.attachCampaignAudienceList(t, input.id, {
      prospect_list_id: input.prospect_list_id,
      inclusion_type: input.inclusion_type,
      enroll_now: input.enroll_now,
    })));

  server.registerTool("detach_campaign_audience_list", {
    title: "Detach a list from a campaign",
    description: "Detach a prospect list from a campaign. People it already enrolled stay in — use remove_campaign_audience_prospects to stop them.",
    inputSchema: S.detachCampaignAudienceListSchema,
    ...toolHints.destructive,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.detachCampaignAudienceList(t, input.id, input.list_id)));

  server.registerTool("sync_campaign_audience", {
    title: "Sync campaign audience from lists",
    description: "Enroll members added to the campaign's included lists since it started (minus excluded lists; removed people are never re-added). On an active/paused campaign they start the sequence immediately.",
    inputSchema: S.syncCampaignAudienceSchema,
  }, async (input) => callApi(input.bearer_token, (t) => repo.syncCampaignAudience(t, input.id)));

  // ── Feeds, preflight, duplicate ────────────────────────────────────────────

  server.registerTool("list_campaign_conversations", {
    title: "List campaign conversations",
    description: "Newest-first feed of every Unibox message the campaign sent/received (chat_id, direction, subject, preview, status) merged with its physical letters (delivery status). Returns { data: { items, counts } }.",
    inputSchema: S.listCampaignConversationsSchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) => repo.listCampaignConversations(t, input.id)));

  server.registerTool("get_campaign_feed", {
    title: "Get campaign activity feed",
    description: "Most recent workflow steps executed in a campaign, newest first: node, action_type, status, error_message, prospect. limit default 20, max 100.",
    inputSchema: S.getCampaignFeedSchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.getCampaignFeed(t, input.id, { limit: input.limit })));

  server.registerTool("get_campaign_launch_preflight", {
    title: "Check campaign launch reachability",
    description: "Before launch: how many people in the audience at least one sequence step can reach. Returns { audience, reachable, unreachable, required_channels, segments } (segments keyed by channel combo, e.g. 'email+linkedin').",
    inputSchema: S.getCampaignLaunchPreflightSchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) => repo.getCampaignLaunchPreflight(t, input.id)));

  server.registerTool("duplicate_campaign", {
    title: "Duplicate campaign",
    description: "Copy a campaign into a new draft (workflow, scheduling, exclusions, lists, accounts). Run history, enrolled people and sharing are not copied. Returns { campaign }.",
    inputSchema: S.duplicateCampaignSchema,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.duplicateCampaign(t, input.id, input.name === undefined ? {} : { name: input.name })));

  server.registerTool("bulk_get_campaign_node_run_counts", {
    title: "Get node run counts for several campaigns",
    description: "Node run counts for up to 100 campaigns in one call: { nodeRunCounts: { campaignId: { nodeId: count } } }. Inaccessible ids and campaigns with no runs are omitted.",
    inputSchema: S.bulkGetCampaignNodeRunCountsSchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) => repo.bulkGetCampaignNodeRunCounts(t, input.ids)));

  // ── Public share link ──────────────────────────────────────────────────────

  server.registerTool("get_campaign_share_link", {
    title: "Get campaign share link",
    description: "Read a campaign's public share link: { data: { token, enabled, view_count, ... } | null }. Public URL is <app>/share/<token>. Owner or workspace admin only.",
    inputSchema: S.campaignShareLinkSchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) => repo.getCampaignShareLink(t, input.id)));

  server.registerTool("create_campaign_share_link", {
    title: "Create campaign share link",
    description: "PUBLISHES the campaign: enables an 'anyone with the link' URL (<app>/share/<token>) viewable without login. Re-enables the same token if one existed. Owner or workspace admin only; confirm with the user first.",
    inputSchema: S.campaignShareLinkSchema,
    ...toolHints.idempotent,
  }, async (input) => callApi(input.bearer_token, (t) => repo.createCampaignShareLink(t, input.id)));

  server.registerTool("revoke_campaign_share_link", {
    title: "Revoke campaign share link",
    description: "Disable a campaign's public share link — anyone holding the URL loses access immediately. Owner or workspace admin only.",
    inputSchema: S.campaignShareLinkSchema,
    ...toolHints.destructive,
  }, async (input) => callApi(input.bearer_token, (t) => repo.revokeCampaignShareLink(t, input.id)));
}

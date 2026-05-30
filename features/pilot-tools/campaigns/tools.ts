import { callApi, strip, type McpServer } from "../shared";
import * as repo from "./repository";
import * as S from "./schema";

export function registerCampaignTools(server: McpServer): void {
  server.registerTool("list_campaigns", {
    title: "List campaigns",
    description: "List all outreach campaigns. Filter by status, search by name, paginate and sort.",
    inputSchema: S.listCampaignsSchema,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.listCampaigns(t, strip(input, "bearer_token") as any)));

  server.registerTool("get_campaign", {
    title: "Get campaign",
    description: "Get full details of a campaign by ID — workflow, scheduling, accounts, prospect lists, stats.",
    inputSchema: S.getCampaignSchema,
  }, async (input) => callApi(input.bearer_token, (t) => repo.getCampaign(t, input.id)));

  server.registerTool("get_campaign_memory", {
    title: "Get campaign memory",
    description: "Read Max's durable memory for a campaign (ICP, decisions, notes). Recall this when working on one of several simultaneous campaigns so you keep them straight.",
    inputSchema: S.getCampaignMemorySchema,
  }, async (input) => callApi(input.bearer_token, (t) => repo.getCampaignMemory(t, input.id)));

  server.registerTool("update_campaign_memory", {
    title: "Update campaign memory",
    description: "Record/update Max's durable memory for a campaign. Pass a partial 'memory' object (top-level keys merge; send the full array to change decisions/notes). Use it to remember ICP, decisions, and progress per campaign.",
    inputSchema: S.updateCampaignMemorySchema,
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
    description: "Partial update of a campaign — name, description, workflow, lists, accounts, scheduling.",
    inputSchema: S.updateCampaignSchema,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.updateCampaign(t, input.id, strip(input, "bearer_token", "id"))));

  server.registerTool("delete_campaign", {
    title: "Delete campaign",
    description: "Permanently delete a campaign and all its workflow executions. Prefer archive for soft removal.",
    inputSchema: S.deleteCampaignSchema,
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
  }, async (input) => callApi(input.bearer_token, (t) => repo.stopCampaign(t, input.id)));

  server.registerTool("archive_campaign", {
    title: "Archive campaign",
    description: "Archive a campaign (soft delete) — hidden from default views but restorable.",
    inputSchema: S.campaignTransitionSchema,
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
  }, async (input) => callApi(input.bearer_token, (t) => repo.getCampaignStats(t, input.id)));

  server.registerTool("get_campaign_lead_analytics", {
    title: "Get campaign lead analytics",
    description: "Per-prospect breakdown — where each lead is in the workflow and message event history.",
    inputSchema: S.getCampaignLeadAnalyticsSchema,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.getCampaignLeadAnalytics(t, input.id, { page: input.page, pageSize: input.pageSize })));

  server.registerTool("get_campaign_node_run_counts", {
    title: "Get campaign node run counts",
    description: "Map of workflow node ID → execution count. Useful for funnel visualization.",
    inputSchema: S.getCampaignNodeRunCountsSchema,
  }, async (input) => callApi(input.bearer_token, (t) => repo.getCampaignNodeRunCounts(t, input.id)));
}

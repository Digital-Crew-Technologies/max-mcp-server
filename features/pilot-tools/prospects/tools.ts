import { callApi, omitKey, strip, toolHints, type McpServer } from "../shared";
import * as repo from "./repository";
import * as S from "./schema";

export function registerProspectTools(server: McpServer): void {
  server.registerTool("list_prospects", {
    title: "List prospects",
    description: "List prospects with rich filtering — search, status, org, titles, countries, industries, pagination, sorting.",
    inputSchema: S.listProspectsSchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.listProspects(t, omitKey(input, "bearer_token"))));

  server.registerTool("get_prospect", {
    title: "Get prospect",
    description: "Get full profile of a prospect — name, title, company, LinkedIn, email, location, enrichment data.",
    inputSchema: S.getProspectSchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) => repo.getProspect(t, input.id)));

  server.registerTool("create_prospect", {
    title: "Create prospect",
    description: "Create a single prospect. Deduplicates by email — returns existing row if email already exists.",
    inputSchema: S.createProspectSchema,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.createProspect(t, strip(input, "bearer_token"))));

  server.registerTool("update_prospect", {
    title: "Update prospect",
    description: "Update a prospect's fields (partial update).",
    inputSchema: S.updateProspectSchema,
    ...toolHints.idempotent,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.updateProspect(t, input.id, strip(input, "bearer_token", "id"))));

  server.registerTool("delete_prospect", {
    title: "Delete prospect",
    description: "Delete a prospect permanently.",
    inputSchema: S.deleteProspectSchema,
    ...toolHints.destructive,
  }, async (input) => callApi(input.bearer_token, (t) => repo.deleteProspect(t, input.id)));

  server.registerTool("bulk_import_prospects", {
    title: "Bulk import prospects",
    description: "Import multiple prospects at once. Deduplicates by email. Returns imported/existing/failed counts.",
    inputSchema: S.bulkImportProspectsSchema,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.bulkImportProspects(t, { prospects: input.prospects })));

  server.registerTool("bulk_delete_prospects", {
    title: "Bulk delete prospects",
    description: "Delete multiple prospects by IDs.",
    inputSchema: S.bulkDeleteProspectsSchema,
    ...toolHints.destructive,
  }, async (input) => callApi(input.bearer_token, (t) => repo.bulkDeleteProspects(t, input.ids)));

  server.registerTool("get_prospect_campaign_activity", {
    title: "Get prospect campaign activity",
    description: "Chronological log of message events for a prospect across all campaigns (newest first).",
    inputSchema: S.getProspectCampaignActivitySchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) => repo.getProspectCampaignActivity(t, input.id)));

  // ── Sub-resources ──────────────────────────────────────────────────────────

  server.registerTool("list_prospect_campaigns", {
    title: "List prospect campaigns",
    description: "Campaigns a prospect is enrolled in: campaign name/status, enrollment status, source, added/removed dates, next scheduled step.",
    inputSchema: S.prospectIdSchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) => repo.listProspectCampaigns(t, input.id)));

  server.registerTool("get_prospect_qualification", {
    title: "Get prospect qualification",
    description: "Qualification derived from the prospect's latest confirmed meeting transcript. Returns {state: available|needs_confirmation|no_meeting, meeting, qualification}. API keys need prospects:read AND workspace:read.",
    inputSchema: S.prospectIdSchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) => repo.getProspectQualification(t, input.id)));

  server.registerTool("list_prospect_profile_activities", {
    title: "List prospect profile activities",
    description: "Stored social/profile activity timeline for a prospect (posts, contact changes, research found by profile hooks), newest first.",
    inputSchema: S.prospectIdSchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) => repo.listProspectProfileActivities(t, input.id)));

  server.registerTool("list_prospect_profile_hooks", {
    title: "List prospect profile hooks",
    description: "Recurring watchers on a prospect (provider, source, frequency, active, last run status).",
    inputSchema: S.prospectIdSchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) => repo.listProspectProfileHooks(t, input.id)));

  server.registerTool("create_prospect_profile_hook", {
    title: "Create prospect profile hook",
    description: "Create a recurring watcher on a prospect (scrapecreators social posts, fullenrich contact refresh, or claire research). Each scheduled run may charge credits. Results land in list_prospect_profile_activities.",
    inputSchema: S.createProspectProfileHookSchema,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.createProspectProfileHook(t, input.id, strip(input, "bearer_token", "id"))));

  server.registerTool("update_prospect_profile_hook", {
    title: "Update prospect profile hook",
    description: "Update a profile hook's source, label, custom_prompt, frequency, or active (false pauses it).",
    inputSchema: S.updateProspectProfileHookSchema,
    ...toolHints.idempotent,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.updateProspectProfileHook(t, input.id, input.hook_id, strip(input, "bearer_token", "id", "hook_id"))));

  server.registerTool("delete_prospect_profile_hook", {
    title: "Delete prospect profile hook",
    description: "Delete a profile hook permanently.",
    inputSchema: S.prospectProfileHookIdSchema,
    ...toolHints.destructive,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.deleteProspectProfileHook(t, input.id, input.hook_id)));

  server.registerTool("run_prospect_profile_hook", {
    title: "Run prospect profile hook now",
    description: "Run a profile hook immediately (synchronous, up to ~5 min). May charge credits for the provider work. Returns {status, activitiesWritten, summary}.",
    inputSchema: S.prospectProfileHookIdSchema,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.runProspectProfileHook(t, input.id, input.hook_id)));

  server.registerTool("enrich_prospect_with_claire", {
    title: "Enrich prospect with Claire",
    description: "Resolve one prospect through Claire and fill missing/wrong fields (conflicts saved as alternates). CHARGES CREDITS on every lookup, even a miss; a complete record returns skipped:true free. 402 = insufficient credits. Synchronous, up to ~2 min.",
    inputSchema: S.prospectIdSchema,
  }, async (input) => callApi(input.bearer_token, (t) => repo.claireEnrichProspect(t, input.id)));

  server.registerTool("create_prospect_intelligence_watchers", {
    title: "Create prospect research watchers",
    description: "Ask Claire to propose recurring research watchers for a prospect and create up to 4 (as claire profile hooks, deduped against existing). Runs a Claire search (~2 min); later hook runs charge credits. 409 if a run is already in progress.",
    inputSchema: S.prospectIdSchema,
  }, async (input) => callApi(input.bearer_token, (t) => repo.createProspectIntelligenceWatch(t, input.id)));

  server.registerTool("refresh_prospect_images", {
    title: "Refresh prospect images",
    description: "Re-fetch the prospect's photo and their company's logo. Returns {photo_updated, logo_updated, photo_url, logo_url, warnings}.",
    inputSchema: S.prospectIdSchema,
    ...toolHints.idempotent,
  }, async (input) => callApi(input.bearer_token, (t) => repo.refreshProspectImages(t, input.id)));

  server.registerTool("refresh_prospect_social_profiles", {
    title: "Refresh prospect social profiles",
    description: "Recompute the prospect's social_profiles list from its row and enrichment data (no provider call). Returns the refreshed list.",
    inputSchema: S.prospectIdSchema,
    ...toolHints.idempotent,
  }, async (input) => callApi(input.bearer_token, (t) => repo.refreshProspectSocialProfiles(t, input.id)));

  // ── Public share links ─────────────────────────────────────────────────────
  // Owner-or-admin only upstream (the whole People DB: admin only). The token
  // IS the grant: anyone holding /share/{token} can view the data.

  server.registerTool("get_prospect_share_link", {
    title: "Get prospect share link",
    description: "Get a prospect's public share link {token, enabled, view_count} or null. Owner or admin only.",
    inputSchema: S.prospectIdSchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) => repo.getProspectShareLink(t, input.id)));

  server.registerTool("create_prospect_share_link", {
    title: "Create prospect share link",
    description: "PUBLISHES the prospect publicly: anyone with the link (/share/{token}) can view it (contact details masked). Creates or re-enables the same token. Owner or admin only.",
    inputSchema: S.prospectIdSchema,
    ...toolHints.idempotent,
  }, async (input) => callApi(input.bearer_token, (t) => repo.createProspectShareLink(t, input.id)));

  server.registerTool("revoke_prospect_share_link", {
    title: "Revoke prospect share link",
    description: "Disable a prospect's public share link; the URL stops working (re-enabling restores the same token).",
    inputSchema: S.prospectIdSchema,
    ...toolHints.destructive,
  }, async (input) => callApi(input.bearer_token, (t) => repo.revokeProspectShareLink(t, input.id)));

  server.registerTool("get_people_share_link", {
    title: "Get People database share link",
    description: "Get the public share link of the workspace's whole People database {token, enabled, view_count} or null. Admin only.",
    inputSchema: S.tokenOnlySchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) => repo.getPeopleShareLink(t)));

  server.registerTool("create_people_share_link", {
    title: "Create People database share link",
    description: "PUBLISHES the workspace's ENTIRE People database: anyone with the link (/share/{token}) can view it (contact details masked). Creates or re-enables. Admin only.",
    inputSchema: S.tokenOnlySchema,
    ...toolHints.idempotent,
  }, async (input) => callApi(input.bearer_token, (t) => repo.createPeopleShareLink(t)));

  server.registerTool("revoke_people_share_link", {
    title: "Revoke People database share link",
    description: "Disable the People database public share link; the URL stops working. Admin only.",
    inputSchema: S.tokenOnlySchema,
    ...toolHints.destructive,
  }, async (input) => callApi(input.bearer_token, (t) => repo.revokePeopleShareLink(t)));

  // ── Global search ──────────────────────────────────────────────────────────

  server.registerTool("search_workspace", {
    title: "Search workspace",
    description: "Full-text search across people, organizations, deals, lists, campaigns, tasks and meeting notes. Returns {query, groups:[{type, total, hits:[{id, title, subtitle, meta, href}]}]}; entity kinds the key lacks scope for come back empty.",
    inputSchema: S.searchWorkspaceSchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.searchWorkspace(t, omitKey(input, "bearer_token"))));
}

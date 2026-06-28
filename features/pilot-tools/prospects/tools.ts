import { callApi, omitKey, strip, type McpServer } from "../shared";
import * as repo from "./repository";
import * as S from "./schema";

export function registerProspectTools(server: McpServer): void {
  server.registerTool("list_prospects", {
    title: "List prospects",
    description: "List prospects with rich filtering — search, status, org, titles, countries, industries, pagination, sorting.",
    inputSchema: S.listProspectsSchema,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.listProspects(t, omitKey(input, "bearer_token"))));

  server.registerTool("get_prospect", {
    title: "Get prospect",
    description: "Get full profile of a prospect — name, title, company, LinkedIn, email, location, enrichment data.",
    inputSchema: S.getProspectSchema,
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
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.updateProspect(t, input.id, strip(input, "bearer_token", "id"))));

  server.registerTool("delete_prospect", {
    title: "Delete prospect",
    description: "Delete a prospect permanently.",
    inputSchema: S.deleteProspectSchema,
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
  }, async (input) => callApi(input.bearer_token, (t) => repo.bulkDeleteProspects(t, input.ids)));

  server.registerTool("get_prospect_campaign_activity", {
    title: "Get prospect campaign activity",
    description: "Chronological log of message events for a prospect across all campaigns (newest first).",
    inputSchema: S.getProspectCampaignActivitySchema,
  }, async (input) => callApi(input.bearer_token, (t) => repo.getProspectCampaignActivity(t, input.id)));
}

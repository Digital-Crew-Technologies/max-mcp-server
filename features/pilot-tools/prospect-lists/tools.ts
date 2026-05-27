import { callApi, strip, type McpServer } from "../shared";
import * as repo from "./repository";
import * as S from "./schema";

export function registerProspectListTools(server: McpServer): void {
  server.registerTool("list_prospect_lists", {
    title: "List prospect lists",
    description: "List all prospect lists — name, status, result counts, and search criteria.",
    inputSchema: S.listProspectListsSchema,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.listProspectLists(t, { page: input.page, pageSize: input.pageSize })));

  server.registerTool("get_prospect_list", {
    title: "Get prospect list",
    description: "Get full details of a prospect list by ID — status, search config, result counts, timestamps.",
    inputSchema: S.getProspectListSchema,
  }, async (input) => callApi(input.bearer_token, (t) => repo.getProspectList(t, input.id)));

  server.registerTool("create_prospect_list", {
    title: "Create prospect list",
    description: "Create an empty platform prospect list. For Apollo-sourced lists, use apollo_create_list instead.",
    inputSchema: S.createProspectListSchema,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.createProspectList(t, strip(input, "bearer_token"))));

  server.registerTool("update_prospect_list", {
    title: "Update prospect list",
    description: "Update a prospect list (only list_name and status are editable).",
    inputSchema: S.updateProspectListSchema,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.updateProspectList(t, input.id, strip(input, "bearer_token", "id"))));

  server.registerTool("delete_prospect_list", {
    title: "Delete prospect list",
    description: "Delete a prospect list (prospects themselves are NOT deleted).",
    inputSchema: S.deleteProspectListSchema,
  }, async (input) => callApi(input.bearer_token, (t) => repo.deleteProspectList(t, input.id)));

  server.registerTool("list_prospect_list_members", {
    title: "List prospect list members",
    description: "List all prospects in a specific list — paginated, searchable, sortable.",
    inputSchema: S.listProspectListMembersSchema,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.listProspectListMembers(t, input.id, strip(input, "bearer_token", "id") as any)));

  server.registerTool("add_prospects_to_list", {
    title: "Add prospects to list",
    description: "Add prospects to a prospect list by their UUIDs.",
    inputSchema: S.addProspectsToListSchema,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.addProspectsToList(t, input.id, input.prospect_ids)));

  server.registerTool("remove_prospects_from_list", {
    title: "Remove prospects from list",
    description: "Remove prospects from a prospect list by their UUIDs.",
    inputSchema: S.removeProspectsFromListSchema,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.removeProspectsFromList(t, input.id, input.prospect_ids)));

  server.registerTool("search_prospect_lists", {
    title: "Search prospects (preview)",
    description: "Preview filter results without creating a list — search by titles, countries, industries, employee count, etc.",
    inputSchema: S.searchProspectListsSchema,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.searchProspectLists(t, strip(input, "bearer_token"))));

  server.registerTool("import_prospect_list_csv", {
    title: "Import prospect list from CSV",
    description: "Create a new prospect list and import prospects in one call. Each row needs an email (for dedup).",
    inputSchema: S.importProspectListCsvSchema,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.importProspectListCsv(t, strip(input, "bearer_token"))));
}

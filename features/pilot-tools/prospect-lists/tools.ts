import { callApi, omitKey, resolveBearerToken, strip, toolHints, type McpServer } from "../shared";
import * as repo from "./repository";
import * as S from "./schema";

const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled"]);

async function pollUntilTerminal(
  token: string,
  id: string,
  timeoutMs: number,
  intervalMs: number,
): Promise<{ text: string; status: string | null; timedOut: boolean }> {
  const deadline = Date.now() + timeoutMs;
  let lastBody = "";
  let lastStatus: string | null = null;

  while (Date.now() < deadline) {
    const res = await repo.getProspectList(token, id);
    lastBody = await res.text();
    if (!res.ok) {
      return { text: `API error (${res.status}): ${lastBody || res.statusText}`, status: null, timedOut: false };
    }
    try {
      const parsed = JSON.parse(lastBody);
      lastStatus = parsed?.data?.status ?? parsed?.status ?? null;
      if (lastStatus && TERMINAL_STATUSES.has(lastStatus)) {
        return { text: lastBody, status: lastStatus, timedOut: false };
      }
    } catch {
      // Non-JSON response; keep polling
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await new Promise((r) => setTimeout(r, Math.min(intervalMs, remaining)));
  }
  return { text: lastBody, status: lastStatus, timedOut: true };
}

export function registerProspectListTools(server: McpServer): void {
  server.registerTool("list_prospect_lists", {
    title: "List prospect lists",
    description: "List all prospect lists — name, status, result counts, and search criteria.",
    inputSchema: S.listProspectListsSchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.listProspectLists(t, { page: input.page, pageSize: input.pageSize })));

  server.registerTool("get_prospect_list", {
    title: "Get prospect list",
    description: "Get full details of a prospect list by ID — status, search config, result counts, timestamps.",
    inputSchema: S.getProspectListSchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) => repo.getProspectList(t, input.id)));

  server.registerTool("create_prospect_list", {
    title: "Create prospect list",
    description: "Create an empty platform prospect list. To source NEW leads into a list use auto_create_prospect_list (GetLeads → Explorium), or pin a provider in this order: getleads_create_list, then explorium_create_list, then apollo_create_list as a last resort.",
    inputSchema: S.createProspectListSchema,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.createProspectList(t, strip(input, "bearer_token"))));

  server.registerTool("update_prospect_list", {
    title: "Update prospect list",
    description: "Update a prospect list (only list_name and status are editable).",
    inputSchema: S.updateProspectListSchema,
    ...toolHints.idempotent,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.updateProspectList(t, input.id, strip(input, "bearer_token", "id"))));

  server.registerTool("delete_prospect_list", {
    title: "Delete prospect list",
    description: "Delete a prospect list (prospects themselves are NOT deleted).",
    inputSchema: S.deleteProspectListSchema,
    ...toolHints.destructive,
  }, async (input) => callApi(input.bearer_token, (t) => repo.deleteProspectList(t, input.id)));

  server.registerTool("list_prospect_list_members", {
    title: "List prospect list members",
    description: "List all prospects in a specific list — paginated, searchable, sortable.",
    inputSchema: S.listProspectListMembersSchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.listProspectListMembers(t, input.id, omitKey(input, "bearer_token", "id"))));

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
    ...toolHints.destructive,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.removeProspectsFromList(t, input.id, input.prospect_ids)));

  server.registerTool("search_prospect_lists", {
    title: "Search prospects (preview)",
    description: "Preview filter results without creating a list — search by titles, countries, industries, employee count, etc.",
    inputSchema: S.searchProspectListsSchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.searchProspectLists(t, strip(input, "bearer_token"))));

  server.registerTool("import_prospect_list_csv", {
    title: "Import prospect list from CSV",
    description: "Create a new prospect list and import prospects in one call. Each row needs an email (for dedup).",
    inputSchema: S.importProspectListCsvSchema,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.importProspectListCsv(t, strip(input, "bearer_token"))));

  server.registerTool("wait_for_prospect_list", {
    title: "Wait for prospect list to finish",
    description: "Poll a provider-built list (auto, GetLeads, Explorium, LinkedIn or Apollo) until its status becomes completed, failed, or cancelled — or the timeout elapses. Use after any *_create_list / *_add_more so the agent doesn't need to manage polling itself.",
    inputSchema: S.waitForProspectListSchema,
    ...toolHints.readOnly,
  }, async (input) => {
    try {
      const token = resolveBearerToken(input.bearer_token);
      const timeoutMs = (input.timeout_seconds ?? 120) * 1000;
      const intervalMs = (input.poll_interval_seconds ?? 5) * 1000;
      const result = await pollUntilTerminal(token, input.id, timeoutMs, intervalMs);
      if (result.timedOut) {
        return { content: [{ type: "text", text: `Timed out after ${timeoutMs / 1000}s (last status: ${result.status ?? "unknown"}). Last body: ${result.text}` }] };
      }
      return { content: [{ type: "text", text: result.text }] };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: "text", text: `Error: ${msg}` }] };
    }
  });

  server.registerTool("list_prospect_list_organizations", {
    title: "List prospect list organizations",
    description: "List companies in an organization-type list (search_type=organizations). Paginated, searchable. Returns {data: Organization[], count}.",
    inputSchema: S.listProspectListOrganizationsSchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.listProspectListOrganizations(t, input.id, omitKey(input, "bearer_token", "id"))));

  server.registerTool("list_prospect_list_member_ids", {
    title: "List prospect list member IDs",
    description: "IDs of every list member matching filters, unpaginated, for bulk actions. Returns {ids, count, truncated} (ids capped at limit).",
    inputSchema: S.listProspectListMemberIdsSchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.listProspectListMemberIds(t, input.id, omitKey(input, "bearer_token", "id"))));

  server.registerTool("get_prospect_list_share_link", {
    title: "Get prospect list share link",
    description: "Get a list's public share link {token, enabled, view_count} or null. List owner or admin only.",
    inputSchema: S.prospectListIdSchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) => repo.getProspectListShareLink(t, input.id)));

  server.registerTool("create_prospect_list_share_link", {
    title: "Create prospect list share link",
    description: "PUBLISHES the list publicly: anyone with the link (/share/{token}) can view its prospects (contact details masked). Creates or re-enables the same token. List owner or admin only. Also the way to copy a list into ANOTHER Max workspace: the user opens the link while signed into that workspace and clicks Import.",
    inputSchema: S.prospectListIdSchema,
    ...toolHints.idempotent,
  }, async (input) => callApi(input.bearer_token, (t) => repo.createProspectListShareLink(t, input.id)));

  server.registerTool("revoke_prospect_list_share_link", {
    title: "Revoke prospect list share link",
    description: "Disable a list's public share link; the URL stops working (re-enabling restores the same token).",
    inputSchema: S.prospectListIdSchema,
    ...toolHints.destructive,
  }, async (input) => callApi(input.bearer_token, (t) => repo.revokeProspectListShareLink(t, input.id)));

  server.registerTool("create_linkedin_prospect_list", {
    title: "Create LinkedIn search prospect list",
    description: "Create a list filled by a people search run on a connected LinkedIn account (classic or Sales Navigator). No credits; no emails/phones returned. Async: returns the pending list — poll wait_for_prospect_list.",
    inputSchema: S.createLinkedInProspectListSchema,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.createLinkedInProspectList(t, strip(input, "bearer_token"))));
}

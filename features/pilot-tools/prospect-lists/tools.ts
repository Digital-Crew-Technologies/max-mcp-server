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
    description: "Create an empty platform prospect list. For Apollo-sourced lists, use apollo_create_list instead.",
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
    description: "Poll a prospect list (typically Apollo-backed) until its status becomes completed, failed, or cancelled — or the timeout elapses. Use this after apollo_create_list / apollo_add_more so the agent doesn't need to manage polling itself.",
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
}

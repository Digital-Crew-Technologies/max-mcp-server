import { randomUUID } from "node:crypto";
import { callApi, strip, type McpServer } from "../shared";
import * as repo from "./repository";
import * as S from "./schema";

// Pack the typed filter fields into the getleads_search_criteria contract
// max-agent reads. max_results becomes criteria.searchLimit (the mapper keys
// off searchLimit, not max_results).
function buildCriteria(input: Record<string, unknown>): Record<string, unknown> {
  const criteria = strip(input, "bearer_token", "list_name", "idempotency_key", "max_results");
  if (typeof input.max_results === "number") criteria.searchLimit = input.max_results;
  return criteria;
}

export function registerGetleadsTools(server: McpServer): void {
  server.registerTool("getleads_create_list", {
    title: "Create GetLeads prospect list",
    description: "Create a GetLeads-backed prospect (people) list (async). Runs a contacts-database search with the given filters → ingestion. Provide at least one filter. Returns a pending list DTO; poll its status (or use wait_for_prospect_list) until completed. Billed at one credit per record returned. Auto-generates an idempotency_key if not provided so retries are safe.",
    inputSchema: S.getleadsCreateListSchema,
  }, async (input) => {
    const body = {
      list_name: input.list_name,
      getleads_search_criteria: buildCriteria(input),
      idempotency_key: input.idempotency_key ?? randomUUID(),
    };
    return callApi(input.bearer_token, (t) => repo.getleadsCreateList(t, body));
  });

  server.registerTool("getleads_add_more", {
    title: "Add more leads from GetLeads",
    description: "Append more contacts to an existing GetLeads (people) list (async). Re-runs the saved search at the next offset for additional results. The list must be completed and its search_source must be getleads. Poll the list (or use wait_for_prospect_list) for progress.",
    inputSchema: S.getleadsAddMoreSchema,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.getleadsAddMore(t, strip(input, "bearer_token"))));
}

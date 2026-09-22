import { randomUUID } from "node:crypto";
import { callApi, strip, type McpServer } from "../shared";
import * as repo from "./repository";
import * as S from "./schema";

// GetLeads is the FIRST sourcing choice: ~100× cheaper than Explorium and billed
// only for contacts actually returned. Explorium is the fallback for filters
// GetLeads cannot express; Apollo is the last resort. register.ts orders the
// sourcing groups the same way (getleads → explorium → apollo).

// Pack the typed filter fields into the getleads_search_criteria contract
// max-agent reads. max_results becomes criteria.searchLimit.
function buildCriteria(input: Record<string, unknown>): Record<string, unknown> {
  const criteria = strip(
    input,
    "bearer_token",
    "list_name",
    "idempotency_key",
    "max_results",
    "data_supplier",
    "icp_id",
  );
  if (typeof input.max_results === "number") criteria.searchLimit = input.max_results;
  return criteria;
}

export function registerGetleadsTools(server: McpServer): void {
  server.registerTool("getleads_create_list", {
    title: "Create GetLeads prospect list",
    description: "FIRST CHOICE for sourcing new people: create a GetLeads-backed prospect list (async). Needs at least one targeting filter (job_titles, seniority, countries, industries or domains). Returns a pending list; poll it with wait_for_prospect_list. Charges credits per contact returned. Use Explorium only for buyer intent, departments, revenue or keywords, or when GetLeads returns nothing.",
    inputSchema: S.getleadsCreateListSchema,
  }, async (input) => {
    const body: Record<string, unknown> = {
      list_name: input.list_name,
      getleads_search_criteria: buildCriteria(input),
      idempotency_key: input.idempotency_key ?? randomUUID(),
    };
    if (input.data_supplier) body.data_supplier = input.data_supplier;
    if (input.icp_id) body.icp_id = input.icp_id;
    return callApi(input.bearer_token, (t) => repo.getleadsCreateList(t, body));
  });

  server.registerTool("getleads_add_more", {
    title: "Add more leads from GetLeads",
    description: "Append more contacts to a COMPLETED GetLeads list (async), re-running its saved filters from the next offset. Charges credits per contact returned. Poll with wait_for_prospect_list.",
    inputSchema: S.getleadsAddMoreSchema,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.getleadsAddMore(t, strip(input, "bearer_token"))));
}

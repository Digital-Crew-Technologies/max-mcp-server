import { randomUUID } from "node:crypto";
import { callApi, strip, type McpServer } from "../shared";
import * as repo from "./repository";
import * as S from "./schema";

// Pack the typed filter/enrichment fields into the explorium_search_criteria
// contract max-agent reads. max_results becomes criteria.searchLimit (the
// mapper keys off searchLimit, not max_results).
function buildCriteria(input: Record<string, unknown>): Record<string, unknown> {
  const criteria = strip(input, "bearer_token", "list_name", "idempotency_key", "max_results");
  if (typeof input.max_results === "number") criteria.searchLimit = input.max_results;
  return criteria;
}

export function registerExploriumTools(server: McpServer): void {
  server.registerTool("explorium_create_list", {
    title: "Create Explorium prospect list",
    description: "Create an Explorium-backed prospect (people) list (async). Runs a people search with the given filters → enrichment → ingestion. Returns a pending list DTO; poll its status (or use wait_for_prospect_list) until completed. Auto-generates an idempotency_key if not provided so retries are safe.",
    inputSchema: S.exploriumCreateListSchema,
  }, async (input) => {
    const body = {
      list_name: input.list_name,
      explorium_search_criteria: buildCriteria(input),
      idempotency_key: input.idempotency_key ?? randomUUID(),
    };
    return callApi(input.bearer_token, (t) => repo.exploriumCreateList(t, body));
  });

  server.registerTool("explorium_create_company_list", {
    title: "Create Explorium company list",
    description: "Create an Explorium-backed company (organization) list (async). Runs a business search with the given filters → enrichment → ingestion. Returns a pending list DTO; poll its status (or use wait_for_prospect_list) until completed. Auto-generates an idempotency_key if not provided so retries are safe.",
    inputSchema: S.exploriumCreateCompanyListSchema,
  }, async (input) => {
    const body = {
      list_name: input.list_name,
      explorium_search_criteria: buildCriteria(input),
      idempotency_key: input.idempotency_key ?? randomUUID(),
    };
    return callApi(input.bearer_token, (t) => repo.exploriumCreateCompanyList(t, body));
  });

  server.registerTool("explorium_add_more", {
    title: "Add more leads from Explorium",
    description: "Append more leads to an existing Explorium list (async). Re-runs the saved search for additional results. Poll the list (or use wait_for_prospect_list) for progress.",
    inputSchema: S.exploriumAddMoreSchema,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.exploriumAddMore(t, strip(input, "bearer_token"))));
}

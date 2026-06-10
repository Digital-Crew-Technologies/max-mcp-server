import { randomUUID } from "node:crypto";
import { callApi, strip, type McpServer } from "../shared";
import * as repo from "./repository";
import * as S from "./schema";

export function registerExploriumTools(server: McpServer): void {
  server.registerTool("explorium_create_list", {
    title: "Create Explorium prospect list",
    description: "Create an Explorium-backed prospect list (async). Starts prospect search → contact enrichment → ingestion. Poll the list status (or use wait_for_prospect_list) for progress. Auto-generates an idempotency_key if not provided so retries are safe.",
    inputSchema: S.exploriumCreateListSchema,
  }, async (input) => {
    const body = strip(input, "bearer_token") as Record<string, unknown>;
    if (!body.idempotency_key) body.idempotency_key = randomUUID();
    return callApi(input.bearer_token, (t) => repo.exploriumCreateList(t, body));
  });

  server.registerTool("explorium_create_company_list", {
    title: "Create Explorium company (organization) list",
    description: "Create an Explorium-backed organization list from a company search (async). Stores the matched companies as organizations (search_type=organizations) and runs the selected company enrichments. Poll the list status (or use wait_for_prospect_list) for progress. Auto-generates an idempotency_key if not provided so retries are safe. Note: add-more is not supported for organization lists.",
    inputSchema: S.exploriumCreateCompanyListSchema,
  }, async (input) => {
    const body = strip(input, "bearer_token") as Record<string, unknown>;
    if (!body.idempotency_key) body.idempotency_key = randomUUID();
    return callApi(input.bearer_token, (t) => repo.exploriumCreateCompanyList(t, body));
  });

  server.registerTool("explorium_add_more", {
    title: "Add more leads from Explorium",
    description: "Append more leads to an existing Explorium list (async). Re-runs the saved search for additional results.",
    inputSchema: S.exploriumAddMoreSchema,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.exploriumAddMore(t, strip(input, "bearer_token"))));
}

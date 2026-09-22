import { randomUUID } from "node:crypto";
import { callApi, strip, type McpServer } from "../shared";
import * as repo from "./repository";
import * as S from "./schema";

// Apollo is the LAST sourcing resort, after GetLeads and Explorium. max-agent's
// managed chain no longer uses it, and max-agent's own chat drops these tools.

export function registerApolloTools(server: McpServer): void {
  server.registerTool("apollo_create_list", {
    title: "Create Apollo prospect list",
    description: "LAST RESORT: create an Apollo-backed prospect list (async). Use only when getleads_create_list and the Explorium tools cannot serve the request, or the user explicitly asks for Apollo. People search → ingestion. Poll with wait_for_prospect_list.",
    inputSchema: S.apolloCreateListSchema,
  }, async (input) => {
    const body = strip(input, "bearer_token") as Record<string, unknown>;
    if (!body.idempotency_key) body.idempotency_key = randomUUID();
    return callApi(input.bearer_token, (t) => repo.apolloCreateList(t, body));
  });

  server.registerTool("apollo_add_more", {
    title: "Add more leads from Apollo",
    description: "Append more leads to an existing Apollo list (async). Re-runs the saved search for additional results.",
    inputSchema: S.apolloAddMoreSchema,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.apolloAddMore(t, strip(input, "bearer_token"))));
}

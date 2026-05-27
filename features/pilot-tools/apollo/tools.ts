import { randomUUID } from "node:crypto";
import { callApi, strip, type McpServer } from "../shared";
import * as repo from "./repository";
import * as S from "./schema";

export function registerApolloTools(server: McpServer): void {
  server.registerTool("apollo_create_list", {
    title: "Create Apollo prospect list",
    description: "Create an Apollo-backed prospect list (async). Starts people search → ingestion. Poll the list status (or use wait_for_prospect_list) for progress. Auto-generates an idempotency_key if not provided so retries are safe.",
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

import { callApi, strip, type McpServer } from "../shared";
import * as repo from "./repository";
import * as S from "./schema";

export function registerApolloTools(server: McpServer): void {
  server.registerTool("apollo_create_list", {
    title: "Create Apollo prospect list",
    description: "Create an Apollo-backed prospect list (async). Starts people search → ingestion. Poll the list status for progress.",
    inputSchema: S.apolloCreateListSchema,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.apolloCreateList(t, strip(input, "bearer_token"))));

  server.registerTool("apollo_add_more", {
    title: "Add more leads from Apollo",
    description: "Append more leads to an existing Apollo list (async). Re-runs the saved search for additional results.",
    inputSchema: S.apolloAddMoreSchema,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.apolloAddMore(t, strip(input, "bearer_token"))));
}

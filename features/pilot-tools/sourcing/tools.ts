import { randomUUID } from "node:crypto";
import { callApi, strip, type McpServer } from "../shared";
import * as repo from "./repository";
import * as S from "./schema";

// Managed sourcing: max-agent picks the provider. The chain is fixed by cost —
// GetLeads first (~100× cheaper), Explorium when GetLeads cannot express the
// filters or returns nothing — and Apollo is never part of it. These are the
// tools to reach for when the user just wants "find me leads"; the per-provider
// groups (getleads → explorium → apollo) are for pinning a source explicitly.
//
// Registered into existing groups rather than a group of their own:
//   • people   → `lists`          (the result is a prospect list)
//   • companies→ `organizations`  (the result is organizations / a company list)

export function registerAutoProspectSourcingTools(server: McpServer): void {
  server.registerTool("auto_create_prospect_list", {
    title: "Find leads (GetLeads → Explorium)",
    description: "Default way to source new people: create a prospect list from unified criteria (async). Runs GetLeads first and falls back to Explorium only when GetLeads can't express the filters (intent, departments, revenue, keywords) or finds nothing; Apollo is never used. Charges credits. Returns a pending list; poll with wait_for_prospect_list.",
    inputSchema: S.autoCreateProspectListSchema,
  }, async (input) => {
    const body = strip(input, "bearer_token");
    body.idempotency_key = input.idempotency_key ?? randomUUID();
    return callApi(input.bearer_token, (t) => repo.autoCreateProspectList(t, body));
  });
}

export function registerOrganizationSearchTools(server: McpServer): void {
  server.registerTool("preview_organization_search", {
    title: "Preview company search (GetLeads → Explorium)",
    description: "Run a small, unsaved company search (1–25 rows) to check targeting before building a list. Tries GetLeads first, then Explorium. Billed like any provider call. Returns {data: companies[], provider, attempts, dropped_filters}.",
    inputSchema: S.previewOrganizationSearchSchema,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.previewOrganizationSearch(t, strip(input, "bearer_token"))));

  server.registerTool("auto_create_organization_list", {
    title: "Build company list (GetLeads → Explorium)",
    description: "Create a saved company (organization) list from unified criteria (async). GetLeads first, Explorium as the fallback; Apollo is never used. Charges credits. Returns a pending list; poll with wait_for_prospect_list.",
    inputSchema: S.autoCreateOrganizationListSchema,
  }, async (input) => {
    const body = strip(input, "bearer_token");
    body.idempotency_key = input.idempotency_key ?? randomUUID();
    return callApi(input.bearer_token, (t) => repo.autoCreateOrganizationList(t, body));
  });
}

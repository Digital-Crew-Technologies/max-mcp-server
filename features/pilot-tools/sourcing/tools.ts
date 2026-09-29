import { randomUUID } from "node:crypto";
import { callApi, strip, type McpServer } from "../shared";
import * as repo from "./repository";
import * as S from "./schema";

// Managed sourcing: max-agent picks the provider. The chain is fixed by cost —
// GetLeads first (~100× cheaper), Explorium for what only it filters on (buyer
// intent, website keywords; number of locations for companies) or when GetLeads
// returns nothing — and Apollo is never part of it. GetLeads now filters on
// departments, revenue, technologies, HQ country and founding year itself. These
// are the tools to reach for when the user just wants "find me leads"; the
// per-provider groups (getleads → explorium → apollo) are for pinning a source
// explicitly.
//
// Registered into existing groups rather than a group of their own:
//   • people   → `lists`          (the result is a prospect list)
//   • companies→ `organizations`  (the result is organizations / a company list)

export function registerAutoProspectSourcingTools(server: McpServer): void {
  server.registerTool("auto_create_prospect_list", {
    title: "Find leads (GetLeads → Explorium)",
    description: "Default way to source new people: create a prospect list from unified criteria (async). Starts on the member's own connected LinkedIn account when there is one (no credits), then GetLeads, which filters on titles, seniority, departments, locations, industries, size, revenue, technologies and company HQ country. Buyer intent, website keywords or extra enrichments send it to Explorium; Apollo is never used. Charges credits. Returns a pending list; poll with wait_for_prospect_list.",
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
    description: "Run a small, unsaved company search (1–25 rows) to check targeting before building a list, in the order the list would run: GetLeads first (company names, industries, HQ country or office locations, size, domains or LinkedIn company pages, revenue, technologies, company age), Explorium for buyer intent, website keywords or number of locations. Billed like any provider call. Returns {data: companies[], provider, attempts, dropped_filters}.",
    inputSchema: S.previewOrganizationSearchSchema,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.previewOrganizationSearch(t, strip(input, "bearer_token"))));

  server.registerTool("auto_create_organization_list", {
    title: "Build company list (GetLeads → Explorium)",
    description: "Create a saved company (organization) list from unified criteria (async). GetLeads first (company names, industries, HQ country or office locations, size, domains or LinkedIn company pages, revenue, technologies, company age); buyer intent, website keywords or number of locations send it to Explorium, and a search with company domains or GetLeads-only filters never runs on Explorium unless pinned. Apollo is never used. Charges credits. Returns a pending list; poll with wait_for_prospect_list.",
    inputSchema: S.autoCreateOrganizationListSchema,
  }, async (input) => {
    const body = strip(input, "bearer_token");
    body.idempotency_key = input.idempotency_key ?? randomUUID();
    return callApi(input.bearer_token, (t) => repo.autoCreateOrganizationList(t, body));
  });
}

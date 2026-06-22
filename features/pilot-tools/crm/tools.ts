import { callApi, strip, type McpServer } from "../shared";
import * as repo from "./repository";
import * as S from "./schema";

// CRM (HubSpot) tools. Thin proxy to max-agent /api/v1/crm/* — max-agent owns
// the per-workspace HubSpot connection. The website agent and Hermes both get
// these through max-mcp-server. v1: conversational reads/writes only.

export function registerCrmTools(server: McpServer): void {
  server.registerTool(
    "crm_search_contacts",
    {
      title: "Search CRM contacts",
      description:
        "Search the connected CRM (HubSpot) for contacts by free text (name, email, company). Returns matching contacts. Use before creating a contact to check if one already exists.",
      inputSchema: S.crmSearchContactsSchema,
    },
    async (input) =>
      callApi(input.bearer_token, (t) =>
        repo.crmSearchContacts(t, strip(input, "bearer_token")),
      ),
  );

  server.registerTool(
    "crm_get_contact",
    {
      title: "Get a CRM contact by email",
      description:
        "Fetch a single CRM contact by email (the dedup identity). Returns null if not found.",
      inputSchema: S.crmGetContactSchema,
    },
    async (input) =>
      callApi(input.bearer_token, (t) =>
        repo.crmGetContact(t, strip(input, "bearer_token")),
      ),
  );

  server.registerTool(
    "crm_upsert_contact",
    {
      title: "Create or update a CRM contact",
      description:
        "Create-or-update a contact in the connected CRM, matched by email — never creates a duplicate. Use when the user asks to add or update a contact in HubSpot.",
      inputSchema: S.crmUpsertContactSchema,
    },
    async (input) =>
      callApi(input.bearer_token, (t) =>
        repo.crmUpsertContact(t, strip(input, "bearer_token")),
      ),
  );

  server.registerTool(
    "crm_upsert_company",
    {
      title: "Create or update a CRM company",
      description:
        "Create-or-update a company in the connected CRM, matched by domain — never creates a duplicate.",
      inputSchema: S.crmUpsertCompanySchema,
    },
    async (input) =>
      callApi(input.bearer_token, (t) =>
        repo.crmUpsertCompany(t, strip(input, "bearer_token")),
      ),
  );

  server.registerTool(
    "crm_status",
    {
      title: "CRM connection status",
      description:
        "Report which CRM connections (e.g. HubSpot) are active for this workspace. Use to check whether the CRM is connected before attempting reads/writes.",
      inputSchema: S.crmStatusSchema,
    },
    async (input) => callApi(input.bearer_token, (t) => repo.crmStatus(t)),
  );
}

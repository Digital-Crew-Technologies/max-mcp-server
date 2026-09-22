import { resolveBearerToken, type McpServer } from "../shared";
import { responseBodyText, sanitizeUpstreamError } from "@/shared/http/response";
import * as S from "./schema";
import * as repo from "./repository";

// CRM (HubSpot) tools. Every tool calls max-agent's scoped CRM routes
// (POST /api/v1/crm/{search-contacts,get-contact,upsert-contact,upsert-company,
// list-deals,get-deal,list-activities}, GET /api/v1/crm/{status,list-owners,
// list-pipeline-stages}). max-agent resolves the workspace's HubSpot client
// server-side, never returns the HubSpot credential, and enforces the
// read/write connection mode itself (403 code "crm_read_only").
//
// Error mapping → standard MCP envelope:
//   not connected (409)                      → friendly "connect HubSpot" message
//   read-only connection (403 crm_read_only) → friendly "reconnect with write" message
//   anything else → { isError: true, content: [{ text: "API error (<status>): <detail>" }] }

type McpEnvelope = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

const WRITES_DISABLED_MSG =
  "HubSpot is connected in read-only mode for this workspace. To let Max update HubSpot, reconnect with read + write access (the toggle on the HubSpot integration card), then retry.";

const NOT_CONNECTED_MSG =
  "HubSpot is not connected for this workspace. Connect HubSpot in workspace settings, then retry.";

function ok(payload: unknown): McpEnvelope {
  const text = typeof payload === "string" ? payload : JSON.stringify(payload);
  return { content: [{ type: "text", text }] };
}

function err(text: string): McpEnvelope {
  return { isError: true, content: [{ type: "text", text }] };
}

/** Map a thrown error (missing bearer, network failure) to the MCP error envelope. */
function mapError(e: unknown): McpEnvelope {
  const msg = e instanceof Error ? e.message : String(e);
  const cls = e instanceof Error ? e.name : "Error";
  return err(`${cls}: ${msg}`);
}

/**
 * Call one of max-agent's scoped CRM routes and translate its CRM-specific
 * failures into friendly messages.
 */
async function viaMaxAgent(
  bearerOverride: string | undefined,
  fn: (token: string) => Promise<Response>,
): Promise<McpEnvelope> {
  let res: Response;
  try {
    res = await fn(resolveBearerToken(bearerOverride));
  } catch (e) {
    return mapError(e);
  }
  const text = await responseBodyText(res);
  if (res.ok) return ok(text);
  if (res.status === 409) return err(NOT_CONNECTED_MSG);
  if (res.status === 403 && text.includes("crm_read_only")) return err(WRITES_DISABLED_MSG);
  const detail = text ? sanitizeUpstreamError(text) : res.statusText;
  return err(`API error (${res.status}): ${detail}`);
}

export function registerCrmTools(server: McpServer): void {
  server.registerTool(
    "crm_search_contacts",
    {
      title: "Search CRM contacts",
      description:
        "Search the connected CRM (HubSpot) for contacts by free text (name, email, company). Returns {data: contacts[]}. Use before creating a contact to check if one already exists.",
      inputSchema: S.crmSearchContactsSchema,
    },
    async (input) =>
      viaMaxAgent(input.bearer_token, (t) =>
        repo.searchContacts(t, { query: input.query, limit: input.limit ?? 20 }),
      ),
  );

  server.registerTool(
    "crm_get_contact",
    {
      title: "Get a CRM contact by email",
      description:
        "Fetch a single CRM contact by email (the dedup identity). Returns {data: contact} or {data: null} if not found.",
      inputSchema: S.crmGetContactSchema,
    },
    async (input) =>
      viaMaxAgent(input.bearer_token, (t) => repo.getContact(t, { email: input.email })),
  );

  server.registerTool(
    "crm_upsert_contact",
    {
      title: "Create or update a CRM contact",
      description:
        "Create-or-update a contact in the connected CRM, matched by email — never creates a duplicate. Use when the user asks to add or update a contact in HubSpot. Requires a read + write HubSpot connection.",
      inputSchema: S.crmUpsertContactSchema,
    },
    async (input) => {
      const { bearer_token, ...body } = input;
      return viaMaxAgent(bearer_token, (t) => repo.upsertContact(t, body));
    },
  );

  server.registerTool(
    "crm_upsert_company",
    {
      title: "Create or update a CRM company",
      description:
        "Create-or-update a company in the connected CRM, matched by domain — never creates a duplicate. Requires a read + write HubSpot connection.",
      inputSchema: S.crmUpsertCompanySchema,
    },
    async (input) => {
      const { bearer_token, ...body } = input;
      return viaMaxAgent(bearer_token, (t) => repo.upsertCompany(t, body));
    },
  );

  server.registerTool(
    "crm_status",
    {
      title: "CRM connection status",
      description:
        "Report whether HubSpot is connected for this workspace. Returns { connected: bool, provider, connections: [{ provider, portal_id, connected_at, last_refresh_at }] }.",
      inputSchema: S.crmStatusSchema,
    },
    async (input) => {
      const res = await viaMaxAgent(input.bearer_token, (t) => repo.getStatus(t));
      if (res.isError) return res;
      try {
        const connections =
          (JSON.parse(res.content[0].text) as { data?: { connections?: unknown[] } })
            ?.data?.connections ?? [];
        return ok({ connected: connections.length > 0, provider: "hubspot", connections });
      } catch {
        return res;
      }
    },
  );

  // ── deal / activity / owner / stage reads ──────────────────────────────────

  server.registerTool(
    "crm_list_deals",
    {
      title: "List CRM deals",
      description:
        "List deals from HubSpot with optional filters (stage, owner, pipeline, amount range, close-date range, modified-after). Returns {data: deals[]}, each with id, name, amount, ownerId, stage, pipeline, closeDate, lastModified, lastActivityDate, nextStep. Use crm_get_deal for a deal's associated company/contact ids.",
      inputSchema: S.crmListDealsSchema,
    },
    async (input) => {
      const { bearer_token, ...body } = input;
      return viaMaxAgent(bearer_token, (t) => repo.listDeals(t, body));
    },
  );

  server.registerTool(
    "crm_get_deal",
    {
      title: "Get a CRM deal by id",
      description:
        "Fetch a single HubSpot deal by id, including its properties and associated company/contact ids (associatedCompanyIds, associatedContactIds). Returns {data: deal} or {data: null} if not found.",
      inputSchema: S.crmGetDealSchema,
    },
    async (input) =>
      viaMaxAgent(input.bearer_token, (t) => repo.getDeal(t, { id: input.id })),
  );

  server.registerTool(
    "crm_list_activities",
    {
      title: "List CRM activities (engagements)",
      description:
        "List HubSpot engagements (call/email/meeting/note/task) with optional filters (deal, contact, owner, types, since), newest first. Returns {data: activities[]}, each with id, type, timestamp, ownerId, dealId, contactId, subject, body. Without `types`, engagement types the HubSpot connection cannot read are skipped; a type you name that HubSpot denies returns an error.",
      inputSchema: S.crmListActivitiesSchema,
    },
    async (input) => {
      const { bearer_token, ...body } = input;
      return viaMaxAgent(bearer_token, (t) => repo.listActivities(t, body));
    },
  );

  server.registerTool(
    "crm_list_owners",
    {
      title: "List CRM owners",
      description:
        "List HubSpot owners (sales reps) for the workspace. Returns {data: owners[]}, each with id, email, firstName, lastName, teams. Use to map deals/assignments to people.",
      inputSchema: S.crmListOwnersSchema,
    },
    async (input) => viaMaxAgent(input.bearer_token, (t) => repo.listOwners(t)),
  );

  server.registerTool(
    "crm_list_pipeline_stages",
    {
      title: "List CRM pipeline stages",
      description:
        "List deal pipeline stages (optionally scoped to one pipeline), ordered by pipeline then stage. Returns {data: stages[]}, each with id, label, displayOrder, pipelineId, pipelineLabel, probability, isWonStage, isLostStage.",
      inputSchema: S.crmListPipelineStagesSchema,
    },
    async (input) =>
      viaMaxAgent(input.bearer_token, (t) => repo.listPipelineStages(t, input.pipelineId)),
  );
}

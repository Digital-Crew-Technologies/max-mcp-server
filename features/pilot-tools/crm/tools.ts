import { resolveBearerToken, type McpServer } from "../shared";
import { responseBodyText, sanitizeUpstreamError } from "@/shared/http/response";
import * as S from "./schema";
import * as repo from "./repository";
import { HubSpotClient } from "./hubspot-client";
import {
  getHubSpotAccessToken,
  invalidateHubSpotToken,
} from "./token-resolver";

// CRM (HubSpot) tools. Two paths:
//
//   • Contacts, companies and connection status go through max-agent's scoped
//     CRM routes (POST /api/v1/crm/{search-contacts,get-contact,upsert-contact,
//     upsert-company}, GET /api/v1/crm/status). max-agent resolves the
//     workspace's HubSpot client server-side and enforces the read/write
//     connection mode itself (403 code "crm_read_only").
//   • Deals, activities, owners and pipeline stages still call HubSpot's
//     official MCP DIRECTLY via HubSpotClient, with the token resolved from
//     GET /api/v1/crm/access-token. ⚠️ max-agent no longer serves that route
//     (HubSpot credentials are never returned to API callers), and it has no
//     scoped equivalent for these reads yet, so these tools fail until one
//     exists.
//
// Error mapping → standard MCP envelope:
//   not connected (409 / HUBSPOT_NOT_CONNECTED) → friendly "connect HubSpot" message
//   read-only connection (403 crm_read_only)    → friendly "reconnect with write" message
//   anything else → { isError: true, content: [{ text: "<detail>" }] }

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

function isAuthError(msg: string): boolean {
  return /\b401\b|unauthorized|invalid[_ ]?token|token expired/i.test(msg);
}

/** Map a thrown error from a HubSpot call to the MCP error envelope. */
function mapError(e: unknown): McpEnvelope {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg === "HUBSPOT_NOT_CONNECTED") {
    return err(NOT_CONNECTED_MSG);
  }
  if (msg.startsWith("HUBSPOT_TOKEN_FETCH_FAILED")) {
    return err(msg);
  }
  const cls = e instanceof Error ? e.name : "Error";
  return err(`${cls}: ${msg}`);
}

/**
 * Call one of max-agent's scoped CRM routes and translate its CRM-specific
 * failures into the same friendly messages the direct path uses.
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

/**
 * Resolve bearer → HubSpot token → HubSpotClient, run fn, map result/errors.
 * On a HubSpot 401 we invalidate the cached token once and retry so a token
 * that expired mid-cache refetches transparently.
 */
async function withClient(
  bearerOverride: string | undefined,
  fn: (client: HubSpotClient) => Promise<unknown>,
): Promise<McpEnvelope> {
  let bearer: string;
  try {
    bearer = resolveBearerToken(bearerOverride);
  } catch (e) {
    return mapError(e);
  }

  try {
    const { access_token, auth_method } = await getHubSpotAccessToken(bearer);
    try {
      return ok(await fn(new HubSpotClient(access_token, auth_method)));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (isAuthError(msg)) {
        // Token may have just expired — drop it and refetch once.
        invalidateHubSpotToken(bearer);
        const fresh = await getHubSpotAccessToken(bearer);
        return ok(await fn(new HubSpotClient(fresh.access_token, fresh.auth_method)));
      }
      throw e;
    }
  } catch (e) {
    return mapError(e);
  }
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

  // ── the assistant deal / activity / owner / stage reads ────────────────────────

  server.registerTool(
    "crm_list_deals",
    {
      title: "List CRM deals",
      description:
        "List deals from HubSpot with optional filters (stage, owner, pipeline, amount range, close-date range, modified-after). Returns id, dealname, amount, ownerId, stage, pipeline, closeDate, lastModified, lastActivityDate, nextStep, associated company/contact ids.",
      inputSchema: S.crmListDealsSchema,
    },
    async (input) =>
      withClient(input.bearer_token, (c) =>
        c.listDeals({
          stageId: input.stageId,
          ownerId: input.ownerId,
          pipelineId: input.pipelineId,
          amountMin: input.amountMin,
          amountMax: input.amountMax,
          closeDateAfter: input.closeDateAfter,
          closeDateBefore: input.closeDateBefore,
          modifiedAfter: input.modifiedAfter,
          limit: input.limit,
        }),
      ),
  );

  server.registerTool(
    "crm_get_deal",
    {
      title: "Get a CRM deal by id",
      description:
        "Fetch a single HubSpot deal by id, including its full properties and associated company/contact ids. Returns null if not found.",
      inputSchema: S.crmGetDealSchema,
    },
    async (input) => withClient(input.bearer_token, (c) => c.getDeal(String(input.id))),
  );

  server.registerTool(
    "crm_list_activities",
    {
      title: "List CRM activities (engagements)",
      description:
        "List HubSpot engagements (call/email/meeting/note/task) with optional filters (deal, contact, owner, types, since). Per-type queries are merged sorted by timestamp desc. Returns id, type, timestamp, ownerId, dealId, contactId, subject, body.",
      inputSchema: S.crmListActivitiesSchema,
    },
    async (input) =>
      withClient(input.bearer_token, (c) =>
        c.listActivities({
          dealId: input.dealId,
          contactId: input.contactId,
          ownerId: input.ownerId,
          types: input.types,
          since: input.since,
          limit: input.limit,
        }),
      ),
  );

  server.registerTool(
    "crm_list_owners",
    {
      title: "List CRM owners",
      description:
        "List HubSpot owners (sales reps) for the workspace. Returns id, email, firstName, lastName, teams. Use to map deals/assignments to people.",
      inputSchema: S.crmListOwnersSchema,
    },
    async (input) => withClient(input.bearer_token, (c) => c.listOwners()),
  );

  server.registerTool(
    "crm_list_pipeline_stages",
    {
      title: "List CRM pipeline stages",
      description:
        "List deal pipeline stages (optionally scoped to one pipeline). Returns id, label, displayOrder, pipelineId, isWonStage, isLostStage.",
      inputSchema: S.crmListPipelineStagesSchema,
    },
    async (input) =>
      withClient(input.bearer_token, (c) => c.listPipelineStages(input.pipelineId)),
  );
}

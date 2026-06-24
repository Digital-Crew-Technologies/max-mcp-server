import { resolveBearerToken, type McpServer } from "../shared";
import * as S from "./schema";
import { HubSpotClient } from "./hubspot-client";
import {
  getHubSpotAccessToken,
  invalidateHubSpotToken,
} from "./token-resolver";
import { areCrmWritesAllowed } from "./super-bj-profile";

// CRM (HubSpot) tools. v1 of these proxied to max-agent /api/v1/crm/*; they now
// call HubSpot's official MCP (mcp.hubspot.com) DIRECTLY via HubSpotClient. The
// per-workspace HubSpot OAuth token is still resolved from max-agent (which owns
// the connection) via GET /api/v1/crm/access-token, cached per-bearer.
//
// Error mapping → standard MCP envelope:
//   HUBSPOT_NOT_CONNECTED → friendly "connect HubSpot" message
//   HubSpotMcpError / others → { isError: true, content: [{ text: "<Cls>: <msg>" }] }

type McpEnvelope = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

const WRITES_DISABLED_MSG =
  "HubSpot writes are disabled for this workspace (super_bj.allow_crm_writes is false). Enable in workspace settings.";

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
    return err(
      "HubSpot is not connected for this workspace. Connect HubSpot in workspace settings, then retry.",
    );
  }
  if (msg.startsWith("HUBSPOT_TOKEN_FETCH_FAILED")) {
    return err(msg);
  }
  const cls = e instanceof Error ? e.name : "Error";
  return err(`${cls}: ${msg}`);
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
    const token = await getHubSpotAccessToken(bearer);
    try {
      return ok(await fn(new HubSpotClient(token)));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (isAuthError(msg)) {
        // Token may have just expired — drop it and refetch once.
        invalidateHubSpotToken(bearer);
        const fresh = await getHubSpotAccessToken(bearer);
        return ok(await fn(new HubSpotClient(fresh)));
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
        "Search the connected CRM (HubSpot) for contacts by free text (name, email, company). Returns matching contacts. Use before creating a contact to check if one already exists.",
      inputSchema: S.crmSearchContactsSchema,
    },
    async (input) =>
      withClient(input.bearer_token, (c) =>
        c.searchContacts(String(input.query), input.limit ?? 20),
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
      withClient(input.bearer_token, (c) => c.getContactByEmail(String(input.email))),
  );

  server.registerTool(
    "crm_upsert_contact",
    {
      title: "Create or update a CRM contact",
      description:
        "Create-or-update a contact in the connected CRM, matched by email — never creates a duplicate. Use when the user asks to add or update a contact in HubSpot. Requires super_bj.allow_crm_writes.",
      inputSchema: S.crmUpsertContactSchema,
    },
    async (input) => {
      let bearer: string;
      try {
        bearer = resolveBearerToken(input.bearer_token);
      } catch (e) {
        return mapError(e);
      }
      // Write-gate: do NOT touch HubSpot when writes are disabled.
      try {
        if (!(await areCrmWritesAllowed(bearer))) return err(WRITES_DISABLED_MSG);
      } catch (e) {
        return mapError(e);
      }
      return withClient(bearer, (c) =>
        c.upsertContact({
          email: String(input.email),
          firstName: input.firstName,
          lastName: input.lastName,
          company: input.company,
          jobTitle: input.jobTitle,
          phone: input.phone,
        }),
      );
    },
  );

  server.registerTool(
    "crm_upsert_company",
    {
      title: "Create or update a CRM company",
      description:
        "Create-or-update a company in the connected CRM, matched by domain — never creates a duplicate. Requires super_bj.allow_crm_writes.",
      inputSchema: S.crmUpsertCompanySchema,
    },
    async (input) => {
      let bearer: string;
      try {
        bearer = resolveBearerToken(input.bearer_token);
      } catch (e) {
        return mapError(e);
      }
      try {
        if (!(await areCrmWritesAllowed(bearer))) return err(WRITES_DISABLED_MSG);
      } catch (e) {
        return mapError(e);
      }
      return withClient(bearer, (c) =>
        c.upsertCompany({ domain: String(input.domain), name: input.name }),
      );
    },
  );

  server.registerTool(
    "crm_status",
    {
      title: "CRM connection status",
      description:
        "Report whether HubSpot is connected for this workspace. Attempts a cheap HubSpot read; returns { connected: bool, ... }.",
      inputSchema: S.crmStatusSchema,
    },
    async (input) => {
      let bearer: string;
      try {
        bearer = resolveBearerToken(input.bearer_token);
      } catch (e) {
        return mapError(e);
      }
      try {
        const token = await getHubSpotAccessToken(bearer);
        // Cheap probe: a 1-result contact search confirms the token works.
        const contacts = await new HubSpotClient(token).searchContacts("", 1);
        return ok({ connected: true, provider: "hubspot", probe: "search_crm_objects:contacts", sampleCount: contacts.length });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg === "HUBSPOT_NOT_CONNECTED") {
          return ok({ connected: false, provider: "hubspot", reason: "not_connected" });
        }
        return ok({ connected: false, provider: "hubspot", reason: msg });
      }
    },
  );

  // ── Super-BJ deal / activity / owner / stage reads ────────────────────────

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

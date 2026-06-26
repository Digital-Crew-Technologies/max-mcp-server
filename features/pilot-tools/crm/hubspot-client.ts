// HubSpot CRM client — UPSTREAM = HubSpot's official MCP (mcp.hubspot.com).
// Ported into max-mcp-server from max-agent
// (src/features/crm/hubspot/hubspot-client.ts). max-mcp acts as an MCP client,
// calling HubSpot's tools (search_crm_objects, manage_crm_objects) and mapping
// results to the provider-agnostic CrmClient shape. The constructor takes the
// workspace's HubSpot access token (resolved via token-resolver.ts).
//
// Upsert: HubSpot's manage_crm_objects has no native upsert, so we dedup
// ourselves — search by the identity key (email / domain), then update the
// found objectId or create. v1 = conversational writes only.
//
// FAIL-LOUD: HubSpot's official MCP is known to support contacts/companies via
// search_crm_objects, but objectType "deals"|"owners"|"pipelines"|engagements
// support is UNVERIFIED here (no live HubSpot in this env). Any "unsupported
// object type"-style failure is rethrown as HubSpotMcpError with a clear
// pointer to the REST fallback — we never silently return [].
// ⚠️ Server-only.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { fetchWithRetry } from "../http";
import type {
  CrmActivity,
  CrmActivityType,
  CrmContact,
  CrmClient,
  CrmDeal,
  CrmOwner,
  CrmPipelineStage,
  ListActivitiesFilters,
  ListDealsFilters,
  UpsertCompanyInput,
  UpsertContactInput,
} from "./hubspot-client.types";

const HUBSPOT_MCP_URL = "https://mcp.hubspot.com/";
const HUBSPOT_REST_BASE = "https://api.hubapi.com";

const CONTACT_PROPS = ["email", "firstname", "lastname", "company", "jobtitle", "phone"];
const COMPANY_PROPS = ["name", "domain"];
const DEAL_PROPS = [
  "dealname",
  "amount",
  "hubspot_owner_id",
  "dealstage",
  "pipeline",
  "closedate",
  "hs_lastmodifieddate",
  "notes_last_updated",
  "hs_next_step",
];
const ENGAGEMENT_PROPS = [
  "hs_timestamp",
  "hubspot_owner_id",
  "hs_engagement_type",
  "hs_call_title",
  "hs_call_body",
  "hs_email_subject",
  "hs_email_text",
  "hs_meeting_title",
  "hs_meeting_body",
  "hs_note_body",
  "hs_task_subject",
  "hs_task_body",
];

// Per-engagement-type property sets for the REST search path. Each type only
// supports its own subject/body fields; sending foreign properties 400s.
const ACTIVITY_COMMON_PROPS = ["hs_timestamp", "hubspot_owner_id", "hs_engagement_type"];
const ACTIVITY_PROPS_BY_TYPE: Record<CrmActivityType, string[]> = {
  call: [...ACTIVITY_COMMON_PROPS, "hs_call_title", "hs_call_body"],
  email: [...ACTIVITY_COMMON_PROPS, "hs_email_subject", "hs_email_text"],
  meeting: [...ACTIVITY_COMMON_PROPS, "hs_meeting_title", "hs_meeting_body"],
  note: [...ACTIVITY_COMMON_PROPS, "hs_note_body"],
  task: [...ACTIVITY_COMMON_PROPS, "hs_task_subject", "hs_task_body"],
};

/**
 * Thrown when an underlying HubSpot MCP call fails (4xx/5xx from the upstream
 * tool, or an unsupported objectType). Callers map this to the MCP error
 * envelope; the message stays actionable.
 */
export class HubSpotMcpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HubSpotMcpError";
  }
}

// ── MCP result helpers ───────────────────────────────────────────────────────

type ToolResult = {
  content?: Array<{ type?: string; text?: string }>;
  isError?: boolean;
};

function textOf(res: ToolResult): string {
  return (res?.content ?? [])
    .filter((p) => p?.type === "text" && typeof p.text === "string")
    .map((p) => p.text as string)
    .join("\n");
}

/** Heuristic: does this error text indicate an unsupported objectType? */
function looksUnsupportedObjectType(text: string): boolean {
  const t = text.toLowerCase();
  return (
    t.includes("unsupported") ||
    t.includes("not supported") ||
    t.includes("invalid object") ||
    t.includes("unknown object") ||
    t.includes("not a valid object")
  );
}

function parseToolResult(res: ToolResult): unknown {
  const text = textOf(res);
  if (res?.isError) {
    throw new HubSpotMcpError(`HubSpot tool error: ${text || "unknown error"}`);
  }
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

type SearchResults = {
  results?: Array<{
    id: string | number;
    properties?: Record<string, unknown>;
    associations?: Record<string, unknown>;
  }>;
  total?: number;
};

// ── REST (api.hubapi.com) response shapes ────────────────────────────────────

type RestObject = {
  id: string | number;
  properties?: Record<string, unknown>;
  associations?: Record<string, unknown>;
};

type RestSearchResponse = {
  results?: RestObject[];
  total?: number;
  paging?: { next?: { after?: string } };
};

type RestOwner = {
  id: string | number;
  email?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  teams?: Array<{ name?: unknown; id?: unknown } | null> | null;
};

type RestOwnersResponse = {
  results?: RestOwner[];
  paging?: { next?: { after?: string } };
};

type RestStage = {
  id: string | number;
  label?: unknown;
  displayOrder?: unknown;
  metadata?: { isClosed?: unknown; probability?: unknown };
};

type RestPipeline = {
  id: string | number;
  label?: unknown;
  stages?: RestStage[];
};

type RestPipelinesResponse = {
  results?: RestPipeline[];
};

function s(v: unknown): string | null {
  return v == null ? null : String(v);
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function mapContact(r: {
  id: string | number;
  properties?: Record<string, unknown>;
}): CrmContact {
  const p = (r.properties ?? {}) as Record<string, unknown>;
  return {
    id: String(r.id),
    email: s(p.email),
    firstName: s(p.firstname),
    lastName: s(p.lastname),
    company: s(p.company),
    jobTitle: s(p.jobtitle),
    phone: s(p.phone),
    raw: p,
  };
}

/** Pull associated object ids of a given type out of a HubSpot associations bag (shape-tolerant). */
function extractAssociationIds(
  associations: unknown,
  key: "companies" | "contacts",
): string[] {
  if (!associations || typeof associations !== "object") return [];
  const bag = (associations as Record<string, unknown>)[key];
  if (!bag || typeof bag !== "object") return [];
  const results = (bag as Record<string, unknown>).results;
  if (!Array.isArray(results)) return [];
  return results
    .map((r) => {
      if (r && typeof r === "object") {
        const id = (r as Record<string, unknown>).id ?? (r as Record<string, unknown>).toObjectId;
        return id == null ? null : String(id);
      }
      return null;
    })
    .filter((x): x is string => x != null);
}

function mapDeal(r: {
  id: string | number;
  properties?: Record<string, unknown>;
  associations?: unknown;
}): CrmDeal {
  const p = (r.properties ?? {}) as Record<string, unknown>;
  return {
    id: String(r.id),
    dealname: s(p.dealname),
    amount: num(p.amount),
    ownerId: s(p.hubspot_owner_id),
    stage: s(p.dealstage),
    pipeline: s(p.pipeline),
    closeDate: s(p.closedate),
    lastModified: s(p.hs_lastmodifieddate),
    lastActivityDate: s(p.notes_last_updated),
    nextStep: s(p.hs_next_step),
    associatedCompanyIds: extractAssociationIds(r.associations, "companies"),
    associatedContactIds: extractAssociationIds(r.associations, "contacts"),
    raw: p,
  };
}

function mapOwner(r: {
  id: string | number;
  email?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  properties?: Record<string, unknown>;
  teams?: unknown;
}): CrmOwner {
  // Owners come back with top-level fields on the official Owners API; tolerate
  // a properties-bag shape too.
  const p = (r.properties ?? {}) as Record<string, unknown>;
  const teamsRaw = r.teams;
  const teams = Array.isArray(teamsRaw)
    ? teamsRaw
        .map((t) =>
          t && typeof t === "object"
            ? s((t as Record<string, unknown>).name) ??
              s((t as Record<string, unknown>).id)
            : s(t),
        )
        .filter((x): x is string => x != null)
    : undefined;
  return {
    id: String(r.id),
    email: s(r.email ?? p.email),
    firstName: s(r.firstName ?? p.firstName ?? p.firstname),
    lastName: s(r.lastName ?? p.lastName ?? p.lastname),
    teams,
    raw: (r as Record<string, unknown>),
  };
}

function mapStage(
  r: {
    id: string | number;
    label?: unknown;
    displayOrder?: unknown;
    metadata?: Record<string, unknown>;
  },
  pipelineId: string | null,
): CrmPipelineStage {
  const meta = (r.metadata ?? {}) as Record<string, unknown>;
  const isClosedWon =
    String(meta.isClosed) === "true" && String(meta.probability) === "1.0";
  // HubSpot exposes won/lost via metadata.isClosed + probability; tolerate
  // explicit flags too.
  return {
    id: String(r.id),
    label: s(r.label),
    displayOrder: num(r.displayOrder),
    pipelineId,
    isWonStage:
      isClosedWon || String((r as Record<string, unknown>).isWonStage) === "true",
    isLostStage:
      (String(meta.isClosed) === "true" && !isClosedWon) ||
      String((r as Record<string, unknown>).isLostStage) === "true",
    raw: r as Record<string, unknown>,
  };
}

const ACTIVITY_OBJECT_TYPES: Record<CrmActivityType, string> = {
  call: "calls",
  email: "emails",
  meeting: "meetings",
  note: "notes",
  task: "tasks",
};

function mapActivity(
  r: { id: string | number; properties?: Record<string, unknown> },
  type: CrmActivityType,
): CrmActivity {
  const p = (r.properties ?? {}) as Record<string, unknown>;
  const subject =
    s(p.hs_call_title) ??
    s(p.hs_email_subject) ??
    s(p.hs_meeting_title) ??
    s(p.hs_task_subject) ??
    null;
  const body =
    s(p.hs_call_body) ??
    s(p.hs_email_text) ??
    s(p.hs_meeting_body) ??
    s(p.hs_note_body) ??
    s(p.hs_task_body) ??
    null;
  return {
    id: String(r.id),
    type,
    timestamp: s(p.hs_timestamp),
    ownerId: s(p.hubspot_owner_id),
    dealId: null,
    contactId: null,
    subject,
    body,
    raw: p,
  };
}

/** Build a HubSpot property bag (all values must be strings). */
function contactProps(input: UpsertContactInput): Record<string, string> {
  const p: Record<string, string> = { email: input.email };
  if (input.firstName) p.firstname = input.firstName;
  if (input.lastName) p.lastname = input.lastName;
  if (input.company) p.company = input.company;
  if (input.jobTitle) p.jobtitle = input.jobTitle;
  if (input.phone) p.phone = input.phone;
  if (input.properties) {
    for (const [k, v] of Object.entries(input.properties)) p[k] = String(v);
  }
  return p;
}

function companyProps(input: UpsertCompanyInput): Record<string, string> {
  const p: Record<string, string> = { domain: input.domain };
  if (input.name) p.name = input.name;
  if (input.properties) {
    for (const [k, v] of Object.entries(input.properties)) p[k] = String(v);
  }
  return p;
}

/** Pull a created/updated object id out of a manage_crm_objects response (shape-tolerant). */
function extractFirstId(data: unknown): string | null {
  if (data == null) return null;
  const d = data as Record<string, unknown>;
  const arr =
    (d.results as unknown[]) ??
    (d.objects as unknown[]) ??
    (d.created as unknown[]) ??
    (d.updated as unknown[]) ??
    (Array.isArray(data) ? (data as unknown[]) : null);
  if (Array.isArray(arr) && arr.length) {
    const first = arr[0] as Record<string, unknown>;
    if (first?.id != null) return String(first.id);
    if (first?.objectId != null) return String(first.objectId);
  }
  if (d.id != null) return String(d.id);
  if (d.objectId != null) return String(d.objectId);
  return null;
}

export class HubSpotClient implements CrmClient {
  constructor(
    private readonly accessToken: string,
    private readonly authMethod?: string,
  ) {}

  /** Open an MCP connection, run fn, always close. */
  private async withClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
    const transport = new StreamableHTTPClientTransport(new URL(HUBSPOT_MCP_URL), {
      requestInit: {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      },
    });
    const client = new Client(
      { name: "max-mcp-server", version: "1.0.0" },
      { capabilities: {} },
    );
    try {
      await client.connect(transport);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new HubSpotMcpError(`Failed to connect to mcp.hubspot.com: ${msg}`);
    }
    try {
      return await fn(client);
    } finally {
      await client.close().catch(() => {});
    }
  }

  private async call(
    client: Client,
    name: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    let res: ToolResult;
    try {
      res = (await client.callTool({ name, arguments: args })) as ToolResult;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new HubSpotMcpError(`HubSpot ${name} call failed: ${msg}`);
    }
    return parseToolResult(res);
  }

  /**
   * search_crm_objects wrapper that FAILS LOUD on unsupported object types.
   * mcp.hubspot.com is confirmed for contacts/companies; deals/owners/pipelines/
   * engagements are unverified here — if HubSpot rejects the objectType, we
   * surface an actionable HubSpotMcpError instead of returning [].
   */
  private async searchObjects(
    client: Client,
    objectType: string,
    args: Record<string, unknown>,
  ): Promise<SearchResults> {
    try {
      return (await this.call(client, "search_crm_objects", {
        objectType,
        ...args,
      })) as SearchResults;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (e instanceof HubSpotMcpError && looksUnsupportedObjectType(msg)) {
        throw new HubSpotMcpError(
          `objectType "${objectType}" not supported by mcp.hubspot.com — see fallback in max-agent src/features/crm/oauth/hubspot-oauth.ts comments (swap to standard HubSpot REST API). Underlying error: ${msg}`,
        );
      }
      throw e instanceof HubSpotMcpError ? e : new HubSpotMcpError(msg);
    }
  }

  private async searchByProperty(
    client: Client,
    objectType: "contacts" | "companies",
    propertyName: string,
    value: string,
    properties: string[],
  ): Promise<SearchResults> {
    return this.searchObjects(client, objectType, {
      filterGroups: [{ filters: [{ propertyName, operator: "EQ", value }] }],
      properties,
      limit: 1,
    });
  }

  private async searchContactsMcp(query: string, limit = 20): Promise<CrmContact[]> {
    return this.withClient(async (client) => {
      const data = await this.searchObjects(client, "contacts", {
        query,
        properties: CONTACT_PROPS,
        limit,
      });
      return (data?.results ?? []).map(mapContact);
    });
  }

  private async getContactByEmailMcp(email: string): Promise<CrmContact | null> {
    // HubSpot stores email lowercased; EQ is exact-match, so normalize to match.
    const normEmail = email.trim().toLowerCase();
    return this.withClient(async (client) => {
      const data = await this.searchByProperty(
        client,
        "contacts",
        "email",
        normEmail,
        CONTACT_PROPS,
      );
      const first = data?.results?.[0];
      return first ? mapContact(first) : null;
    });
  }

  private async upsertContactMcp(input: UpsertContactInput): Promise<{ id: string }> {
    // Normalize email so dedup matches HubSpot's lowercased stored value
    // (otherwise "Foo@Bar.com" misses the existing record → duplicate).
    const email = input.email.trim().toLowerCase();
    const normInput: UpsertContactInput = { ...input, email };
    return this.withClient(async (client) => {
      const existing = await this.searchByProperty(
        client,
        "contacts",
        "email",
        email,
        ["email"],
      );
      const existingId = existing?.results?.[0]?.id;
      const properties = contactProps(normInput);

      if (existingId != null) {
        await this.call(client, "manage_crm_objects", {
          updateRequest: {
            objects: [
              { objectType: "contacts", objectId: Number(existingId), properties },
            ],
          },
          confirmationStatus: "CONFIRMED",
        });
        return { id: String(existingId) };
      }

      const created = await this.call(client, "manage_crm_objects", {
        createRequest: { objects: [{ objectType: "contacts", properties }] },
        confirmationStatus: "CONFIRMED",
      });
      let id = extractFirstId(created);
      if (!id) {
        // Fallback: re-resolve by email to return a canonical id.
        const refetch = await this.searchByProperty(
          client,
          "contacts",
          "email",
          email,
          ["email"],
        );
        id = refetch?.results?.[0]?.id != null ? String(refetch.results[0].id) : null;
      }
      if (!id) throw new HubSpotMcpError("Contact upsert succeeded but no id was returned");
      return { id };
    });
  }

  private async upsertCompanyMcp(input: UpsertCompanyInput): Promise<{ id: string }> {
    // HubSpot lowercases the company `domain`; normalize so dedup matches.
    const domain = input.domain.trim().toLowerCase();
    const normInput: UpsertCompanyInput = { ...input, domain };
    return this.withClient(async (client) => {
      const existing = await this.searchByProperty(
        client,
        "companies",
        "domain",
        domain,
        COMPANY_PROPS,
      );
      const existingId = existing?.results?.[0]?.id;
      const properties = companyProps(normInput);

      if (existingId != null) {
        await this.call(client, "manage_crm_objects", {
          updateRequest: {
            objects: [
              { objectType: "companies", objectId: Number(existingId), properties },
            ],
          },
          confirmationStatus: "CONFIRMED",
        });
        return { id: String(existingId) };
      }

      const created = await this.call(client, "manage_crm_objects", {
        createRequest: { objects: [{ objectType: "companies", properties }] },
        confirmationStatus: "CONFIRMED",
      });
      let id = extractFirstId(created);
      if (!id) {
        const refetch = await this.searchByProperty(
          client,
          "companies",
          "domain",
          domain,
          ["domain"],
        );
        id = refetch?.results?.[0]?.id != null ? String(refetch.results[0].id) : null;
      }
      if (!id) throw new HubSpotMcpError("Company upsert succeeded but no id was returned");
      return { id };
    });
  }

  // ── Read-only the assistant methods ────────────────────────────────────────────
  //
  // ⚠️ UNVERIFIED objectTypes: deals/owners/pipelines/engagements support on
  // mcp.hubspot.com is not confirmed in this env. searchObjects() fails loud on
  // unsupported-objectType errors (see HubSpotMcpError pointer to REST fallback).

  private async listDealsMcp(filters: ListDealsFilters = {}): Promise<CrmDeal[]> {
    const filterGroup: Array<{ propertyName: string; operator: string; value: string }> = [];
    if (filters.stageId) filterGroup.push({ propertyName: "dealstage", operator: "EQ", value: filters.stageId });
    if (filters.ownerId) filterGroup.push({ propertyName: "hubspot_owner_id", operator: "EQ", value: filters.ownerId });
    if (filters.pipelineId) filterGroup.push({ propertyName: "pipeline", operator: "EQ", value: filters.pipelineId });
    if (filters.amountMin != null) filterGroup.push({ propertyName: "amount", operator: "GTE", value: String(filters.amountMin) });
    if (filters.amountMax != null) filterGroup.push({ propertyName: "amount", operator: "LTE", value: String(filters.amountMax) });
    if (filters.closeDateAfter) filterGroup.push({ propertyName: "closedate", operator: "GTE", value: filters.closeDateAfter });
    if (filters.closeDateBefore) filterGroup.push({ propertyName: "closedate", operator: "LTE", value: filters.closeDateBefore });
    if (filters.modifiedAfter) filterGroup.push({ propertyName: "hs_lastmodifieddate", operator: "GTE", value: filters.modifiedAfter });

    const args: Record<string, unknown> = {
      properties: DEAL_PROPS,
      limit: filters.limit ?? 50,
      associations: ["companies", "contacts"],
    };
    if (filterGroup.length) args.filterGroups = [{ filters: filterGroup }];

    return this.withClient(async (client) => {
      const data = await this.searchObjects(client, "deals", args);
      return (data?.results ?? []).map(mapDeal);
    });
  }

  private async getDealMcp(id: string): Promise<CrmDeal | null> {
    return this.withClient(async (client) => {
      const data = await this.searchObjects(client, "deals", {
        filterGroups: [{ filters: [{ propertyName: "hs_object_id", operator: "EQ", value: id }] }],
        properties: DEAL_PROPS,
        limit: 1,
        associations: ["companies", "contacts"],
      });
      const first = data?.results?.[0];
      return first ? mapDeal(first) : null;
    });
  }

  private async listActivitiesMcp(filters: ListActivitiesFilters = {}): Promise<CrmActivity[]> {
    const types: CrmActivityType[] = filters.types?.length
      ? filters.types
      : (["call", "email", "meeting", "note", "task"] as CrmActivityType[]);
    const limit = filters.limit ?? 50;

    return this.withClient(async (client) => {
      // HubSpot exposes engagements per-type — query each requested type, then
      // merge sorted by timestamp desc.
      const perType = await Promise.all(
        types.map(async (type) => {
          const objectType = ACTIVITY_OBJECT_TYPES[type];
          const filterGroup: Array<{ propertyName: string; operator: string; value: string }> = [];
          if (filters.ownerId) filterGroup.push({ propertyName: "hubspot_owner_id", operator: "EQ", value: filters.ownerId });
          if (filters.since) filterGroup.push({ propertyName: "hs_timestamp", operator: "GTE", value: filters.since });

          const args: Record<string, unknown> = {
            properties: ENGAGEMENT_PROPS,
            limit,
          };
          if (filterGroup.length) args.filterGroups = [{ filters: filterGroup }];

          const data = await this.searchObjects(client, objectType, args);
          return (data?.results ?? []).map((r) => mapActivity(r, type));
        }),
      );

      const merged = perType.flat();
      merged.sort((a, b) => {
        const ta = a.timestamp ? Date.parse(a.timestamp) : 0;
        const tb = b.timestamp ? Date.parse(b.timestamp) : 0;
        return tb - ta;
      });
      return merged.slice(0, limit);
    });
  }

  private async listOwnersMcp(): Promise<CrmOwner[]> {
    return this.withClient(async (client) => {
      const data = await this.searchObjects(client, "owners", {
        properties: ["email", "firstName", "lastName"],
        limit: 200,
      });
      return (data?.results ?? []).map(mapOwner);
    });
  }

  private async listPipelineStagesMcp(pipelineId?: string): Promise<CrmPipelineStage[]> {
    return this.withClient(async (client) => {
      const data = await this.searchObjects(client, "pipelines", {
        objectTypeId: "deals",
        ...(pipelineId ? { pipelineId } : {}),
        limit: 100,
      });
      // pipelines response: { results: [{ id, stages: [...] }] } — flatten stages.
      const out: CrmPipelineStage[] = [];
      for (const pipe of data?.results ?? []) {
        const pid = String(pipe.id);
        if (pipelineId && pid !== pipelineId) continue;
        const stagesRaw = (pipe as Record<string, unknown>).stages;
        if (Array.isArray(stagesRaw)) {
          for (const st of stagesRaw) {
            out.push(mapStage(st as Parameters<typeof mapStage>[0], pid));
          }
        }
      }
      out.sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
      return out;
    });
  }

  // ── Public routing methods ─────────────────────────────────────────────────
  //
  // owners / pipelines / activities → ALWAYS REST (mcp.hubspot.com does not
  // serve these object types — verified live: "Invalid object_type").
  // deals / getDeal / contacts / companies → REST for Private App (pat-) tokens,
  // else the existing MCP path (kept intact above as *Mcp).

  async listOwners(): Promise<CrmOwner[]> {
    void this.listOwnersMcp; // MCP path kept for reference; owners are REST-only.
    return this.listOwnersRest();
  }

  async listPipelineStages(pipelineId?: string): Promise<CrmPipelineStage[]> {
    void this.listPipelineStagesMcp; // MCP path kept for reference; pipelines are REST-only.
    return this.listPipelineStagesRest(pipelineId);
  }

  async listActivities(filters: ListActivitiesFilters = {}): Promise<CrmActivity[]> {
    void this.listActivitiesMcp; // MCP path kept for reference; activities are REST-only.
    return this.listActivitiesRest(filters);
  }

  async searchContacts(query: string, limit = 20): Promise<CrmContact[]> {
    return this.isPrivateAppToken()
      ? this.searchContactsRest(query, limit)
      : this.searchContactsMcp(query, limit);
  }

  async getContactByEmail(email: string): Promise<CrmContact | null> {
    return this.isPrivateAppToken()
      ? this.getContactByEmailRest(email)
      : this.getContactByEmailMcp(email);
  }

  async upsertContact(input: UpsertContactInput): Promise<{ id: string }> {
    return this.isPrivateAppToken()
      ? this.upsertContactRest(input)
      : this.upsertContactMcp(input);
  }

  async upsertCompany(input: UpsertCompanyInput): Promise<{ id: string }> {
    return this.isPrivateAppToken()
      ? this.upsertCompanyRest(input)
      : this.upsertCompanyMcp(input);
  }

  async listDeals(filters: ListDealsFilters = {}): Promise<CrmDeal[]> {
    return this.isPrivateAppToken()
      ? this.listDealsRest(filters)
      : this.listDealsMcp(filters);
  }

  async getDeal(id: string): Promise<CrmDeal | null> {
    return this.isPrivateAppToken() ? this.getDealRest(id) : this.getDealMcp(id);
  }

  // ── Token-type detection ───────────────────────────────────────────────────

  /**
   * HubSpot Private App tokens are formatted `pat-na1-...`; OAuth/MCP access
   * tokens are not. We use REST for everything when given a Private App token
   * (mcp.hubspot.com only accepts OAuth tokens), and always for owners/
   * pipelines/activities regardless of token type.
   */
  private isPrivateAppToken(): boolean {
    // Route static tokens (pasted Service Key / Private App) to REST. The
    // resolver-provided auth_method is authoritative; the "pat-" prefix is a
    // fallback for the legacy Private App format when auth_method is absent.
    return this.authMethod === "static" || this.accessToken.startsWith("pat-");
  }

  // ── REST request helper ────────────────────────────────────────────────────

  /**
   * Low-level HubSpot REST call against api.hubapi.com. Reuses fetchWithRetry
   * (timeouts, backoff, circuit breaker). Throws HubSpotMcpError on non-2xx so
   * tool error envelopes stay identical to the MCP path.
   */
  private async rest<T>(
    method: "GET" | "POST" | "PATCH",
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${HUBSPOT_REST_BASE}${path}`;
    const init: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
    };
    if (body !== undefined) init.body = JSON.stringify(body);

    let res: Response;
    try {
      res = await fetchWithRetry(url, init, { timeoutMs: 15_000 });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new HubSpotMcpError(`HubSpot REST ${method} ${path} failed: ${msg}`);
    }

    if (!res.ok) {
      let excerpt = "";
      try {
        excerpt = (await res.text()).slice(0, 300);
      } catch {
        excerpt = res.statusText;
      }
      if (res.status === 401) {
        throw new HubSpotMcpError("HubSpot token invalid or expired.");
      }
      if (res.status === 403) {
        throw new HubSpotMcpError(
          `HubSpot token is missing a required scope for this operation (path: ${path}). If you connected with a Private App token, add the matching CRM scope and reconnect.`,
        );
      }
      throw new HubSpotMcpError(
        `HubSpot REST ${method} ${path} failed (${res.status}): ${excerpt}`,
      );
    }

    if (res.status === 204) return undefined as T;
    try {
      return (await res.json()) as T;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new HubSpotMcpError(
        `HubSpot REST ${method} ${path} returned invalid JSON: ${msg}`,
      );
    }
  }

  // ── REST implementations ───────────────────────────────────────────────────

  private async listOwnersRest(): Promise<CrmOwner[]> {
    const out: CrmOwner[] = [];
    let after: string | undefined;
    // Paginate via paging.next.after; cap to ~500 owners to bound the work.
    while (out.length < 500) {
      const qs = `limit=100${after ? `&after=${encodeURIComponent(after)}` : ""}`;
      const data = await this.rest<RestOwnersResponse>("GET", `/crm/v3/owners?${qs}`);
      for (const r of data.results ?? []) {
        const teams = Array.isArray(r.teams)
          ? r.teams
              .map((t) => s(t?.name))
              .filter((x): x is string => x != null)
          : [];
        out.push({
          id: String(r.id),
          email: s(r.email),
          firstName: s(r.firstName),
          lastName: s(r.lastName),
          teams,
          raw: r as unknown as Record<string, unknown>,
        });
      }
      after = data.paging?.next?.after;
      if (!after) break;
    }
    return out;
  }

  private async listPipelineStagesRest(pipelineId?: string): Promise<CrmPipelineStage[]> {
    const data = await this.rest<RestPipelinesResponse>("GET", "/crm/v3/pipelines/deals");
    const out: CrmPipelineStage[] = [];
    for (const pipe of data.results ?? []) {
      const pid = String(pipe.id);
      if (pipelineId && pid !== pipelineId) continue;
      for (const st of pipe.stages ?? []) {
        const meta = st.metadata ?? {};
        // HubSpot metadata values are strings: isClosed "true"/"false",
        // probability "1.0" (won) / "0.0" (lost).
        const isWon = meta.isClosed === "true" && meta.probability === "1.0";
        const isLost = meta.isClosed === "true" && meta.probability === "0.0";
        out.push({
          id: String(st.id),
          label: s(st.label),
          displayOrder: num(st.displayOrder),
          pipelineId: pid,
          isWonStage: isWon,
          isLostStage: isLost,
          raw: st as unknown as Record<string, unknown>,
        });
      }
    }
    out.sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
    return out;
  }

  private buildDealFilterGroups(
    filters: ListDealsFilters,
  ): Array<{ filters: Array<{ propertyName: string; operator: string; value: string }> }> {
    const f: Array<{ propertyName: string; operator: string; value: string }> = [];
    if (filters.stageId) f.push({ propertyName: "dealstage", operator: "EQ", value: filters.stageId });
    if (filters.ownerId) f.push({ propertyName: "hubspot_owner_id", operator: "EQ", value: filters.ownerId });
    if (filters.pipelineId) f.push({ propertyName: "pipeline", operator: "EQ", value: filters.pipelineId });
    if (filters.amountMin != null) f.push({ propertyName: "amount", operator: "GTE", value: String(filters.amountMin) });
    if (filters.amountMax != null) f.push({ propertyName: "amount", operator: "LTE", value: String(filters.amountMax) });
    if (filters.closeDateAfter) f.push({ propertyName: "closedate", operator: "GTE", value: filters.closeDateAfter });
    if (filters.closeDateBefore) f.push({ propertyName: "closedate", operator: "LTE", value: filters.closeDateBefore });
    if (filters.modifiedAfter) f.push({ propertyName: "hs_lastmodifieddate", operator: "GTE", value: filters.modifiedAfter });
    return f.length ? [{ filters: f }] : [];
  }

  private async listDealsRest(filters: ListDealsFilters = {}): Promise<CrmDeal[]> {
    const body: Record<string, unknown> = {
      properties: DEAL_PROPS,
      limit: filters.limit ?? 50,
    };
    const filterGroups = this.buildDealFilterGroups(filters);
    if (filterGroups.length) body.filterGroups = filterGroups;

    const data = await this.rest<RestSearchResponse>(
      "POST",
      "/crm/v3/objects/deals/search",
      body,
    );
    return (data.results ?? []).map(mapDeal);
  }

  private async getDealRest(id: string): Promise<CrmDeal | null> {
    const qs = `properties=${DEAL_PROPS.join(",")}&associations=companies,contacts`;
    try {
      const data = await this.rest<RestObject>(
        "GET",
        `/crm/v3/objects/deals/${encodeURIComponent(id)}?${qs}`,
      );
      return data ? mapDeal(data) : null;
    } catch (e) {
      // A missing deal returns 404 — treat as "not found" rather than throwing.
      if (e instanceof HubSpotMcpError && / \(404\): /.test(e.message)) return null;
      throw e;
    }
  }

  private async listActivitiesRest(
    filters: ListActivitiesFilters = {},
  ): Promise<CrmActivity[]> {
    const types: CrmActivityType[] = filters.types?.length
      ? filters.types
      : (["call", "email", "meeting", "note", "task"] as CrmActivityType[]);
    const limit = filters.limit ?? 100;

    // Engagements are per-type objects in REST. Query each requested type, then
    // merge sorted by timestamp desc. NOTE: deal/contact association filtering is
    // best-effort in REST — we filter by owner + timestamp only and map
    // associations when present, leaving dealId/contactId null otherwise.
    const perType = await Promise.all(
      types.map(async (type) => {
        const objectType = ACTIVITY_OBJECT_TYPES[type];
        const f: Array<{ propertyName: string; operator: string; value: string }> = [];
        if (filters.since) f.push({ propertyName: "hs_timestamp", operator: "GTE", value: filters.since });
        if (filters.ownerId) f.push({ propertyName: "hubspot_owner_id", operator: "EQ", value: filters.ownerId });

        const body: Record<string, unknown> = {
          properties: ACTIVITY_PROPS_BY_TYPE[type],
          limit,
          sorts: [{ propertyName: "hs_timestamp", direction: "DESCENDING" }],
        };
        if (f.length) body.filterGroups = [{ filters: f }];

        const data = await this.rest<RestSearchResponse>(
          "POST",
          `/crm/v3/objects/${objectType}/search`,
          body,
        );
        return (data.results ?? []).map((r) => mapActivity(r, type));
      }),
    );

    const merged = perType.flat();
    merged.sort((a, b) => {
      const ta = a.timestamp ? Date.parse(a.timestamp) : 0;
      const tb = b.timestamp ? Date.parse(b.timestamp) : 0;
      return tb - ta;
    });
    return merged.slice(0, limit);
  }

  private async searchContactsRest(query: string, limit = 20): Promise<CrmContact[]> {
    const data = await this.rest<RestSearchResponse>(
      "POST",
      "/crm/v3/objects/contacts/search",
      { query, properties: CONTACT_PROPS, limit },
    );
    return (data.results ?? []).map(mapContact);
  }

  private async getContactByEmailRest(email: string): Promise<CrmContact | null> {
    // HubSpot stores email lowercased; EQ is exact-match, so normalize to match.
    const normEmail = email.trim().toLowerCase();
    const data = await this.rest<RestSearchResponse>(
      "POST",
      "/crm/v3/objects/contacts/search",
      {
        filterGroups: [
          { filters: [{ propertyName: "email", operator: "EQ", value: normEmail }] },
        ],
        properties: CONTACT_PROPS,
        limit: 1,
      },
    );
    const first = data.results?.[0];
    return first ? mapContact(first) : null;
  }

  private async upsertContactRest(input: UpsertContactInput): Promise<{ id: string }> {
    // Normalize email so dedup matches HubSpot's lowercased stored value.
    const email = input.email.trim().toLowerCase();
    const properties = contactProps({ ...input, email });

    const existing = await this.rest<RestSearchResponse>(
      "POST",
      "/crm/v3/objects/contacts/search",
      {
        filterGroups: [
          { filters: [{ propertyName: "email", operator: "EQ", value: email }] },
        ],
        properties: ["email"],
        limit: 1,
      },
    );
    const existingId = existing.results?.[0]?.id;

    if (existingId != null) {
      await this.rest(
        "PATCH",
        `/crm/v3/objects/contacts/${encodeURIComponent(String(existingId))}`,
        { properties },
      );
      return { id: String(existingId) };
    }

    const created = await this.rest<RestObject>("POST", "/crm/v3/objects/contacts", {
      properties,
    });
    if (created?.id == null) {
      throw new HubSpotMcpError("Contact upsert succeeded but no id was returned");
    }
    return { id: String(created.id) };
  }

  private async upsertCompanyRest(input: UpsertCompanyInput): Promise<{ id: string }> {
    // HubSpot lowercases the company `domain`; normalize so dedup matches.
    const domain = input.domain.trim().toLowerCase();
    const properties = companyProps({ ...input, domain });

    const existing = await this.rest<RestSearchResponse>(
      "POST",
      "/crm/v3/objects/companies/search",
      {
        filterGroups: [
          { filters: [{ propertyName: "domain", operator: "EQ", value: domain }] },
        ],
        properties: ["domain"],
        limit: 1,
      },
    );
    const existingId = existing.results?.[0]?.id;

    if (existingId != null) {
      await this.rest(
        "PATCH",
        `/crm/v3/objects/companies/${encodeURIComponent(String(existingId))}`,
        { properties },
      );
      return { id: String(existingId) };
    }

    const created = await this.rest<RestObject>("POST", "/crm/v3/objects/companies", {
      properties,
    });
    if (created?.id == null) {
      throw new HubSpotMcpError("Company upsert succeeded but no id was returned");
    }
    return { id: String(created.id) };
  }
}

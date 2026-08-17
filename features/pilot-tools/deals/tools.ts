// Native deal MCP tools — max-agent's own deals module, NOT HubSpot.
//
// The `crm_*` tools in features/pilot-tools/crm talk to a connected HubSpot
// portal. This grouped `deals` tool talks to max-agent's native
// /api/v1/deals/* routes with the workspace bearer: multi-pipeline boards,
// stages, per-deal currency, M:N contacts, and append-only stage history.
// The MCP server always goes through the Max API — never Supabase — so an
// agent never holds the service-role key and every call passes max-agent's
// workspace auth gate (deals:read / deals:write plus the member's shared
// `deals` capability for JWT bearers).
//
// SURFACE, deliberately partial:
//   • No delete action — deleting a deal erases its history; that stays a
//     human decision in the UI.
//   • No pipeline/stage/rule management — board layout is workspace
//     configuration, owned by humans in settings. Agents work the board;
//     they do not rebuild it.
// Stage moves (move_stage / win / lose) fire the destination stage's
// entry-automation rules upstream exactly as a human drag does.

import {
  callApi,
  registerGroupedTool,
  type GroupedActionDef,
  type McpServer,
} from "../shared";
import * as repo from "./repository";
import * as S from "./schema";

/**
 * A grouped action plus the capability that governs it.
 *
 * See features/pilot-tools/meetings/tools.ts for the full note on how the
 * capability-403 layer actually works. Short version: max-agent's guard uses a
 * capability the ROUTE declares server-side and never reads the caller-asserted
 * one from the X-Hermes-Caller envelope. These names are the MCP-side mirror —
 * they document what governs each tool and give the Hermes client the right
 * envelope string. They do not themselves enforce anything.
 */
interface DealAction extends GroupedActionDef {
  capability: string;
}

/** Read deals, stage history, board totals, pipelines. */
const CAP_DEALS_READ = "deals.read";
/** Create/edit deals, move stages, manage contacts. */
const CAP_DEALS_WRITE = "deals.write";

function toListParams(input: Record<string, unknown>): repo.ListDealsParams {
  return {
    pipeline_id: input.pipeline_id as string | undefined,
    stage_id: input.stage_id as string | undefined,
    status: input.status as string | undefined,
    owner_id: input.owner_id as string | undefined,
    organization_id: input.organization_id as string | undefined,
    prospect_id: input.prospect_id as string | undefined,
    search: input.search as string | undefined,
    page: input.page as number | undefined,
    pageSize: input.page_size as number | undefined,
    sortBy: input.sort_by as string | undefined,
    sortOrder: input.sort_order as string | undefined,
  };
}

/**
 * Copy `key` from the input to `outKey` on the body, only when the caller
 * actually sent it. `null` is preserved (PATCH uses it to clear a field);
 * `undefined` means "not sent" and is dropped.
 */
function pick(
  input: Record<string, unknown>,
  key: string,
  out: Record<string, unknown>,
  outKey = key,
): void {
  if (key in input && input[key] !== undefined) out[outKey] = input[key];
}

const DEAL_FIELDS = [
  "name",
  "amount",
  "currency",
  "close_date",
  "probability",
  "owner_id",
  "organization_id",
  "description",
  "custom_fields",
] as const;

function buildDealBody(
  input: Record<string, unknown>,
  extra: readonly string[] = [],
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const f of [...DEAL_FIELDS, ...extra]) pick(input, f, body);
  return body;
}

const DEAL_ACTIONS: DealAction[] = [
  {
    action: "list",
    capability: CAP_DEALS_READ,
    title: "List deals",
    description:
      "List the workspace's deals with the joined company summary and contacts. Filters AND together: pipeline_id, stage_id, status (open/won/lost), owner_id, organization_id, prospect_id (the deals a contact is on), and free-text search over names. Returns {data: DealWithRelations[], count, page, pageSize} — page through with page/page_size (max 100, default 20), sorted by sort_by/sort_order (default updated_at desc).",
    inputShape: S.listDealsSchema.shape,
    handler: (input) =>
      callApi(input.bearer_token as string | undefined, (t) =>
        repo.listDeals(t, toListParams(input)),
      ),
  },
  {
    action: "get",
    capability: CAP_DEALS_READ,
    title: "Get a deal",
    description:
      "Get one deal by UUID: amount, currency, close_date, probability (stage default unless overridden), status, owner, the joined company summary, the contact roster (with per-contact role and primary flag), and custom_fields. Returns {data: DealWithRelations}. 404 if the deal is not in your workspace.",
    inputShape: S.getDealSchema.shape,
    handler: (input) =>
      callApi(input.bearer_token as string | undefined, (t) =>
        repo.getDeal(t, input.id as string),
      ),
  },
  {
    action: "create",
    capability: CAP_DEALS_WRITE,
    title: "Create a deal",
    description:
      "Create a deal. Only name is required — pipeline defaults to the workspace's default board (seeded on first use) and stage to its first open column. Optionally attach a company (organization_id), contacts (prospect_ids — the first becomes primary), amount + currency, close_date, owner_id, and custom_fields (validated against the workspace registry; unknown keys are a 400 — check list_custom_fields first). Returns {data: Deal} (201). The stage's entry-automation rules fire on creation.",
    inputShape: S.createDealSchema.shape,
    handler: (input) =>
      callApi(input.bearer_token as string | undefined, (t) =>
        repo.createDeal(
          t,
          buildDealBody(input, ["pipeline_id", "stage_id", "prospect_ids"]),
        ),
      ),
  },
  {
    action: "update",
    capability: CAP_DEALS_WRITE,
    title: "Update a deal",
    description:
      "Edit a deal's fields: name, amount, currency, close_date, probability, owner_id, organization_id, description, lost_reason, custom_fields (merged — send only the keys you change, null deletes a key; validated against the registry). Stage moves are NOT accepted here — use move_stage, win, or lose. Returns {data: Deal}. 400 on validation failure, 404 if not in your workspace.",
    inputShape: S.updateDealSchema.shape,
    handler: (input) =>
      callApi(input.bearer_token as string | undefined, (t) =>
        repo.updateDeal(
          t,
          input.id as string,
          buildDealBody(input, ["lost_reason"]),
        ),
      ),
  },
  {
    action: "move_stage",
    capability: CAP_DEALS_WRITE,
    title: "Move a deal to a stage",
    description:
      "Move a deal to another stage — same or different pipeline (a cross-pipeline move re-homes the deal). Records an append-only stage event, syncs status/won_at/lost_at from the destination stage's type, and fires that stage's entry-automation rules (e.g. create a task, notify the owner). Returns {data: Deal}. 400 on an unknown stage, 404 if the deal is not in your workspace.",
    inputShape: S.moveDealStageSchema.shape,
    handler: (input) =>
      callApi(input.bearer_token as string | undefined, (t) =>
        repo.moveDealStage(t, input.id as string, input.stage_id as string),
      ),
  },
  {
    action: "win",
    capability: CAP_DEALS_WRITE,
    title: "Win a deal",
    description:
      "Close a deal as won — shortcut for move_stage to the pipeline's won column. Sets status won and won_at, records the stage event, fires the won stage's entry rules. Returns {data: Deal}. 409 if the pipeline has no won stage, 404 if the deal is not in your workspace.",
    inputShape: S.winDealSchema.shape,
    handler: (input) =>
      callApi(input.bearer_token as string | undefined, (t) =>
        repo.winDeal(t, input.id as string),
      ),
  },
  {
    action: "lose",
    capability: CAP_DEALS_WRITE,
    title: "Lose a deal",
    description:
      "Close a deal as lost — shortcut for move_stage to the pipeline's lost column, optionally recording lost_reason. Sets status lost and lost_at, records the stage event, fires the lost stage's entry rules. Returns {data: Deal}. 409 if the pipeline has no lost stage, 404 if the deal is not in your workspace.",
    inputShape: S.loseDealSchema.shape,
    handler: (input) =>
      callApi(input.bearer_token as string | undefined, (t) =>
        repo.loseDeal(
          t,
          input.id as string,
          input.lost_reason as string | undefined,
        ),
      ),
  },
  {
    action: "list_stage_events",
    capability: CAP_DEALS_READ,
    title: "Get a deal's stage history",
    description:
      "Read a deal's append-only stage history, newest first: from_stage_id (null for creation), to_stage_id, the amount at the time of the change, who changed it, and when. Returns {data: DealStageEvent[]}. 404 if the deal is not in your workspace.",
    inputShape: S.listDealStageEventsSchema.shape,
    handler: (input) =>
      callApi(input.bearer_token as string | undefined, (t) =>
        repo.listStageEvents(t, input.id as string),
      ),
  },
  {
    action: "add_contact",
    capability: CAP_DEALS_WRITE,
    title: "Add a deal contact",
    description:
      "Associate a prospect with a deal (M:N), optionally with a free-text role and a primary flag (making one contact primary demotes the previous one). Returns {data: DealProspect} (201). 404 if the deal or prospect is not in your workspace, 409 if already associated.",
    inputShape: S.addDealContactSchema.shape,
    handler: (input) =>
      callApi(input.bearer_token as string | undefined, (t) =>
        repo.addContact(t, input.id as string, {
          prospect_id: input.prospect_id,
          ...(input.role !== undefined ? { role: input.role } : {}),
          ...(input.is_primary !== undefined
            ? { is_primary: input.is_primary }
            : {}),
        }),
      ),
  },
  {
    action: "remove_contact",
    capability: CAP_DEALS_WRITE,
    title: "Remove a deal contact",
    description:
      "Remove a prospect's association with a deal. Only the association is removed — the prospect record itself is untouched. Returns {success: true}. 404 if the deal or the association is not in your workspace.",
    inputShape: S.removeDealContactSchema.shape,
    handler: (input) =>
      callApi(input.bearer_token as string | undefined, (t) =>
        repo.removeContact(
          t,
          input.id as string,
          input.prospect_id as string,
        ),
      ),
  },
  {
    action: "board_totals",
    capability: CAP_DEALS_READ,
    title: "Get board totals",
    description:
      "Per-stage totals for one pipeline's board header: deal count plus amount sums per currency, both raw and probability-weighted. Returns {data: Record<stageId, {count, sums: [{currency, amount, weighted}]}>}. Counts cover ALL deals in each stage, not just a page.",
    inputShape: S.dealBoardTotalsSchema.shape,
    handler: (input) =>
      callApi(input.bearer_token as string | undefined, (t) =>
        repo.boardTotals(t, input.pipeline_id as string),
      ),
  },
  {
    action: "list_pipelines",
    capability: CAP_DEALS_READ,
    title: "List pipelines",
    description:
      "List the workspace's deal pipelines with their ordered stages (id, key, label, type open/won/lost, win_probability, position). The default \"Sales pipeline\" is seeded on first read, so this never returns empty. Use it to resolve stage UUIDs before create/move_stage. Returns {data: DealPipeline[]}.",
    inputShape: S.listDealPipelinesSchema.shape,
    handler: (input) =>
      callApi(input.bearer_token as string | undefined, (t) =>
        repo.listPipelines(t, input.include_archived as boolean | undefined),
      ),
  },
];

/** Tool/action → the capability that governs it, for the capability-403 layer. */
export const DEALS_CAPABILITIES: Readonly<Record<string, string>> =
  Object.fromEntries(DEAL_ACTIONS.map((a) => [`deals.${a.action}`, a.capability]));

export function registerDealsTools(server: McpServer): void {
  registerGroupedTool(
    server,
    "deals",
    "Max's native deals on multi-pipeline revenue boards — NOT the HubSpot crm_* tools. The workspace comes from your bearer token; every id argument filters or targets within it.",
    DEAL_ACTIONS,
  );
}

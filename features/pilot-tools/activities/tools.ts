// Unified activity-timeline MCP tools.
//
// One feed per prospect / company / deal in max-agent: notes, logged calls,
// messages, meetings, completed tasks and stage changes, read and written
// through /api/v1/activities/* with the workspace bearer. The MCP server
// always goes through the Max API — never Supabase — so an agent never holds
// the service-role key and every call passes max-agent's workspace auth gate
// (prospects:read / prospects:write for API-key bearers).
//
// WRITABLE TYPES ONLY: notes and manual calls. Everything else on the
// timeline (email/linkedin/whatsapp messages, meetings, tasks, stage
// changes) is written through by the system from its source of truth — there
// is deliberately no tool to fabricate those, and no delete tool: an agent
// that could write "the prospect replied" or erase history would make the
// timeline fiction. update is limited the same way upstream: note content
// only, plus pin/unpin on any activity.

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
 * capability-403 layer actually works: these names are the MCP-side mirror of
 * the route-declared capability — documentation plus the Hermes envelope
 * string, never enforcement.
 */
interface ActivityAction extends GroupedActionDef {
  capability: string;
}

/** Read a record's timeline. */
const CAP_ACTIVITIES_READ = "activities.read";
/** Write notes and calls, pin/unpin. */
const CAP_ACTIVITIES_WRITE = "activities.write";

/**
 * Copy `key` from the input to the body, only when the caller actually sent
 * it. `null` is preserved (PATCH uses it to clear a field); `undefined` means
 * "not sent" and is dropped.
 */
function pick(
  input: Record<string, unknown>,
  key: string,
  out: Record<string, unknown>,
): void {
  if (key in input && input[key] !== undefined) out[key] = input[key];
}

function buildBody(
  input: Record<string, unknown>,
  fields: readonly string[],
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const f of fields) pick(input, f, body);
  return body;
}

const ENTITY_LINKS = ["prospect_id", "organization_id", "deal_id"] as const;

const ACTIVITY_ACTIONS: ActivityAction[] = [
  {
    action: "list",
    capability: CAP_ACTIVITIES_READ,
    title: "List a record's activities",
    description:
      "Read one record's unified timeline — notes, calls, messages, meetings, completed tasks, stage changes — pinned items first, then newest first. At least one of prospect_id / organization_id / deal_id is REQUIRED (the route refuses a workspace-wide dump); pass more than one to intersect, and type to narrow (e.g. type:\"note\"). Returns {data: Activity[], count, page, pageSize} — page through with page/page_size (max 100, default 30).",
    inputShape: S.listActivitiesSchema.shape,
    handler: (input) =>
      callApi(input.bearer_token as string | undefined, (t) =>
        repo.listActivities(t, {
          prospect_id: input.prospect_id as string | undefined,
          organization_id: input.organization_id as string | undefined,
          deal_id: input.deal_id as string | undefined,
          type: input.type as string | undefined,
          page: input.page as number | undefined,
          pageSize: input.page_size as number | undefined,
        }),
      ),
  },
  {
    action: "create_note",
    capability: CAP_ACTIVITIES_WRITE,
    title: "Add a note",
    description:
      "Write a note onto a record's timeline. Attach it to at least one of prospect_id / organization_id / deal_id (400 otherwise) — attaching to several puts the same note on each feed. Returns {data: Activity} (201).",
    inputShape: S.createNoteSchema.shape,
    handler: (input) =>
      callApi(input.bearer_token as string | undefined, (t) =>
        repo.createNote(
          t,
          buildBody(input, ["body", "subject", ...ENTITY_LINKS]),
        ),
      ),
  },
  {
    action: "log_call",
    capability: CAP_ACTIVITIES_WRITE,
    title: "Log a call",
    description:
      "Log a call that already happened onto a record's timeline: outcome (connected/voicemail/no_answer/wrong_number) is required, plus optional direction (default outbound), duration_seconds, notes (body), and occurred_at to backdate to when the call really took place. Attach to at least one of prospect_id / organization_id / deal_id (400 otherwise). Returns {data: Activity} (201).",
    inputShape: S.logCallSchema.shape,
    handler: (input) =>
      callApi(input.bearer_token as string | undefined, (t) =>
        repo.logCall(
          t,
          buildBody(input, [
            "outcome",
            "direction",
            "duration_seconds",
            "body",
            "occurred_at",
            ...ENTITY_LINKS,
          ]),
        ),
      ),
  },
  {
    action: "update",
    capability: CAP_ACTIVITIES_WRITE,
    title: "Edit a note / pin an activity",
    description:
      "Edit a note's body or subject, or set is_pinned on ANY activity (pinned items sort first in list). System-written activities — messages, meetings, tasks, stage changes — reject content edits (400): only their pin state can change. Returns {data: Activity}. 404 if the activity is not in your workspace.",
    inputShape: S.updateNoteSchema.shape,
    handler: (input) =>
      callApi(input.bearer_token as string | undefined, (t) =>
        repo.updateActivity(
          t,
          input.id as string,
          buildBody(input, ["body", "subject", "is_pinned"]),
        ),
      ),
  },
];

/** Tool/action → the capability that governs it, for the capability-403 layer. */
export const ACTIVITIES_CAPABILITIES: Readonly<Record<string, string>> =
  Object.fromEntries(
    ACTIVITY_ACTIONS.map((a) => [`activities.${a.action}`, a.capability]),
  );

export function registerActivitiesTools(server: McpServer): void {
  registerGroupedTool(
    server,
    "activities",
    "The unified activity timeline on Max's prospects, companies and deals — read a record's history, add notes, log calls. The workspace comes from your bearer token; the id arguments filter within it.",
    ACTIVITY_ACTIONS,
  );
}

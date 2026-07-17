// Meeting-hub MCP tools.
//
// Reads the meetings list and the per-prospect meeting feed from max-agent's
// /api/v1/meeting-hub/* routes with the workspace bearer. The MCP server always
// goes through the Max API — never Supabase — so an agent never holds the
// service-role key and every read passes max-agent's workspace auth gate.
//
// ── NOT REGISTERED HERE, AND WHY ────────────────────────────────────────────
// This group was specified with five actions: list, get, get_transcript,
// get_summary, list_participants. Only `list` ships, because as of
// max-agent@feat/meetings-integration (2b0b300) the other four HAVE NO ROUTE.
// The whole meeting-hub HTTP surface is:
//
//   GET   /api/v1/meeting-hub/sessions                          ← list (shipped)
//   PATCH /api/v1/meeting-hub/sessions/[id]/segments/[seq]      ← transcript EDIT
//   POST  /api/v1/meeting-hub/sessions/[id]/summary/regenerate  ← summary REQUEUE
//   POST  /api/v1/meeting-hub/cron/ingest                       ← cron
//
// There is no session-detail, transcript, summary, or participants GET on any
// branch of max-agent (checked with `git log --all -- src/app/api/v1/meeting-hub/**`).
// MeetingSessionDetailDto / TranscriptVersionDto / MeetingSummaryDto /
// MeetingParticipantDto exist in the frozen contract but nothing serves them
// over HTTP yet.
//
// Registering the four anyway would mean inventing URLs and shipping tools that
// 404 — the model would call them, get a confusing upstream error, and retry.
// They land the moment Track B adds the routes; the shapes are already frozen.

import {
  callApi,
  registerGroupedTool,
  toolHints,
  type GroupedActionDef,
  type McpServer,
} from "../shared";
import * as repo from "./repository";
import * as S from "./schema";

/**
 * A grouped action plus the capability that governs it.
 *
 * HOW THE CAPABILITY-403 LAYER ACTUALLY WORKS — read before trusting this
 * field: max-agent's guard (features/onboarding-hermes/services/
 * hermes-caller.guard.ts) authorizes an action against the `capability_allowlist`
 * table using a capability the ROUTE declares server-side. It deliberately does
 * NOT read the capability out of the X-Hermes-Caller envelope, because that
 * value is caller-asserted — trusting it would let a caller name a capability
 * it holds a row for while doing something else entirely.
 *
 * So the name below is the MCP-side MIRROR of the route-declared name: it
 * documents which capability governs each tool and gives the Hermes client the
 * right string for its envelope. It does NOT itself enforce anything, and
 * naming a capability here does not create the 403 — the route must declare it.
 * Today only /api/v1/vexa/bots declares one ("vexa.bot.dispatch"); the
 * meeting-hub routes call no guard yet, so these reads are currently ungoverned
 * upstream regardless of what this map says.
 */
interface MeetingAction extends GroupedActionDef {
  capability: string;
}

/** Read a workspace's meetings. */
const CAP_MEETINGS_READ = "meetings.read";

function toListParams(input: Record<string, unknown>): repo.ListSessionsParams {
  return {
    prospectId: input.prospect_id as string | undefined,
    status: input.status as string | undefined,
    search: input.search as string | undefined,
    from: input.from as string | undefined,
    to: input.to as string | undefined,
    limit: input.limit as number | undefined,
    cursor: input.cursor as string | undefined,
  };
}

const MEETING_ACTIONS: MeetingAction[] = [
  {
    action: "list",
    capability: CAP_MEETINGS_READ,
    title: "List meetings",
    description:
      "List the workspace's meetings, newest first. Filter by prospect_id, status, free-text search, and a from/to window over startedAt. Returns {data: MeetingSessionSummaryDto[], nextCursor}: each row has id, title, platform, source, status, startedAt, endedAt, participantCount, hasTranscript, hasSummary, hasRecording and openTaskCount. Paginated — pass the returned nextCursor back as cursor to get the next page; nextCursor null means the last page.",
    inputShape: S.listMeetingsSchema.shape,
    handler: (input) =>
      callApi(input.bearer_token as string | undefined, (t) =>
        repo.listSessions(t, toListParams(input)),
      ),
  },
];

/** Tool/action → the capability that governs it, for the capability-403 layer. */
export const MEETINGS_CAPABILITIES: Readonly<Record<string, string>> = {
  ...Object.fromEntries(
    MEETING_ACTIONS.map((a) => [`meetings.${a.action}`, a.capability]),
  ),
  prospect_list_meetings: CAP_MEETINGS_READ,
};

export function registerMeetingTools(server: McpServer): void {
  registerGroupedTool(
    server,
    "meetings",
    "Read the workspace's meetings from the meeting hub. The workspace comes from your bearer token — prospect_id filters within it.",
    MEETING_ACTIONS,
  );

  // Flat convenience tool for the prospect meeting feed. Same endpoint as
  // meetings/list, but prospect_id is required — this is the "what have we
  // discussed with this prospect" read, and making the filter mandatory stops
  // it from silently degrading into a whole-workspace list.
  server.registerTool(
    "prospect_list_meetings",
    {
      title: "List a prospect's meetings",
      description:
        "List the meetings involving one prospect, newest first — the prospect meeting feed. Same filters and shape as the `meetings` group's list action, with prospect_id required. Returns {data: MeetingSessionSummaryDto[], nextCursor}. Paginated: echo nextCursor back as cursor; null means the last page. prospect_id filters within your authenticated workspace.",
      inputSchema: S.prospectListMeetingsSchema,
      ...toolHints.readOnly,
    },
    async (input) =>
      callApi(input.bearer_token as string | undefined, (t) =>
        repo.listSessions(t, toListParams(input)),
      ),
  );
}

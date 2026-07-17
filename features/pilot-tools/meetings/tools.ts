// Meeting-hub MCP tools.
//
// Reads the meetings list, the per-prospect feed, and a single meeting's detail,
// transcript, summary, and participant roster from max-agent's
// /api/v1/meeting-hub/* routes with the workspace bearer. The MCP server always
// goes through the Max API — never Supabase — so an agent never holds the
// service-role key and every read passes max-agent's workspace auth gate.
//
//   GET /meeting-hub/sessions                          → list
//   GET /meeting-hub/sessions/[id]                     → get           (detail)
//   GET /meeting-hub/sessions/[id]/transcript?version= → get_transcript
//   GET /meeting-hub/sessions/[id]/summary             → get_summary
//   GET /meeting-hub/sessions/[id]/participants        → list_participants
//
// ── TOKEN CONTROL ───────────────────────────────────────────────────────────
// A transcript version is one flat list of segments; a long meeting is
// thousands of them. TWO tools carry that weight and BOTH bound it:
//   • get_transcript windows the segments (default 50, paged via nextOffset).
//   • get (detail) EMBEDS the full current transcript in MeetingSessionDetailDto
//     .currentTranscript.segments — so it omits those segments and points the
//     caller at get_transcript. get still returns everything cheap: metadata,
//     stages, participants, the summary, and the staleness flags.
// The upstream routes have no paging of their own, so both bounds are applied
// client-side here. Agents should prefer get_summary for an overview and only
// page the raw transcript when they need the exact words.

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

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

/** Re-serialize `value` as the tool's single text content block. */
function jsonResult(value: unknown): ToolResult {
  return { content: [{ type: "text" as const, text: JSON.stringify(value) }] };
}

/**
 * Parse the JSON `data` object out of a successful callApi result, or null if
 * the result is an error / not the shape we expect. Lets a transform bail out
 * and hand the original result back untouched rather than guess.
 */
function readDataObject(
  result: ToolResult,
): { parsed: Record<string, unknown>; data: Record<string, unknown> } | null {
  if (result.isError) return null;
  const text = result.content[0]?.text ?? "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const data = (parsed as { data?: unknown }).data;
  if (typeof data !== "object" || data === null) return null;
  return {
    parsed: parsed as Record<string, unknown>,
    data: data as Record<string, unknown>,
  };
}

/**
 * get (detail) embeds the full current transcript in
 * MeetingSessionDetailDto.currentTranscript.segments. Strip those segments so a
 * detail read is not a whole-transcript dump, and point the caller at
 * get_transcript. Everything else in the detail (stages, participants, summary,
 * staleness) stays. A null/absent/empty transcript is handed back untouched.
 */
function stripDetailTranscript(result: ToolResult): ToolResult {
  const read = readDataObject(result);
  if (!read) return result;

  const ct = read.data.currentTranscript;
  if (typeof ct !== "object" || ct === null) return result;
  const segments = (ct as { segments?: unknown }).segments;
  if (!Array.isArray(segments) || segments.length === 0) return result;

  return jsonResult({
    ...read.parsed,
    data: {
      ...read.data,
      currentTranscript: { ...(ct as Record<string, unknown>), segments: [] },
    },
    transcriptOmitted: {
      reason:
        "currentTranscript.segments omitted to control token cost — call meetings.get_transcript for the words (it pages).",
      segmentCount: segments.length,
      transcriptVersionNumber: (ct as { versionNumber?: unknown }).versionNumber ?? null,
    },
  });
}

/**
 * get_transcript returns one version's WHOLE segment list. Window it so a long
 * meeting does not dump tens of thousands of tokens by default: a bounded slice
 * (default 50, max 200), paged via transcriptWindow.nextOffset. A non-array
 * segments field (or an error result) is handed back untouched.
 */
function boundTranscript(
  result: ToolResult,
  offset: number | undefined,
  limit: number | undefined,
): ToolResult {
  const read = readDataObject(result);
  if (!read) return result;

  const segments = (read.data as { segments?: unknown }).segments;
  if (!Array.isArray(segments)) return result;

  const total = segments.length;
  const start = Math.min(Math.max(offset ?? 0, 0), total);
  const size = Math.min(
    Math.max(limit ?? S.TRANSCRIPT_DEFAULT_SEGMENTS, 1),
    S.TRANSCRIPT_MAX_SEGMENTS,
  );
  const windowed = segments.slice(start, start + size);
  const end = start + windowed.length;
  const nextOffset = end < total ? end : null;

  return jsonResult({
    ...read.parsed,
    data: { ...read.data, segments: windowed },
    transcriptWindow: {
      totalSegments: total,
      offset: start,
      limit: size,
      returnedSegments: windowed.length,
      nextOffset,
      truncated: nextOffset !== null || start > 0,
    },
  });
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
  {
    action: "get",
    capability: CAP_MEETINGS_READ,
    title: "Get a meeting",
    description:
      "Get one meeting in detail by session id: a MeetingSessionDetailDto with per-stage health, the participant roster, the current summary, the current transcript POINTER (version number + staleness), and derived flags (summaryStale, recordingAvailable). To control token cost the raw transcript SEGMENTS are omitted here — the response carries transcriptOmitted {segmentCount, transcriptVersionNumber}; call get_transcript for the words. Returns {data: MeetingSessionDetailDto, transcriptOmitted?}. 404 if the meeting is not in your workspace.",
    inputShape: S.getMeetingSchema.shape,
    handler: async (input) => {
      const result = await callApi(input.bearer_token as string | undefined, (t) =>
        repo.getSession(t, input.id as string),
      );
      return stripDetailTranscript(result);
    },
  },
  {
    action: "get_transcript",
    capability: CAP_MEETINGS_READ,
    title: "Get a meeting transcript",
    description:
      "Get one meeting's transcript. Omit version for the current (authoritative) version; pass a version number for a historical one. BOUNDED FOR TOKEN COST: returns a WINDOW of segments (default 50, max 200), not the whole transcript — the response carries transcriptWindow {totalSegments, offset, limit, returnedSegments, nextOffset, truncated}. Page by re-calling with offset = the previous nextOffset (null means no more). Prefer get_summary for an overview; page the transcript only when you need exact wording. Returns {data: TranscriptVersionDto (windowed segments), transcriptWindow}. 400 on a bad version, 404 if the meeting or version is not found.",
    inputShape: S.getTranscriptSchema.shape,
    handler: async (input) => {
      const result = await callApi(input.bearer_token as string | undefined, (t) =>
        repo.getTranscript(t, input.id as string, input.version as number | undefined),
      );
      return boundTranscript(
        result,
        input.offset as number | undefined,
        input.limit as number | undefined,
      );
    },
  },
  {
    action: "get_summary",
    capability: CAP_MEETINGS_READ,
    title: "Get a meeting summary",
    description:
      "Get one meeting's current summary — the token-cheap overview to reach for before the raw transcript. Returns {data: MeetingSummaryDto} with summary, keyDecisions, discussionPoints, risksOpenQuestions, sentiment, nextSteps, and the source transcript version it was generated from. Returns {data: null} (not an error) when the meeting exists but has no summary yet (e.g. still processing). 404 if the meeting is not in your workspace.",
    inputShape: S.getSummarySchema.shape,
    handler: (input) =>
      callApi(input.bearer_token as string | undefined, (t) =>
        repo.getSummary(t, input.id as string),
      ),
  },
  {
    action: "list_participants",
    capability: CAP_MEETINGS_READ,
    title: "List meeting participants",
    description:
      "List one meeting's participant roster. Returns {data: MeetingParticipantDto[]}: each has displayName, email, role, isInternal, and the SUGGESTED prospect match (prospectId, matchStatus, matchConfidence, relationType). A match is a machine suggestion until a human confirms it — never treat matchStatus 'suggested' as fact. Unpaginated (bounded by meeting size). 404 if the meeting is not in your workspace.",
    inputShape: S.listParticipantsSchema.shape,
    handler: (input) =>
      callApi(input.bearer_token as string | undefined, (t) =>
        repo.listParticipants(t, input.id as string),
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

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
//   GET    /meeting-hub/calendar                                → list_calendar
//   GET    /meeting-hub/coaching-library                        → list_coaching_library
//   GET    /meeting-hub/conversation-configuration              → get_conversation_config
//   GET    /meeting-hub/sessions/[id]/conversation-intelligence → get_conversation_analysis
//   GET    /meeting-hub/sessions/[id]/feedback                  → list_feedback
//   GET    /meeting-hub/sessions/[id]/live-transcript           → get_live_transcript
//   GET    /meeting-hub/sessions/[id]/notes                     → list_notes
//   POST   /meeting-hub/sessions/[id]/notes (JSON)              → add_note
//   DELETE /meeting-hub/sessions/[id]/notes/[noteId]            → delete_note
//   PATCH  /meeting-hub/sessions/[id]/segments                  → correct_transcript
//   POST   /meeting-hub/sessions/[id]/summary/regenerate        → regenerate_summary
//   POST   /meeting-hub/sessions                                → create
//   DELETE /meeting-hub/sessions/[id]/share-link                → disable_share_link
//   GET    /vexa/bots/activity                                  → list_bots
//   GET    /vexa/meetings                                       → list_bot_meetings
//   GET    /vexa/transcripts/[platform]/[nativeMeetingId]       → get_bot_transcript
//   DELETE /vexa/bots/[platform]/[nativeMeetingId]              → stop_bot
//
// ── NOT HERE ON PURPOSE ─────────────────────────────────────────────────────
// Each of these rejects a workspace API key, is a human review step, or hands
// back a credential/bytes — so none gets a tool:
//   • POST /vexa/bots (send a recording bot). It needs a signed-in user (an API
//     key gets 401) and max-agent's own agent puts it behind a confirm card: a
//     bot joining a real call is the user's decision. /vexa/capture-identity
//     has the same signed-in-user requirement.
//   • POST feedback, feedback/ask-max, conversation-intelligence (analyze),
//     PATCH participants/[pid], coaching-library + conversation-configuration
//     writes: JWT-only / admin-only by design.
//   • share-link GET/POST: the returned token IS the public grant. Only the
//     revoke direction is exposed.
//   • note file upload/complete/download, recordings signed-url: binary flows.
//   • PATCH segments/[seq]: a length-1 batch — correct_transcript covers it.
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
//   • get_live_transcript and get_bot_transcript return a whole segment list
//     too, so they take the same window (offset/limit → transcriptWindow).
//   • correct_transcript's 201 echoes the ENTIRE new version; its segments are
//     dropped (segmentsOmitted) — the caller already knows what it wrote.

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
/** Add a manual meeting record (no provider call, no bot). */
const CAP_MEETINGS_CREATE = "meetings.create";
/** Add or delete a note on a meeting. */
const CAP_MEETINGS_NOTES_WRITE = "meetings.notes.write";
/** Correct transcript text — mints a new immutable version. */
const CAP_MEETINGS_TRANSCRIPT_CORRECT = "meetings.transcript.correct";
/** Re-run the summary against the current transcript. */
const CAP_MEETINGS_SUMMARY_REGENERATE = "meetings.summary.regenerate";
/** Turn a meeting's public share link off. */
const CAP_MEETINGS_SHARE_REVOKE = "meetings.share.revoke";
/** Read Vexa bot activity and provider transcripts. */
const CAP_VEXA_BOT_READ = "vexa.bot.read";
/** Pull a Vexa bot out of a live meeting. (Dispatch is "vexa.bot.dispatch" — no tool.) */
const CAP_VEXA_BOT_STOP = "vexa.bot.stop";

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
  const parsed = readJsonObject(result);
  if (!parsed) return null;
  const data = parsed.data;
  if (typeof data !== "object" || data === null) return null;
  return { parsed, data: data as Record<string, unknown> };
}

/** The JSON object body of a successful callApi result, or null. */
function readJsonObject(result: ToolResult): Record<string, unknown> | null {
  if (result.isError) return null;
  const text = result.content[0]?.text ?? "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  return parsed as Record<string, unknown>;
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

  const { windowed, transcriptWindow } = windowSegments(segments, offset, limit);
  return jsonResult({
    ...read.parsed,
    data: { ...read.data, segments: windowed },
    transcriptWindow,
  });
}

/**
 * get_bot_transcript: the Vexa proxy answers {segments} at the TOP level (no
 * data wrapper). Same window as get_transcript; anything else is untouched.
 */
function boundBotTranscript(
  result: ToolResult,
  offset: number | undefined,
  limit: number | undefined,
): ToolResult {
  const parsed = readJsonObject(result);
  if (!parsed || !Array.isArray(parsed.segments)) return result;

  const { windowed, transcriptWindow } = windowSegments(parsed.segments, offset, limit);
  return jsonResult({ ...parsed, segments: windowed, transcriptWindow });
}

/** One bounded slice of a segment list (default 50, max 200) + its window. */
function windowSegments(
  segments: unknown[],
  offset: number | undefined,
  limit: number | undefined,
): { windowed: unknown[]; transcriptWindow: Record<string, unknown> } {
  const total = segments.length;
  const start = Math.min(Math.max(offset ?? 0, 0), total);
  const size = Math.min(
    Math.max(limit ?? S.TRANSCRIPT_DEFAULT_SEGMENTS, 1),
    S.TRANSCRIPT_MAX_SEGMENTS,
  );
  const windowed = segments.slice(start, start + size);
  const end = start + windowed.length;
  const nextOffset = end < total ? end : null;

  return {
    windowed,
    transcriptWindow: {
      totalSegments: total,
      offset: start,
      limit: size,
      returnedSegments: windowed.length,
      nextOffset,
      truncated: nextOffset !== null || start > 0,
    },
  };
}

/**
 * correct_transcript's 201 echoes the WHOLE new version's segments. The caller
 * just wrote the changes, so drop the segments and keep the version metadata
 * (versionNumber is the next expected_version). Error results pass through.
 */
function omitWrittenSegments(result: ToolResult): ToolResult {
  const read = readDataObject(result);
  if (!read) return result;
  const segments = read.data.segments;
  if (!Array.isArray(segments) || segments.length === 0) return result;

  return jsonResult({
    ...read.parsed,
    data: { ...read.data, segments: [] },
    segmentsOmitted: {
      reason: "new version's segments omitted to control token cost — call get_transcript to read them.",
      segmentCount: segments.length,
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

  // ── calendar + conversation intelligence (reads) ──────────────────────────
  {
    action: "list_calendar",
    capability: CAP_MEETINGS_READ,
    title: "List synced calendar events",
    description:
      "List the user's synced calendar events (kind 'event') in a from/to startsAt window, deduped against meeting sessions (use list for those). Returns {data: CalendarItemDto[], nextCursor}; limit 1-250 (default 100). A page can be short after dedup — paginate until nextCursor is null.",
    inputShape: S.listCalendarSchema.shape,
    ...toolHints.readOnly,
    handler: (input) =>
      callApi(input.bearer_token as string | undefined, (t) =>
        repo.listCalendar(t, {
          from: input.from as string | undefined,
          to: input.to as string | undefined,
          limit: input.limit as number | undefined,
          cursor: input.cursor as string | undefined,
        }),
      ),
  },
  {
    action: "list_coaching_library",
    capability: CAP_MEETINGS_READ,
    title: "List coaching library",
    description:
      "List the workspace's team-visible coaching clips, newest first (max 100). Returns {data: [{meetingSessionId, meetingTitle, sequenceNumber, title, coachingNote, skillTag}]}.",
    inputShape: S.listCoachingLibrarySchema.shape,
    ...toolHints.readOnly,
    handler: (input) =>
      callApi(input.bearer_token as string | undefined, (t) => repo.listCoachingLibrary(t)),
  },
  {
    action: "get_conversation_config",
    capability: CAP_MEETINGS_READ,
    title: "Get conversation-intelligence setup",
    description:
      "Get the scorecards and keyword trackers meetings are analyzed against. Returns {data: {scorecards, trackers}}.",
    inputShape: S.getConversationConfigSchema.shape,
    ...toolHints.readOnly,
    handler: (input) =>
      callApi(input.bearer_token as string | undefined, (t) =>
        repo.getConversationConfiguration(t),
      ),
  },
  {
    action: "get_conversation_analysis",
    capability: CAP_MEETINGS_READ,
    title: "Get a meeting's conversation analysis",
    description:
      "Get a meeting's latest conversation analysis: talk ratios, questions, objections with evidence, next-step score, scorecard results, tracker hits, risk level and outlook. Returns {data: ConversationAnalysisDto | null}; null = never analyzed (only a signed-in user can run one), stale:true = transcript changed since.",
    inputShape: S.getConversationAnalysisSchema.shape,
    ...toolHints.readOnly,
    handler: (input) =>
      callApi(input.bearer_token as string | undefined, (t) =>
        repo.getConversationAnalysis(t, input.id as string),
      ),
  },
  {
    action: "list_feedback",
    capability: CAP_MEETINGS_READ,
    title: "List meeting feedback",
    description:
      "List a meeting's feedback from members and Max, newest first. Returns {data: [{category, rating (1-5|null), comment, authorType, authorUserId, createdAt}]}. Read-only: posting feedback is for signed-in users.",
    inputShape: S.listFeedbackSchema.shape,
    ...toolHints.readOnly,
    handler: (input) =>
      callApi(input.bearer_token as string | undefined, (t) =>
        repo.listFeedback(t, input.id as string),
      ),
  },
  {
    action: "get_live_transcript",
    capability: CAP_MEETINGS_READ,
    title: "Get a meeting's live transcript",
    description:
      "Read the transcript of a meeting still being captured. Returns {data: {live, segments, unavailable?}, transcriptWindow} — segments windowed like get_transcript. live:false means capture is over: use get_transcript. Poll no faster than every few seconds.",
    inputShape: S.getLiveTranscriptSchema.shape,
    ...toolHints.readOnly,
    handler: async (input) => {
      const result = await callApi(input.bearer_token as string | undefined, (t) =>
        repo.getLiveTranscript(t, input.id as string),
      );
      return boundTranscript(
        result,
        input.offset as number | undefined,
        input.limit as number | undefined,
      );
    },
  },

  // ── notes ─────────────────────────────────────────────────────────────────
  {
    action: "list_notes",
    capability: CAP_MEETINGS_READ,
    title: "List meeting notes",
    description:
      "List a meeting's notes, newest first (max 100). Returns {data: MeetingNoteDto[]}: typed notes carry body; file notes carry only fileName/mimeType/sizeBytes.",
    inputShape: S.listNotesSchema.shape,
    ...toolHints.readOnly,
    handler: (input) =>
      callApi(input.bearer_token as string | undefined, (t) =>
        repo.listNotes(t, input.id as string),
      ),
  },
  {
    action: "add_note",
    capability: CAP_MEETINGS_NOTES_WRITE,
    title: "Add a meeting note",
    description:
      "Add a typed text or markdown note to a meeting, authored as an observer. Returns {data: MeetingNoteDto}. 400 once the meeting holds 100 notes.",
    inputShape: S.addNoteSchema.shape,
    handler: (input) =>
      callApi(input.bearer_token as string | undefined, (t) =>
        repo.addNote(t, input.id as string, {
          body: input.body as string,
          format: input.format as string | undefined,
        }),
      ),
  },
  {
    action: "delete_note",
    capability: CAP_MEETINGS_NOTES_WRITE,
    title: "Delete a meeting note",
    description:
      "Permanently delete a note (and its stored file, if any) from a meeting. Returns {success: true}; 404 if the note is not on this meeting.",
    inputShape: S.deleteNoteSchema.shape,
    ...toolHints.destructive,
    handler: (input) =>
      callApi(input.bearer_token as string | undefined, (t) =>
        repo.deleteNote(t, input.id as string, input.note_id as string),
      ),
  },

  // ── transcript + summary writes ───────────────────────────────────────────
  {
    action: "correct_transcript",
    capability: CAP_MEETINGS_TRANSCRIPT_CORRECT,
    title: "Correct transcript segments",
    description:
      "Replace the text of one or more transcript segments, saved as ONE new immutable version (older versions stay readable) and the summary is re-queued. 409 version_conflict carries currentVersionNumber: re-read, re-apply, retry. Returns {data: version metadata, segmentCount, summaryRegenerationQueued} with segments omitted.",
    inputShape: S.correctTranscriptSchema.shape,
    handler: async (input) => {
      const changes = input.changes as Array<{ sequence_number: number; text: string }>;
      const result = await callApi(input.bearer_token as string | undefined, (t) =>
        repo.correctSegments(t, input.id as string, {
          expectedVersion: input.expected_version as number,
          changes: changes.map((c) => ({ sequenceNumber: c.sequence_number, text: c.text })),
          changeSummary: input.change_summary as string | undefined,
        }),
      );
      return omitWrittenSegments(result);
    },
  },
  {
    action: "regenerate_summary",
    capability: CAP_MEETINGS_SUMMARY_REGENERATE,
    title: "Regenerate a meeting summary",
    description:
      "Re-run the summary against the current transcript version, asynchronously. Returns {data: {stage, status, sourceTranscriptVersionNumber}} — poll get_summary. 409 no_transcript when there is nothing to summarize.",
    inputShape: S.regenerateSummarySchema.shape,
    handler: (input) =>
      callApi(input.bearer_token as string | undefined, (t) =>
        repo.regenerateSummary(t, input.id as string),
      ),
  },

  // ── meeting record ────────────────────────────────────────────────────────
  {
    action: "create",
    capability: CAP_MEETINGS_CREATE,
    title: "Add a manual meeting",
    description:
      "Add a manual meeting record (status 'scheduled') from title, started_at, ended_at and an optional meeting_url. Creates only the record: no invites, no bot, no capture. Returns {id}.",
    inputShape: S.createMeetingSchema.shape,
    handler: (input) =>
      callApi(input.bearer_token as string | undefined, (t) =>
        repo.createSession(t, {
          title: input.title as string,
          startedAt: input.started_at as string,
          endedAt: input.ended_at as string,
          meetingUrl: input.meeting_url as string | undefined,
        }),
      ),
  },
  {
    action: "disable_share_link",
    capability: CAP_MEETINGS_SHARE_REVOKE,
    title: "Disable a meeting's public link",
    description:
      "Turn off a meeting's public 'anyone with the link' share link. Returns {success: true}; 403 unless the key's owner owns the meeting or is an admin. Re-enabling is done in the app.",
    inputShape: S.disableShareLinkSchema.shape,
    ...toolHints.destructive,
    handler: (input) =>
      callApi(input.bearer_token as string | undefined, (t) =>
        repo.disableShareLink(t, input.id as string),
      ),
  },

  // ── Vexa recording bots ───────────────────────────────────────────────────
  // All return 409 when the workspace has no Vexa connection, 502 on a Vexa
  // failure. There is deliberately no send-bot action — see the file header.
  {
    action: "list_bots",
    capability: CAP_VEXA_BOT_READ,
    title: "List recording bots",
    description:
      "List the workspace's recent Vexa recording bots. Returns {bots: [{id, platform, native_meeting_id, status, start_time, end_time, completion_reason, failure_stage}]}. 409 when Vexa is not connected.",
    inputShape: S.listBotsSchema.shape,
    ...toolHints.readOnly,
    handler: (input) =>
      callApi(input.bearer_token as string | undefined, (t) => repo.listBotActivity(t)),
  },
  {
    action: "list_bot_meetings",
    capability: CAP_VEXA_BOT_READ,
    title: "List Vexa meetings",
    description:
      "List the meetings Vexa has for this workspace. Returns {meetings: [{id, platform, native_meeting_id, status, start_time, end_time}]}. list_bots carries more lifecycle detail.",
    inputShape: S.listBotMeetingsSchema.shape,
    ...toolHints.readOnly,
    handler: (input) =>
      callApi(input.bearer_token as string | undefined, (t) => repo.listBotMeetings(t)),
  },
  {
    action: "get_bot_transcript",
    capability: CAP_VEXA_BOT_READ,
    title: "Get a Vexa transcript",
    description:
      "Fetch Vexa's raw transcript by platform + native_meeting_id. Returns {segments: [{speaker, text, start, end}], transcriptWindow}, windowed like get_transcript. Prefer get_transcript (by session id) once the meeting is imported.",
    inputShape: S.getBotTranscriptSchema.shape,
    ...toolHints.readOnly,
    handler: async (input) => {
      const result = await callApi(input.bearer_token as string | undefined, (t) =>
        repo.getBotTranscript(t, input.platform as string, input.native_meeting_id as string),
      );
      return boundBotTranscript(
        result,
        input.offset as number | undefined,
        input.limit as number | undefined,
      );
    },
  },
  {
    action: "stop_bot",
    capability: CAP_VEXA_BOT_STOP,
    title: "Stop a recording bot",
    description:
      "Remove the Vexa recording bot from a live meeting: it leaves the call and capture stops. Irreversible for this call — sending a bot again is a signed-in user's action. Returns {stopped: true}.",
    inputShape: S.stopBotSchema.shape,
    ...toolHints.destructive,
    handler: (input) =>
      callApi(input.bearer_token as string | undefined, (t) =>
        repo.stopBot(t, input.platform as string, input.native_meeting_id as string),
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
    "Read and annotate the workspace's meetings (meeting hub), and read or stop its Vexa recording bots. The workspace comes from your bearer token — prospect_id filters within it.",
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

import { apiUrl, authHeaders, buildQuery, fetchWithRetry } from "../shared";

/**
 * Query params for GET /api/v1/meeting-hub/sessions. camelCase because that is
 * what max-agent's handler parses; the tool layer takes snake_case args and
 * maps them here.
 *
 * There is no workspaceId field, deliberately: max-agent derives the workspace
 * from the bearer and ignores anything a caller sends. See schema.ts.
 */
export type ListSessionsParams = {
  /** Filter WITHIN the authenticated workspace — never a tenant selector. */
  prospectId?: string;
  status?: string;
  search?: string;
  from?: string;
  to?: string;
  limit?: number;
  cursor?: string;
};

/**
 * GET /api/v1/meeting-hub/sessions — the meetings list and the prospect meeting
 * feed (?prospectId=…).
 *
 * 200 → { data: MeetingSessionSummaryDto[], nextCursor: string | null }
 * 400 → { error: "Invalid query parameters", details: [...] }
 *
 * Keyset pagination: echo `nextCursor` back as `cursor`; null means last page.
 */
export async function listSessions(
  token: string,
  params: ListSessionsParams = {},
): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/meeting-hub/sessions${buildQuery(params)}`), {
    headers: authHeaders(token),
  });
}

/**
 * GET /api/v1/meeting-hub/sessions/:id — one meeting in full.
 *
 * 200 → { data: MeetingSessionDetailDto } | 404 → { error: "Session not found" }
 *
 * A session in another workspace reads back as 404, never 403.
 */
export async function getSession(token: string, id: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/meeting-hub/sessions/${id}`), {
    headers: authHeaders(token),
  });
}

/**
 * GET /api/v1/meeting-hub/sessions/:id/transcript[?version=N] — one transcript
 * version (the current one by default; any historical number on request).
 *
 * 200 → { data: TranscriptVersionDto } | 400 invalid version | 404 not found.
 *
 * The response carries the WHOLE version's segments; the tool layer windows
 * them for token control (this route has no paging of its own).
 */
export async function getTranscript(
  token: string,
  id: string,
  version?: number,
): Promise<Response> {
  const qs = buildQuery({ version });
  return fetchWithRetry(
    apiUrl(`/api/v1/meeting-hub/sessions/${id}/transcript${qs}`),
    { headers: authHeaders(token) },
  );
}

/**
 * GET /api/v1/meeting-hub/sessions/:id/summary — the current summary.
 *
 * 200 → { data: MeetingSummaryDto } | 200 → { data: null } (no summary yet) |
 * 404 → { error: "Session not found" }.
 *
 * `data: null` (200) is "still processing / no summary", which is deliberately
 * distinct from 404 "no such meeting".
 */
export async function getSummary(token: string, id: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/meeting-hub/sessions/${id}/summary`), {
    headers: authHeaders(token),
  });
}

/**
 * GET /api/v1/meeting-hub/sessions/:id/participants — the meeting roster.
 *
 * 200 → { data: MeetingParticipantDto[] } | 404 → { error: "Session not found" }.
 *
 * Unpaginated by design upstream: bounded by the size of a meeting, not by
 * time.
 */
export async function listParticipants(
  token: string,
  id: string,
): Promise<Response> {
  return fetchWithRetry(
    apiUrl(`/api/v1/meeting-hub/sessions/${id}/participants`),
    { headers: authHeaders(token) },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Everything below extends the meeting hub past the five reads above: the
// calendar grid, conversation intelligence reads, feedback, the live
// transcript, notes, transcript correction, summary regeneration, manual
// meeting creation, share-link revocation, and the Vexa bot proxy routes.
//
// Only routes that accept a workspace API key are wrapped. What is missing on
// purpose (POST /vexa/bots, feedback/analysis/participant writes, share-link
// create/read, note file uploads) is listed in tools.ts.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Non-idempotent writes: a retry after a 504 that actually committed would
 * create a second meeting / note, or run a segment batch into its own 409.
 */
const NO_RETRY = { maxRetries: 0 };

/** Query params for GET /api/v1/meeting-hub/calendar (camelCase upstream). */
export type ListCalendarParams = {
  from?: string;
  to?: string;
  limit?: number;
  cursor?: string;
};

/**
 * GET /api/v1/meeting-hub/calendar — synced calendar events (kind:"event"),
 * deduped against sessions.
 *
 * 200 → { data: CalendarItemDto[], nextCursor: string | null }
 */
export async function listCalendar(
  token: string,
  params: ListCalendarParams = {},
): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/meeting-hub/calendar${buildQuery(params)}`), {
    headers: authHeaders(token),
  });
}

/**
 * GET /api/v1/meeting-hub/coaching-library — team-visible coaching clips (an
 * API key never sees the managers-only ones). 200 → { data: CoachingItemDto[] }.
 */
export async function listCoachingLibrary(token: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/meeting-hub/coaching-library`), {
    headers: authHeaders(token),
  });
}

/**
 * GET /api/v1/meeting-hub/conversation-configuration —
 * 200 → { data: { scorecards, trackers } }.
 */
export async function getConversationConfiguration(token: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/meeting-hub/conversation-configuration`), {
    headers: authHeaders(token),
  });
}

/**
 * GET /api/v1/meeting-hub/sessions/:id/conversation-intelligence — the latest
 * stored analysis. 200 → { data: ConversationAnalysisDto | null } | 404.
 */
export async function getConversationAnalysis(
  token: string,
  id: string,
): Promise<Response> {
  return fetchWithRetry(
    apiUrl(`/api/v1/meeting-hub/sessions/${id}/conversation-intelligence`),
    { headers: authHeaders(token) },
  );
}

/**
 * GET /api/v1/meeting-hub/sessions/:id/feedback —
 * 200 → { data: MeetingFeedbackDto[] } | 404.
 */
export async function listFeedback(token: string, id: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/meeting-hub/sessions/${id}/feedback`), {
    headers: authHeaders(token),
  });
}

/**
 * GET /api/v1/meeting-hub/sessions/:id/live-transcript — the transcript as it
 * is being spoken. 200 → { data: { live, segments, unavailable? } } | 404.
 *
 * Like /transcript, the WHOLE segment list comes back; the tool windows it.
 */
export async function getLiveTranscript(token: string, id: string): Promise<Response> {
  return fetchWithRetry(
    apiUrl(`/api/v1/meeting-hub/sessions/${id}/live-transcript`),
    { headers: authHeaders(token) },
  );
}

/** GET /api/v1/meeting-hub/sessions/:id/notes — 200 → { data: MeetingNoteDto[] }. */
export async function listNotes(token: string, id: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/meeting-hub/sessions/${id}/notes`), {
    headers: authHeaders(token),
  });
}

/**
 * POST /api/v1/meeting-hub/sessions/:id/notes (application/json) — a typed
 * note. The multipart file path is not wrapped. 201 → { data: MeetingNoteDto }.
 */
export async function addNote(
  token: string,
  id: string,
  body: { body: string; format?: string },
): Promise<Response> {
  return fetchWithRetry(
    apiUrl(`/api/v1/meeting-hub/sessions/${id}/notes`),
    { method: "POST", headers: authHeaders(token), body: JSON.stringify(body) },
    NO_RETRY,
  );
}

/**
 * DELETE /api/v1/meeting-hub/sessions/:id/notes/:noteId — removes the row and
 * its stored file, if any. 200 → { success: true } | 404.
 */
export async function deleteNote(
  token: string,
  id: string,
  noteId: string,
): Promise<Response> {
  return fetchWithRetry(
    apiUrl(`/api/v1/meeting-hub/sessions/${id}/notes/${noteId}`),
    { method: "DELETE", headers: authHeaders(token) },
  );
}

/** Body of PATCH /sessions/:id/segments — camelCase, as the handler parses it. */
export type CorrectSegmentsBody = {
  expectedVersion: number;
  changes: Array<{ sequenceNumber: number; text: string }>;
  changeSummary?: string;
};

/**
 * PATCH /api/v1/meeting-hub/sessions/:id/segments — one batch ⇒ one new
 * immutable transcript version.
 *
 * 201 → { data: TranscriptVersionDto, segmentCount, summaryRegenerationQueued }
 * 409 → { code: "version_conflict", currentVersionNumber, ... } | 404 | 400.
 *
 * No retries: a retried batch that had committed would 409 against itself.
 */
export async function correctSegments(
  token: string,
  id: string,
  body: CorrectSegmentsBody,
): Promise<Response> {
  return fetchWithRetry(
    apiUrl(`/api/v1/meeting-hub/sessions/${id}/segments`),
    { method: "PATCH", headers: authHeaders(token), body: JSON.stringify(body) },
    NO_RETRY,
  );
}

/**
 * POST /api/v1/meeting-hub/sessions/:id/summary/regenerate — re-opens the
 * generate_summary stage against the CURRENT transcript version (async).
 *
 * 202 → { data: { stage, status, sourceTranscriptVersionId,
 *                 sourceTranscriptVersionNumber } } | 404 | 409.
 *
 * Retry-safe: a requeue of an already-requeued stage is the same end state.
 */
export async function regenerateSummary(token: string, id: string): Promise<Response> {
  return fetchWithRetry(
    apiUrl(`/api/v1/meeting-hub/sessions/${id}/summary/regenerate`),
    { method: "POST", headers: authHeaders(token) },
  );
}

/** Body of POST /api/v1/meeting-hub/sessions (the handler's schema is .strict()). */
export type CreateSessionBody = {
  title: string;
  startedAt: string;
  endedAt: string;
  meetingUrl?: string;
};

/**
 * POST /api/v1/meeting-hub/sessions — a manual meeting record (status
 * 'scheduled'). No provider call, invitation or capture job.
 *
 * 201 → { id } | 400.
 */
export async function createSession(
  token: string,
  body: CreateSessionBody,
): Promise<Response> {
  return fetchWithRetry(
    apiUrl(`/api/v1/meeting-hub/sessions`),
    { method: "POST", headers: authHeaders(token), body: JSON.stringify(body) },
    NO_RETRY,
  );
}

/**
 * DELETE /api/v1/meeting-hub/sessions/:id/share-link — turn public link
 * sharing off (the token is kept upstream so the app can re-enable the same
 * URL). 200 → { success: true } | 403 (not owner/admin) | 404.
 */
export async function disableShareLink(token: string, id: string): Promise<Response> {
  return fetchWithRetry(
    apiUrl(`/api/v1/meeting-hub/sessions/${id}/share-link`),
    { method: "DELETE", headers: authHeaders(token) },
  );
}

// ── Vexa bot proxy (/api/v1/vexa/*) ──────────────────────────────────────────
// Every route here returns 409 when the workspace has no Vexa connection and
// 502 on a Vexa upstream failure.

/** GET /api/v1/vexa/bots/activity — 200 → { bots: VexaBotActivity[] }. */
export async function listBotActivity(token: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/vexa/bots/activity`), {
    headers: authHeaders(token),
  });
}

/** GET /api/v1/vexa/meetings — 200 → { meetings: VexaMeeting[] }. */
export async function listBotMeetings(token: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/vexa/meetings`), {
    headers: authHeaders(token),
  });
}

/**
 * GET /api/v1/vexa/transcripts/:platform/:nativeMeetingId —
 * 200 → { segments: [{ speaker, text, start, end }] } (whole list; the tool
 * windows it).
 */
export async function getBotTranscript(
  token: string,
  platform: string,
  nativeMeetingId: string,
): Promise<Response> {
  return fetchWithRetry(
    apiUrl(
      `/api/v1/vexa/transcripts/${encodeURIComponent(platform)}/${encodeURIComponent(nativeMeetingId)}`,
    ),
    { headers: authHeaders(token) },
  );
}

/**
 * DELETE /api/v1/vexa/bots/:platform/:nativeMeetingId — the bot leaves the
 * call. 200 → { stopped: true }.
 */
export async function stopBot(
  token: string,
  platform: string,
  nativeMeetingId: string,
): Promise<Response> {
  return fetchWithRetry(
    apiUrl(
      `/api/v1/vexa/bots/${encodeURIComponent(platform)}/${encodeURIComponent(nativeMeetingId)}`,
    ),
    { method: "DELETE", headers: authHeaders(token) },
  );
}

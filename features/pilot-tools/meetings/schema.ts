import { z } from "zod";
import { withToken } from "../shared";

/**
 * USER-FACING meeting status. Mirrors `MeetingSessionStatus` in max-agent's
 * frozen contract (src/features/meeting-hub/meeting-hub.types.ts) — per-stage
 * truth lives in processing jobs, not here.
 */
export const MEETING_SESSION_STATUSES = [
  "scheduled",
  "capturing",
  "processing",
  "ready",
  "cancelled",
  "failed",
  "archived",
] as const;

/**
 * Filters for GET /api/v1/meeting-hub/sessions.
 *
 * TENANCY — the reason there is no workspace argument anywhere in this file:
 * the workspace is derived from the bearer token by max-agent's auth gate and
 * is never read from a query param. A `workspace_id` / `tenant_id` tool arg
 * would hand a caller a tenant selector, so it does not exist. `prospect_id`
 * is a FILTER INSIDE the authenticated workspace — it narrows, it never
 * selects a tenant.
 */
const listFilters = {
  status: z
    .enum(MEETING_SESSION_STATUSES)
    .optional()
    .describe("Filter by user-facing meeting status."),
  search: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe("Free-text search over meeting titles."),
  from: z
    .string()
    .datetime()
    .optional()
    .describe(
      "Only meetings with startedAt >= this ISO8601 UTC time (e.g. 2026-07-01T00:00:00Z).",
    ),
  to: z
    .string()
    .datetime()
    .optional()
    .describe("Only meetings with startedAt <= this ISO8601 UTC time."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Page size, 1-100 (default 50)."),
  cursor: z
    .string()
    .max(500)
    .optional()
    .describe(
      "Opaque keyset cursor. Omit for the first page, then echo back the previous page's nextCursor. A null nextCursor means you have reached the last page.",
    ),
};

export const listMeetingsSchema = z.object({
  ...withToken,
  prospect_id: z
    .string()
    .uuid()
    .optional()
    .describe(
      "Only meetings involving this prospect. A filter within your own workspace — not a tenant selector.",
    ),
  ...listFilters,
});

export const prospectListMeetingsSchema = z.object({
  ...withToken,
  prospect_id: z
    .string()
    .uuid()
    .describe("Prospect UUID whose meeting feed to read."),
  ...listFilters,
});

// ── single-meeting reads ─────────────────────────────────────────────────────
//
// All four take a session `id` and nothing that could select a tenant — the
// workspace is derived from the bearer, and a session in another workspace
// reads back as 404 (never 403, which would confirm the id exists).

export const getMeetingSchema = z.object({
  ...withToken,
  id: z.string().uuid().describe("Meeting session UUID."),
});

/**
 * Segment-window bounds for get_transcript.
 *
 * A transcript version is one flat list of segments — a long meeting is
 * thousands of them, tens of thousands of tokens. The upstream route has no
 * paging of its own (it returns the whole version), so the tool windows the
 * segments client-side: a bounded slice by default, paged with offset +
 * nextOffset. These live here (not tools.ts) so the schema can reference the
 * max without a tools→schema→tools import cycle.
 */
export const TRANSCRIPT_DEFAULT_SEGMENTS = 50;
export const TRANSCRIPT_MAX_SEGMENTS = 200;

export const getTranscriptSchema = z.object({
  ...withToken,
  id: z.string().uuid().describe("Meeting session UUID."),
  version: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      "Transcript version number. Omit for the current (authoritative) version; pass N for a historical one — the raw v1 stays addressable forever.",
    ),
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe(
      "Segment window start (default 0). The transcript is returned in bounded segment windows to control token cost — page through with offset plus the returned transcriptWindow.nextOffset.",
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(TRANSCRIPT_MAX_SEGMENTS)
    .optional()
    .describe(
      `Segments per window, 1-${TRANSCRIPT_MAX_SEGMENTS} (default ${TRANSCRIPT_DEFAULT_SEGMENTS}). Prefer get_summary for a token-cheap overview; only page the raw transcript when you need the exact words.`,
    ),
});

export const getSummarySchema = z.object({
  ...withToken,
  id: z.string().uuid().describe("Meeting session UUID."),
});

export const listParticipantsSchema = z.object({
  ...withToken,
  id: z.string().uuid().describe("Meeting session UUID."),
});

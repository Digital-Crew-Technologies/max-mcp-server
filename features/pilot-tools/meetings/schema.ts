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

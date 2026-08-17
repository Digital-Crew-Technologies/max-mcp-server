import { z } from "zod";
import { withToken } from "../shared";

/**
 * Mirrors of max-agent's activity enums
 * (src/features/activities/constants.ts).
 */
export const ACTIVITY_TYPES = [
  "note",
  "call",
  "email",
  "linkedin",
  "whatsapp",
  "meeting",
  "task",
  "stage_change",
  "system",
] as const;
export const CALL_DIRECTIONS = ["outbound", "inbound"] as const;
export const CALL_OUTCOMES = [
  "connected",
  "voicemail",
  "no_answer",
  "wrong_number",
] as const;

/**
 * TENANCY — no workspace argument anywhere in this file: the workspace is
 * derived from the bearer token by max-agent's auth gate. prospect_id /
 * organization_id / deal_id are FILTERS AND TARGETS INSIDE the authenticated
 * workspace — they narrow, they never select a tenant.
 */

/** Where an activity attaches. At least one is required upstream (400 otherwise). */
const entityLinks = {
  prospect_id: z
    .string()
    .uuid()
    .optional()
    .describe("Prospect this activity belongs to."),
  organization_id: z
    .string()
    .uuid()
    .optional()
    .describe("Company this activity belongs to."),
  deal_id: z.string().uuid().optional().describe("Deal this activity belongs to."),
};

export const listActivitiesSchema = z.object({
  ...withToken,
  ...entityLinks,
  type: z
    .enum(ACTIVITY_TYPES)
    .optional()
    .describe("Only activities of this type."),
  page: z.number().int().min(1).optional().describe("Page number (default 1)."),
  page_size: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Page size, 1-100 (default 30)."),
});

export const createNoteSchema = z.object({
  ...withToken,
  ...entityLinks,
  body: z.string().min(1).max(50000).describe("The note text (plain text)."),
  subject: z
    .string()
    .max(200)
    .optional()
    .describe("Optional short subject line."),
});

export const logCallSchema = z.object({
  ...withToken,
  ...entityLinks,
  outcome: z
    .enum(CALL_OUTCOMES)
    .describe("How the call ended: connected, voicemail, no_answer, wrong_number."),
  direction: z
    .enum(CALL_DIRECTIONS)
    .optional()
    .describe("outbound (default) or inbound."),
  duration_seconds: z
    .number()
    .int()
    .min(0)
    .max(86400)
    .optional()
    .describe("Call length in seconds."),
  body: z.string().max(20000).optional().describe("Call notes (plain text)."),
  occurred_at: z
    .string()
    .datetime({ offset: true })
    .optional()
    .describe(
      "When the call happened, ISO8601 with offset (default: now). Backdating keeps the timeline honest.",
    ),
});

export const updateNoteSchema = z.object({
  ...withToken,
  id: z.string().uuid().describe("Activity UUID."),
  body: z
    .string()
    .min(1)
    .max(50000)
    .optional()
    .describe("New note text (notes only)."),
  subject: z
    .string()
    .max(200)
    .nullable()
    .optional()
    .describe("New subject line (notes only). null clears it."),
  is_pinned: z
    .boolean()
    .optional()
    .describe("Pin or unpin the activity (any type). Pinned items sort first."),
});

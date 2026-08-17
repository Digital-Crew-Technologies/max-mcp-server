import { z } from "zod";
import { withToken } from "../shared";

/**
 * Mirrors of max-agent's deal enums (src/features/deals/constants.ts).
 * Kept small and stable — a drift here fails loudly upstream (400), never
 * silently.
 */
export const DEAL_STATUSES = ["open", "won", "lost"] as const;
export const DEAL_SORT_FIELDS = [
  "created_at",
  "updated_at",
  "close_date",
  "amount",
  "name",
] as const;

/**
 * TENANCY — the reason there is no workspace argument anywhere in this file:
 * the workspace is derived from the bearer token by max-agent's auth gate and
 * is never read from a query param. Every id below (pipeline_id, stage_id,
 * organization_id, prospect_id, owner_id) is a FILTER OR TARGET INSIDE the
 * authenticated workspace — it narrows, it never selects a tenant.
 */

const dealFields = {
  name: z.string().min(1).max(200).describe("Deal name."),
  amount: z
    .number()
    .nonnegative()
    .nullable()
    .optional()
    .describe("Deal value in the deal's currency. null clears it."),
  currency: z
    .string()
    .length(3)
    .optional()
    .describe("ISO 4217 alpha-3 currency code (e.g. EUR, USD). Per-deal."),
  close_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional()
    .describe("Expected close date, ISO date (YYYY-MM-DD). null clears it."),
  probability: z
    .number()
    .min(0)
    .max(100)
    .nullable()
    .optional()
    .describe(
      "Win probability override, 0-100. Omit to inherit the stage's default; null reverts to inheriting.",
    ),
  owner_id: z
    .string()
    .uuid()
    .nullable()
    .optional()
    .describe("Owning workspace member's user UUID. null unassigns."),
  organization_id: z
    .string()
    .uuid()
    .nullable()
    .optional()
    .describe("Company this deal is with. null detaches."),
  description: z
    .string()
    .max(20000)
    .nullable()
    .optional()
    .describe("Free-text description."),
  custom_fields: z
    .record(z.unknown())
    .optional()
    .describe(
      "Workspace custom-field values keyed by field key. Validated against the registry (see list_custom_fields); unknown keys or wrong types are a 400. Merged on update — send only the keys you change, null deletes a key.",
    ),
};

export const listDealsSchema = z.object({
  ...withToken,
  pipeline_id: z
    .string()
    .uuid()
    .optional()
    .describe("Only deals on this pipeline (board)."),
  stage_id: z.string().uuid().optional().describe("Only deals in this stage."),
  status: z
    .enum(DEAL_STATUSES)
    .optional()
    .describe("Only deals with this status (open, won, lost)."),
  owner_id: z
    .string()
    .uuid()
    .optional()
    .describe("Only deals owned by this workspace member."),
  organization_id: z
    .string()
    .uuid()
    .optional()
    .describe("Only deals attached to this company."),
  prospect_id: z
    .string()
    .uuid()
    .optional()
    .describe(
      "Only deals this prospect is a contact on. A filter within your own workspace — not a tenant selector.",
    ),
  search: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe("Free-text search over deal names."),
  page: z.number().int().min(1).optional().describe("Page number (default 1)."),
  page_size: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Page size, 1-100 (default 20)."),
  sort_by: z
    .enum(DEAL_SORT_FIELDS)
    .optional()
    .describe("Sort field (default updated_at)."),
  sort_order: z
    .enum(["asc", "desc"])
    .optional()
    .describe("Sort direction (default desc)."),
});

export const getDealSchema = z.object({
  ...withToken,
  id: z.string().uuid().describe("Deal UUID."),
});

export const createDealSchema = z.object({
  ...withToken,
  ...dealFields,
  pipeline_id: z
    .string()
    .uuid()
    .optional()
    .describe(
      "Pipeline to create the deal on. Omit for the workspace's default pipeline (seeded on first use).",
    ),
  stage_id: z
    .string()
    .uuid()
    .optional()
    .describe(
      "Stage to create the deal in. Omit for the pipeline's first open column.",
    ),
  prospect_ids: z
    .array(z.string().uuid())
    .max(50)
    .optional()
    .describe(
      "Prospects to associate as deal contacts at creation; the first becomes the primary contact.",
    ),
});

export const updateDealSchema = z.object({
  ...withToken,
  id: z.string().uuid().describe("Deal UUID."),
  ...dealFields,
  name: dealFields.name.optional().describe("New deal name."),
  lost_reason: z
    .string()
    .max(1000)
    .nullable()
    .optional()
    .describe("Why the deal was lost (usually set via the lose action)."),
});

export const moveDealStageSchema = z.object({
  ...withToken,
  id: z.string().uuid().describe("Deal UUID."),
  stage_id: z
    .string()
    .uuid()
    .describe(
      "Destination stage UUID (same or different pipeline — a cross-pipeline move re-homes the deal).",
    ),
});

export const winDealSchema = z.object({
  ...withToken,
  id: z.string().uuid().describe("Deal UUID."),
});

export const loseDealSchema = z.object({
  ...withToken,
  id: z.string().uuid().describe("Deal UUID."),
  lost_reason: z
    .string()
    .max(1000)
    .optional()
    .describe("Why the deal was lost."),
});

export const listDealStageEventsSchema = z.object({
  ...withToken,
  id: z.string().uuid().describe("Deal UUID."),
});

export const addDealContactSchema = z.object({
  ...withToken,
  id: z.string().uuid().describe("Deal UUID."),
  prospect_id: z.string().uuid().describe("Prospect UUID to associate."),
  role: z
    .string()
    .max(100)
    .nullable()
    .optional()
    .describe('Free-text role on the deal (e.g. "Decision maker").'),
  is_primary: z
    .boolean()
    .optional()
    .describe("Make this the deal's primary contact."),
});

export const removeDealContactSchema = z.object({
  ...withToken,
  id: z.string().uuid().describe("Deal UUID."),
  prospect_id: z.string().uuid().describe("Prospect UUID to disassociate."),
});

export const dealBoardTotalsSchema = z.object({
  ...withToken,
  pipeline_id: z.string().uuid().describe("Pipeline (board) UUID."),
});

export const listDealPipelinesSchema = z.object({
  ...withToken,
  include_archived: z
    .boolean()
    .optional()
    .describe("Also return archived pipelines (default false)."),
});

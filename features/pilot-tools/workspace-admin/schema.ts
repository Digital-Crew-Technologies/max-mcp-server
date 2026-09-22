import { z } from "zod";
import { withToken } from "../shared";

// Mirrors the query/body contracts of the max-agent handlers wrapped in
// ./repository.ts. Tools with no arguments still take the optional bearer.

export const noArgsSchema = z.object({ ...withToken });

const provider = z
  .enum(["getleads", "explorium", "apollo"])
  .describe("Data supplier: getleads, explorium or apollo.");

export const listCustomFieldsSchema = z.object({
  ...withToken,
  entity_type: z
    .enum(["prospect", "organization", "deal"])
    .optional()
    .describe("Only fields for this record type (default all)."),
  includeArchived: z.boolean().optional().describe("Include archived fields."),
});

export const updateDataSupplierSchema = z.object({
  ...withToken,
  provider,
  enabled: z.boolean().optional().describe("Turn the connected supplier on or off."),
  config: z
    .record(z.unknown())
    .optional()
    .describe("Saved default advanced search filters for this supplier (replaces the stored config)."),
});

export const disconnectDataSupplierSchema = z.object({ ...withToken, provider });

export const listDuplicatesSchema = z.object({
  ...withToken,
  entity_type: z
    .enum(["prospect", "organization"])
    .optional()
    .describe("Which records to list duplicate pairs for (default prospect)."),
});

export const dismissDuplicateSchema = z.object({
  ...withToken,
  pair_id: z.string().uuid().describe("Duplicate pair UUID (from list_duplicate_records)."),
});

export const listWalletConsumptionSchema = z.object({
  ...withToken,
  since: z
    .string()
    .datetime({ offset: true })
    .optional()
    .describe("ISO 8601 timestamp; only count spend from this point on."),
});

export const listAgentSessionsSchema = z.object({
  ...withToken,
  limit: z.number().int().min(1).max(100).optional().describe("Max threads (default 30, max 100)."),
  surface: z
    .enum([
      "max_chat",
      "page_navigator",
      "onboarding_chat",
      "campaign_writer",
      "talk_search",
      "reply_suggestions",
      "inbox_reply",
      "meetings",
      "action_prefill",
    ])
    .optional()
    .describe("Chat surface (default max_chat)."),
});

export const getAgentSessionMessagesSchema = z.object({
  ...withToken,
  session_id: z.string().uuid().describe("Chat thread UUID (from list_agent_sessions)."),
});

import { z } from "zod";
import { withToken } from "../shared";

export const crmSearchContactsSchema = z.object({
  ...withToken,
  query: z
    .string()
    .min(1)
    .describe("Free-text search over CRM contacts (name, email, company)."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Max results to return (default 20)."),
});

export const crmGetContactSchema = z.object({
  ...withToken,
  email: z
    .string()
    .email()
    .describe("Email of the contact to fetch (the dedup identity)."),
});

export const crmUpsertContactSchema = z.object({
  ...withToken,
  email: z
    .string()
    .email()
    .describe("Contact email — the dedup key. An existing contact is updated, never duplicated."),
  firstName: z.string().optional().describe("First name."),
  lastName: z.string().optional().describe("Last name."),
  company: z.string().optional().describe("Company name."),
  jobTitle: z.string().optional().describe("Job title."),
  phone: z.string().optional().describe("Phone number."),
});

export const crmUpsertCompanySchema = z.object({
  ...withToken,
  domain: z
    .string()
    .min(1)
    .describe("Company domain (e.g. acme.com) — the dedup key. Existing company is updated, never duplicated."),
  name: z.string().optional().describe("Company name."),
});

export const crmStatusSchema = z.object({
  ...withToken,
});

// ── Super-BJ deal / activity / owner / stage reads ──────────────────────────

export const crmListDealsSchema = z.object({
  ...withToken,
  stageId: z
    .string()
    .optional()
    .describe("Filter to deals in this pipeline stage id (HubSpot dealstage)."),
  ownerId: z
    .string()
    .optional()
    .describe("Filter to deals owned by this HubSpot owner id."),
  pipelineId: z
    .string()
    .optional()
    .describe("Filter to deals in this pipeline id."),
  amountMin: z
    .number()
    .optional()
    .describe("Minimum deal amount (inclusive)."),
  amountMax: z
    .number()
    .optional()
    .describe("Maximum deal amount (inclusive)."),
  closeDateAfter: z
    .string()
    .optional()
    .describe("Only deals with closeDate on/after this ISO date (YYYY-MM-DD or ISO timestamp)."),
  closeDateBefore: z
    .string()
    .optional()
    .describe("Only deals with closeDate on/before this ISO date."),
  modifiedAfter: z
    .string()
    .optional()
    .describe("Only deals modified on/after this ISO timestamp."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(200)
    .optional()
    .describe("Max deals to return (default 50)."),
});

export const crmGetDealSchema = z.object({
  ...withToken,
  id: z
    .string()
    .min(1)
    .describe("HubSpot deal id to fetch (returns full deal + associations)."),
});

export const crmActivityType = z.enum(["call", "email", "meeting", "note", "task"]);

export const crmListActivitiesSchema = z.object({
  ...withToken,
  dealId: z
    .string()
    .optional()
    .describe("Filter activities associated with this deal id."),
  contactId: z
    .string()
    .optional()
    .describe("Filter activities associated with this contact id."),
  ownerId: z
    .string()
    .optional()
    .describe("Filter activities owned by this HubSpot owner id."),
  types: z
    .array(crmActivityType)
    .optional()
    .describe("Engagement types to include (call/email/meeting/note/task). Defaults to all."),
  since: z
    .string()
    .optional()
    .describe("Only activities with timestamp on/after this ISO timestamp."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(200)
    .optional()
    .describe("Max activities to return after merge (default 50)."),
});

export const crmListOwnersSchema = z.object({
  ...withToken,
});

export const crmListPipelineStagesSchema = z.object({
  ...withToken,
  pipelineId: z
    .string()
    .optional()
    .describe("Restrict stages to this deal pipeline id. Omit for all pipelines."),
});

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

// ── the assistant deal / activity / owner / stage reads ──────────────────────────

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

// ── Composite workflow tools (Task D2) ──────────────────────────────────────

export const crmPipelineRiskScanSchema = z.object({
  ...withToken,
  window_days: z
    .number()
    .int()
    .min(1)
    .max(365)
    .optional()
    .describe("Activity look-back window in days for the high-value-low-activity signal (default 30)."),
  owner_id: z
    .string()
    .optional()
    .describe("Restrict the scan to deals/activities owned by this HubSpot owner id."),
});

export const crmWeeklyBriefComposeSchema = z.object({
  ...withToken,
  week_ending: z
    .string()
    .optional()
    .describe("ISO date the brief covers up to (YYYY-MM-DD). Defaults to the most recent Sunday."),
  owner_id: z
    .string()
    .optional()
    .describe("Restrict the brief to one HubSpot owner id. Omit for the whole team."),
});

// ── Forecast change detection (the assistant Task M-F1) ──────────────────────────

export const crmDetectForecastChangesSchema = z.object({
  ...withToken,
  window_days: z
    .number()
    .int()
    .min(1)
    .max(90)
    .default(7)
    .describe(
      "Look-back window in days — the comparison baseline is the snapshot AT OR BEFORE now() − window_days. Default 7.",
    ),
  owner_id: z
    .string()
    .optional()
    .describe("Restrict to deals owned by this HubSpot owner id. Omit for the whole team."),
  min_amount_delta_pct: z
    .number()
    .default(10)
    .describe(
      "Threshold for flagging an amount change — abs(delta_pct) must exceed this to be flagged. Default 10 (10%).",
    ),
  min_close_date_slip_days: z
    .number()
    .int()
    .default(7)
    .describe(
      "Threshold for flagging a close-date slip — current close_date must be at least this many days AFTER the prior close_date. Default 7.",
    ),
});

// ── Lead Dispatch (Task B2) ─────────────────────────────────────────────────

export const prospectSchema = z.object({
  id: z.string().optional().describe("Optional caller-supplied prospect id (used as the result key when present)."),
  email: z.string().optional().describe("Prospect email (used as the result key when id is absent; also the dedup identity for CSV export)."),
  firstName: z.string().optional().describe("First name."),
  lastName: z.string().optional().describe("Last name."),
  jobTitle: z.string().optional().describe("Job title — matched against ICP title_keywords (case-insensitive substring)."),
  company: z.string().optional().describe("Company name."),
  companyDomain: z.string().optional().describe("Company domain (e.g. acme.com)."),
  country: z.string().optional().describe("Country — matched against ICP countries / assignment rule country list."),
  industry: z.string().optional().describe("Industry — matched against ICP industries / assignment rule industry list."),
  employeeCount: z.number().optional().describe("Employee count — matched against ICP employee_min/employee_max range."),
  score: z.number().optional().describe("Optional precomputed score (0–100); drives assignment priority when present."),
});

export const crmScoreProspectsSchema = z.object({
  ...withToken,
  prospects: z
    .array(prospectSchema)
    .min(1)
    .describe("Prospects to score against the workspace ICP rules (agent_settings.icp_rules)."),
});

const assignmentRuleSchema = z.object({
  if: z
    .object({
      country: z.array(z.string()).optional().describe("Match if prospect.country is in this list."),
      industry: z.array(z.string()).optional().describe("Match if prospect.industry is in this list."),
      product: z.string().optional().describe("Optional product tag (informational; not matched against prospect fields)."),
    })
    .optional()
    .describe("Conditions; all present conditions must match. Omit for a catch-all rule."),
  assign_to_owner_id: z.string().describe("HubSpot owner id to assign matching prospects to."),
});

export const crmAssignProspectsSchema = z.object({
  ...withToken,
  prospects: z
    .array(prospectSchema)
    .min(1)
    .describe("Prospects to assign to owners. Include `score` to drive priority."),
  assignment_rules_override: z
    .array(assignmentRuleSchema)
    .optional()
    .describe("Override agent_settings.assignment_rules for this call. First matching rule wins."),
});

export const crmExportImportCsvSchema = z.object({
  ...withToken,
  prospects: z
    .array(prospectSchema)
    .min(1)
    .describe("Prospects to export as a HubSpot-import CSV (base64-encoded)."),
  dedup_against_hubspot: z
    .boolean()
    .optional()
    .describe("If true (default), drop prospects whose email already exists in HubSpot (concurrency capped at 5)."),
  include_assignment: z
    .boolean()
    .optional()
    .describe("If true (default), include a `HubSpot Owner ID` column sourced from prospect.ownerId/owner_id."),
});

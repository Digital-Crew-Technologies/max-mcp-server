import { z } from "zod";
import { withToken } from "../shared";

// Intent Signals (feature #7): set up triggers that watch a target URL for a
// buying signal, review the AI recommendations they generate, and approve /
// reject / modify those proposals (which launches a draft campaign on approve).
// All schemas mirror the max-agent /api/v1/intent/* route contracts.

const signalTypeSchema = z
  .enum(["funding", "hiring", "tech_stack", "news", "job_change", "topic", "custom"])
  .describe(
    "What kind of buying signal to watch for: funding, hiring, tech_stack, news, job_change, topic, or custom.",
  );

// Mirrors max-agent FREQUENCY_VALUES (src/features/intent/intent.types.ts).
// Sub-hour tokens are best-effort: polling is never finer than the detection
// cron's cadence.
const frequencySchema = z
  .enum([
    "1s", "60s", "5m", "10m", "15m", "30m", "60m", "3h", "6h", "12h", "24h",
    "48h", "72h", "1w", "2w", "1mo", "3mo", "6mo", "1y", "2y",
    "daily", "weekly", "monthly",
  ])
  .optional()
  .describe("How often the trigger re-polls, e.g. 6h, daily, 1w, 1mo (default daily).");

const platformSchema = z
  .enum([
    "website",
    "linkedin",
    "twitter",
    "instagram",
    "facebook",
    "tiktok",
    "youtube",
    "github",
    "other",
  ])
  .optional();

export const createIntentTriggerSchema = z.object({
  ...withToken,
  signal_type: signalTypeSchema,
  name: z.string().trim().min(1).max(200).optional().describe("Display name for the monitor."),
  target_type: z
    .enum(["person", "organization", "specific"])
    .optional()
    .describe("specific (default) watches target_url; person/organization watch that record's stored profile URL for `platform`."),
  platform: platformSchema.describe("Which profile to watch for person/organization monitors (default website)."),
  target_url: z
    .string()
    .url()
    .optional()
    .describe("The URL to monitor (required when target_type is specific, e.g. a company news page)."),
  criteria: z
    .string()
    .optional()
    .describe(
      "Optional natural-language criteria describing what change counts as a relevant signal.",
    ),
  frequency: frequencySchema,
  organization_id: z
    .string()
    .uuid()
    .optional()
    .describe("Optional organization UUID this trigger is scoped to (the company for an organization monitor)."),
  prospect_id: z
    .string()
    .uuid()
    .optional()
    .describe("Optional prospect UUID this trigger is scoped to (the person for a person monitor)."),
  campaign_ids: z
    .array(z.string().uuid())
    .max(20)
    .optional()
    .describe("Launch-ready campaigns to auto-launch when a signal fires."),
});

export const listIntentSignalsSchema = z.object({
  ...withToken,
  active: z
    .boolean()
    .optional()
    .describe("Filter triggers by active state (true = enabled, false = disabled)."),
});

export const getSignalHistorySchema = z.object({
  ...withToken,
  trigger_id: z
    .string()
    .uuid()
    .describe("Trigger UUID to fetch the detected signal events for."),
});

export const disableTriggerSchema = z.object({
  ...withToken,
  trigger_id: z.string().uuid().describe("Trigger UUID to disable (sets active=false)."),
});

export const listSignalProposalsSchema = z.object({
  ...withToken,
  status: z
    .enum(["pending", "approved", "rejected", "modified", "launched", "expired"])
    .optional()
    .describe("Optional status filter; an unknown value is ignored and all proposals are returned."),
});

export const getSignalProposalSchema = z.object({
  ...withToken,
  proposal_id: z.string().uuid().describe("Proposal UUID to fetch."),
});

// Strict modification body shared by approve (optional overrides) and modify.
const modificationsShape = {
  titles: z
    .array(z.string())
    .optional()
    .describe("Override the target job titles used to build the prospect list."),
  target_prospect_ids: z
    .array(z.string().uuid())
    .optional()
    .describe("Override the explicit set of prospect UUIDs to target."),
  campaign_name: z.string().optional().describe("Override the draft campaign name."),
  campaign_description: z
    .string()
    .optional()
    .describe("Override the draft campaign description."),
};

export const approveProposalSchema = z.object({
  ...withToken,
  proposal_id: z.string().uuid().describe("Proposal UUID to approve and launch."),
  modifications: z
    .object(modificationsShape)
    .strict()
    .optional()
    .describe(
      "Optional last-minute overrides applied before launch. Absent/empty = approve the recommendation as-is.",
    ),
});

export const rejectProposalSchema = z.object({
  ...withToken,
  proposal_id: z.string().uuid().describe("Proposal UUID to reject."),
});

export const modifyProposalSchema = z.object({
  ...withToken,
  proposal_id: z.string().uuid().describe("Proposal UUID to modify (must be pending)."),
  modifications: z
    .object(modificationsShape)
    .strict()
    .describe(
      "Adjustments to apply to the pending proposal (titles, target_prospect_ids, campaign_name, campaign_description). The workflow is regenerated and the proposal stays pending.",
    ),
});

// POST /api/v1/intent/triggers/bulk — one monitor per prospect-list member or
// per organization. max-agent requires EXACTLY ONE of prospect_list_id /
// organization_ids (400 otherwise); not refined here so the schema stays a
// plain ZodObject for grouped mode.
export const bulkCreateIntentTriggersSchema = z.object({
  ...withToken,
  signal_type: signalTypeSchema,
  prospect_list_id: z
    .string()
    .uuid()
    .optional()
    .describe("Monitor each person in this prospect list (first 200). Use this OR organization_ids."),
  organization_ids: z
    .array(z.string().uuid())
    .min(1)
    .max(200)
    .optional()
    .describe("Monitor each of these organizations. Use this OR prospect_list_id."),
  platform: platformSchema.describe("Which of each member's profiles to watch (default website)."),
  name: z
    .string()
    .trim()
    .min(1)
    .max(150)
    .optional()
    .describe("Name prefix; monitors are named '<prefix> — <member name>'."),
  criteria: z
    .string()
    .optional()
    .describe("Natural-language criteria for what counts as a relevant signal."),
  frequency: frequencySchema,
  campaign_ids: z
    .array(z.string().uuid())
    .max(20)
    .optional()
    .describe("Launch-ready campaigns to auto-launch when a signal fires."),
});

export const attachCampaignToIntentTriggerSchema = z.object({
  ...withToken,
  campaign_id: z.string().uuid().describe("Campaign UUID to link."),
  trigger_ids: z
    .array(z.string().uuid())
    .min(1)
    .max(20)
    .describe("Intent trigger UUIDs to link the campaign to."),
});

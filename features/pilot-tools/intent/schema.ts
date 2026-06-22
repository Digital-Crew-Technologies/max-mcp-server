import { z } from "zod";
import { withToken } from "../shared";

// Intent Signals (feature #7): set up triggers that watch a target URL for a
// buying signal, review the AI recommendations they generate, and approve /
// reject / modify those proposals (which launches a draft campaign on approve).
// All schemas mirror the max-agent /api/v1/intent/* route contracts.

const signalTypeSchema = z
  .enum(["funding", "hiring", "tech_stack", "news", "job_change", "custom"])
  .describe(
    "What kind of buying signal to watch for: funding, hiring, tech_stack, news, job_change, or custom.",
  );

const frequencySchema = z
  .enum(["daily", "weekly", "monthly"])
  .optional()
  .describe("How often the trigger re-polls the target URL (default weekly).");

export const createIntentTriggerSchema = z.object({
  ...withToken,
  signal_type: signalTypeSchema,
  target_url: z
    .string()
    .url()
    .describe("The URL to monitor for the signal (e.g. a company news page)."),
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
    .describe("Optional organization UUID this trigger is scoped to."),
  prospect_id: z
    .string()
    .uuid()
    .optional()
    .describe("Optional prospect UUID this trigger is scoped to."),
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

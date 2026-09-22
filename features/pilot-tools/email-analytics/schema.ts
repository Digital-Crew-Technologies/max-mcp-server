import { z } from "zod";
import { withToken } from "../shared";

export const getEmailTrackingEventsSchema = z.object({
  ...withToken,
  prospect_id: z.string().uuid().describe("Prospect UUID"),
  event_types: z
    .array(z.string())
    .optional()
    .describe(
      "Filter by event type(s), e.g. mail_opened, mail_link_clicked, mail_replied, mail_bounced",
    ),
});

export const getProspectEngagementTimelineSchema = z.object({
  ...withToken,
  prospect_id: z.string().uuid().describe("Prospect UUID"),
});

export const getLinkClickDetailsSchema = z.object({
  ...withToken,
  campaign_id: z.string().uuid().describe("Campaign UUID"),
});

export const getCampaignEngagementSummarySchema = z.object({
  ...withToken,
  campaign_id: z.string().uuid().describe("Campaign UUID"),
});

// ── Workspace analytics (dashboard:read) ────────────────────────────────────
// max-agent silently ignores an unparseable from/to on overview/entity (the
// query then spans all time) and 400s a non-UTC one on conversations, so every
// period bound is validated here as a UTC ISO datetime.
const periodShape = {
  from: z
    .string()
    .datetime()
    .optional()
    .describe("Period start, UTC ISO datetime (e.g. 2026-01-01T00:00:00Z). Omit for all time."),
  to: z.string().datetime().optional().describe("Period end, UTC ISO datetime. Omit for now."),
};

const compareSchema = z
  .enum(["previous", "prior_year"])
  .optional()
  .describe("Comparison window for `previous` totals when from is set (default previous = preceding equal-length period).");

export const getAnalyticsOverviewSchema = z.object({
  ...withToken,
  ...periodShape,
  campaign_ids: z
    .array(z.string().uuid())
    .optional()
    .describe("Only these campaigns (unknown ids are ignored)."),
  account_ids: z
    .array(z.string().uuid())
    .optional()
    .describe("Only activity sent from these sender accounts."),
  compare: compareSchema,
});

export const listConversationAnalyticsSchema = z.object({
  ...withToken,
  ...periodShape,
});

export const getEntityAnalyticsSchema = z.object({
  ...withToken,
  type: z.enum(["person", "organization"]).describe("person = prospect, organization = company."),
  id: z.string().uuid().describe("Prospect or organization UUID."),
  ...periodShape,
  compare: compareSchema,
});

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

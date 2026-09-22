import { callApi, strip, toolHints, type McpServer } from "../shared";
import * as repo from "./repository";
import * as S from "./schema";

export function registerEmailAnalyticsTools(server: McpServer): void {
  server.registerTool(
    "get_email_tracking_events",
    {
      title: "Get email tracking events",
      description:
        "Raw per-event email tracking rows for a prospect (opens, clicks, replies, bounces) with url/ip/user_agent detail. Newest first. Optionally filter by event_types.",
      inputSchema: S.getEmailTrackingEventsSchema,
    },
    async (input) =>
      callApi(input.bearer_token, (t) =>
        repo.getEmailTrackingEvents(t, {
          prospect_id: input.prospect_id,
          event_types: input.event_types,
        }),
      ),
  );

  server.registerTool(
    "get_prospect_engagement_timeline",
    {
      title: "Get prospect engagement timeline",
      description:
        "Chronological email engagement timeline for a prospect (oldest first) — every open, click, reply, and bounce.",
      inputSchema: S.getProspectEngagementTimelineSchema,
    },
    async (input) =>
      callApi(input.bearer_token, (t) =>
        repo.getProspectEngagementTimeline(t, input.prospect_id),
      ),
  );

  server.registerTool(
    "get_link_click_details",
    {
      title: "Get link click details",
      description:
        "Link clicks for a campaign grouped by url, with total click counts and unique-prospect counts. Sorted by clicks desc.",
      inputSchema: S.getLinkClickDetailsSchema,
    },
    async (input) =>
      callApi(input.bearer_token, (t) =>
        repo.getLinkClickDetails(t, input.campaign_id),
      ),
  );

  server.registerTool(
    "get_campaign_engagement_summary",
    {
      title: "Get campaign engagement summary",
      description:
        "Engagement summary for a campaign: open/click/reply/bounce rates plus per-link click detail (top links, distinct URLs clicked).",
      inputSchema: S.getCampaignEngagementSummarySchema,
    },
    async (input) =>
      callApi(input.bearer_token, (t) =>
        repo.getCampaignEngagementSummary(t, input.campaign_id),
      ),
  );

  server.registerTool(
    "get_analytics_overview",
    {
      title: "Get analytics overview",
      description:
        "Workspace analytics for a period, optionally filtered by campaign_ids/account_ids: totals and rates per channel (email, LinkedIn, WhatsApp, mail, meetings), by_campaign, by_account, prospect_lists, deals, crew, signals, funnel, previous-period totals (when from is set) and a daily timeseries. Large payload — narrow the period.",
      inputSchema: S.getAnalyticsOverviewSchema,
      ...toolHints.readOnly,
    },
    async (input) =>
      callApi(input.bearer_token, (t) =>
        repo.getAnalyticsOverview(t, strip(input, "bearer_token")),
      ),
  );

  server.registerTool(
    "list_conversation_analytics",
    {
      title: "List conversation analytics",
      description:
        "Conversation-intelligence rollup of analyzed meetings in a period: {data: {totals (analyzedConversations, averageScore, averageInternalTalkPct, objectionRatePct, highRiskDeals), forecast, benchmarks per rep, trackerTrends, dealRisks, coachingLibrary}}.",
      inputSchema: S.listConversationAnalyticsSchema,
      ...toolHints.readOnly,
    },
    async (input) =>
      callApi(input.bearer_token, (t) =>
        repo.getConversationAnalytics(t, strip(input, "bearer_token")),
      ),
  );

  server.registerTool(
    "get_entity_analytics",
    {
      title: "Get entity analytics",
      description:
        "360° analytics for one person (prospect) or organization over a period: touch totals per channel, meetings, by_campaign enrollment, linked deals, by_contact (organizations), daily timeseries and comparison totals. 404 if not in this workspace.",
      inputSchema: S.getEntityAnalyticsSchema,
      ...toolHints.readOnly,
    },
    async (input) =>
      callApi(input.bearer_token, (t) =>
        repo.getEntityAnalytics(t, strip(input, "bearer_token")),
      ),
  );
}

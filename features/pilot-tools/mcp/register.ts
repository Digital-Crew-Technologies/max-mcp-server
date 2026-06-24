import type { McpServer } from "../shared";
import { registerCampaignTools } from "../campaigns/tools";
import { registerProspectTools } from "../prospects/tools";
import { registerProspectListTools } from "../prospect-lists/tools";
import { registerOrganizationTools } from "../organizations/tools";
import { registerAccountTools } from "../accounts/tools";
import { registerUniboxTools } from "../unibox/tools";
import { registerAiAgentTools } from "../ai-agent/tools";
import { registerApolloTools } from "../apollo/tools";
import { registerExploriumTools } from "../explorium/tools";
import { registerClaireTools } from "../claire/tools";
import { registerCrmTools } from "../crm/tools";
import { registerCrmLeadDispatchTools } from "../crm/lead-dispatch";
import { registerNotionTools } from "../notion/tools";
import {
  registerLinkedinTools,
  registerLinkedinToolsGrouped,
} from "../linkedin/tools";
import { registerDashboardTools } from "../dashboard/tools";
import { registerAdminTools } from "../admin/tools";
import { registerWebhookTools } from "../webhooks/tools";

/**
 * Tool registration entry point.
 *
 * Feature-flagged: `GROUPED_TOOLS=true` switches LinkedIn (the largest
 * domain at ~20 tools) to a single `linkedin` grouped tool. Other domains
 * still register flat — they'll be ported in follow-up PRs once the
 * grouped pattern is proven against Langfuse traces from real Max chat
 * traffic.
 *
 * When the flag is off (default), behavior is identical to before.
 */
export function registerPilotMcpTools(server: McpServer): void {
  const useGrouped = process.env.GROUPED_TOOLS === "true";

  registerCampaignTools(server);
  registerProspectTools(server);
  registerProspectListTools(server);
  registerOrganizationTools(server);
  registerAccountTools(server);
  registerUniboxTools(server);
  registerAiAgentTools(server);
  registerApolloTools(server);
  registerExploriumTools(server);
  registerClaireTools(server);
  registerCrmTools(server);
  registerCrmLeadDispatchTools(server);
  registerNotionTools(server);

  if (useGrouped) {
    registerLinkedinToolsGrouped(server);
  } else {
    registerLinkedinTools(server);
  }

  registerDashboardTools(server);
  registerAdminTools(server);
  registerWebhookTools(server);
}

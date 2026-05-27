import type { McpServer } from "../shared";
import { registerCampaignTools } from "../campaigns/tools";
import { registerProspectTools } from "../prospects/tools";
import { registerProspectListTools } from "../prospect-lists/tools";
import { registerOrganizationTools } from "../organizations/tools";
import { registerAccountTools } from "../accounts/tools";
import { registerUniboxTools } from "../unibox/tools";
import { registerAiAgentTools } from "../ai-agent/tools";
import { registerApolloTools } from "../apollo/tools";
import { registerDashboardTools } from "../dashboard/tools";

export function registerPilotMcpTools(server: McpServer): void {
  registerCampaignTools(server);
  registerProspectTools(server);
  registerProspectListTools(server);
  registerOrganizationTools(server);
  registerAccountTools(server);
  registerUniboxTools(server);
  registerAiAgentTools(server);
  registerApolloTools(server);
  registerDashboardTools(server);
}

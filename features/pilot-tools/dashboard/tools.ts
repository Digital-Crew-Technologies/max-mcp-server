import { callApi, type McpServer } from "../shared";
import * as repo from "./repository";
import * as S from "./schema";

export function registerDashboardTools(server: McpServer): void {
  server.registerTool("get_dashboard_kpis", {
    title: "Get dashboard KPIs",
    description: "Workspace-wide aggregate stats — execution counts, email/LinkedIn rates, completion percentage.",
    inputSchema: S.getDashboardKpisSchema,
  }, async (input) => callApi(input.bearer_token, (t) => repo.getDashboardKpis(t)));
}

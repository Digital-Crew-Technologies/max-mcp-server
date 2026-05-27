import { callApi, strip, type McpServer } from "../shared";
import * as repo from "./repository";
import * as S from "./schema";

export function registerAiAgentTools(server: McpServer): void {
  server.registerTool("generate_workflow", {
    title: "Generate campaign workflow (AI)",
    description: "Use AI to generate a campaign workflow from natural language. Charges credits. Provide a prompt or structured fields.",
    inputSchema: S.generateWorkflowSchema,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.generateWorkflow(t, strip(input, "bearer_token"))));

  server.registerTool("generate_message_preview", {
    title: "Generate message preview (AI)",
    description: "Use AI to generate a personalized message for a prospect. Charges credits. Specify channel and prompt.",
    inputSchema: S.generateMessagePreviewSchema,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.generateMessagePreview(t, strip(input, "bearer_token"))));
}

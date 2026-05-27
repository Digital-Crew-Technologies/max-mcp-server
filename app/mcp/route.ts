import { createMcpHandler } from "mcp-handler";
import { registerWorkspaceProfileTools } from "@/features/workspace-profile/mcp/register";
import { registerPilotMcpTools } from "@/features/pilot-tools/mcp/register";
import { runWithMcpRequest } from "@/shared/auth/request-context";

// StreamableHttp server
const mcpHandler = createMcpHandler(
  async (server) => {
    registerWorkspaceProfileTools(server);
    registerPilotMcpTools(server);
  },
  {},
  {
    basePath: "",
    verboseLogs: true,
    maxDuration: 60,
    disableSse: true,
  },
);

const handler = (request: Request) =>
  runWithMcpRequest(request, () => mcpHandler(request));

export { handler as GET, handler as POST, handler as DELETE };

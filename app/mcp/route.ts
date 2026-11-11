import { createMcpHandler } from "mcp-handler";
import { registerWorkspaceProfileTools } from "@/features/workspace-profile/mcp/register";
import { registerPilotMcpTools } from "@/features/pilot-tools/mcp/register";
import { runWithMcpRequest } from "@/shared/auth/request-context";

// Route segment config: lets a tool call run as long as the handler allows
// (Claire jobs take minutes). The `maxDuration` below is mcp-handler's own.
export const maxDuration = 300;

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
    maxDuration: 300,
    disableSse: true,
  },
);

const handler = (request: Request) =>
  runWithMcpRequest(request, () => mcpHandler(request));

export { handler as GET, handler as POST, handler as DELETE };

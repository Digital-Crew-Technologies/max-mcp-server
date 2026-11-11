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

// mcp-handler parses a POST body inside a promise it never awaits: a body that
// is not JSON became an unhandled rejection and the request was never answered
// (it hung until the platform timeout). Answer it here with the JSON-RPC parse
// error instead; a valid body goes to the handler untouched.
async function post(request: Request): Promise<Response> {
  const text = await request.clone().text();
  try {
    JSON.parse(text);
  } catch {
    return Response.json(
      {
        jsonrpc: "2.0",
        error: { code: -32700, message: "Parse error: the request body is not valid JSON" },
        id: null,
      },
      { status: 400 },
    );
  }
  return handler(request);
}

export { handler as GET, post as POST, handler as DELETE };

import { createMcpHandler } from "mcp-handler";
import {
  getWorkspaceProfileSettings,
  putWorkspaceProfileSettings,
  resolveBearerToken,
  responseBodyText,
} from "./lib/digitalcrew-api";
import { runWithMcpRequest } from "./request-context";
import {
  getWorkspaceProfileToolSchema,
  updateWorkspaceProfileToolSchema,
} from "./workspace-profile.schema";

// StreamableHttp server
const mcpHandler = createMcpHandler(
  async (server) => {
    server.registerTool(
      "get_workspace_profile",
      {
        title: "Get workspace profile",
        description:
          "Fetch workspace profile settings (company info) for the authenticated workspace via DigitalCrew API. Uses the MCP connection Authorization: Bearer token when set.",
        inputSchema: getWorkspaceProfileToolSchema,
      },
      async ({ bearer_token }) => {
        try {
          const token = resolveBearerToken(bearer_token);
          const res = await getWorkspaceProfileSettings(token);
          const text = await responseBodyText(res);
          if (!res.ok) {
            return {
              content: [
                {
                  type: "text",
                  text: `Workspace profile request failed (${res.status}): ${text || res.statusText}`,
                },
              ],
            };
          }
          return {
            content: [{ type: "text", text }],
          };
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return {
            content: [{ type: "text", text: `Error: ${msg}` }],
          };
        }
      },
    );

    server.registerTool(
      "update_workspace_profile",
      {
        title: "Update workspace profile",
        description:
          "Create or update workspace profile settings for the authenticated workspace via DigitalCrew API (PUT upsert). Uses the MCP connection Authorization: Bearer token when set.",
        inputSchema: updateWorkspaceProfileToolSchema,
      },
      async (input) => {
        try {
          const { bearer_token, ...payload } = input;
          const token = resolveBearerToken(bearer_token);
          const res = await putWorkspaceProfileSettings(token, payload);
          const text = await responseBodyText(res);
          if (!res.ok) {
            return {
              content: [
                {
                  type: "text",
                  text: `Workspace profile update failed (${res.status}): ${text || res.statusText}`,
                },
              ],
            };
          }
          return {
            content: [{ type: "text", text }],
          };
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return {
            content: [{ type: "text", text: `Error: ${msg}` }],
          };
        }
      },
    );
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

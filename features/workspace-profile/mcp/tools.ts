import {
  getWorkspaceProfileSettings,
  putWorkspaceProfileSettings,
  resolveBearerToken,
  responseBodyText,
} from "../repository";

import {
  getWorkspaceProfileToolSchema,
  updateWorkspaceProfileToolSchema,
} from "./schema";

export function registerWorkspaceProfileTools(server: {
  registerTool: (
    name: string,
    config: Record<string, unknown>,
    handler: (input: any) => Promise<{
      content: Array<{ type: "text"; text: string }>;
    }>,
  ) => void;
}): void {
  server.registerTool(
    "get_workspace_profile",
    {
      title: "Get workspace profile",
      description:
        "Fetch workspace profile settings (company info) for the authenticated workspace via DigitalCrew API. Uses the MCP connection Authorization: Bearer token when set.",
      inputSchema: getWorkspaceProfileToolSchema,
    },
    async (input) => {
      try {
        const token = resolveBearerToken(
          typeof input.bearer_token === "string" ? input.bearer_token : undefined,
        );
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
        const token = resolveBearerToken(
          typeof bearer_token === "string" ? bearer_token : undefined,
        );
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
}

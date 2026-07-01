import { describe, it, expect } from "vitest";
import type { McpServer } from "@/features/pilot-tools/shared";
import { registerPilotMcpTools } from "@/features/pilot-tools/mcp/register";
import { registerWorkspaceProfileTools } from "@/features/workspace-profile/mcp/register";

type Captured = { name: string; inputSchema: unknown };

function captureInventory(grouped: boolean): Captured[] {
  const prevGrouped = process.env.GROUPED_TOOLS;
  const prevAdmin = process.env.ENABLE_ADMIN_TOOLS;
  const prevWebhooks = process.env.ENABLE_WEBHOOK_SIMULATORS;

  if (grouped) process.env.GROUPED_TOOLS = "true";
  else delete process.env.GROUPED_TOOLS;
  process.env.ENABLE_ADMIN_TOOLS = "true";
  process.env.ENABLE_WEBHOOK_SIMULATORS = "true";

  const tools: Captured[] = [];
  const recorder: McpServer = {
    registerTool(name, config) {
      tools.push({ name, inputSchema: config.inputSchema });
    },
  };

  try {
    registerWorkspaceProfileTools(recorder);
    registerPilotMcpTools(recorder);
  } finally {
    if (prevGrouped === undefined) delete process.env.GROUPED_TOOLS;
    else process.env.GROUPED_TOOLS = prevGrouped;
    if (prevAdmin === undefined) delete process.env.ENABLE_ADMIN_TOOLS;
    else process.env.ENABLE_ADMIN_TOOLS = prevAdmin;
    if (prevWebhooks === undefined) delete process.env.ENABLE_WEBHOOK_SIMULATORS;
    else process.env.ENABLE_WEBHOOK_SIMULATORS = prevWebhooks;
  }
  return tools;
}

describe("MCP tool inventory (contract)", () => {
  it("registers a healthy catalog with unique names and valid schemas (flat mode)", () => {
    const tools = captureInventory(false);
    const names = tools.map((t) => t.name);

    expect(tools.length).toBeGreaterThan(50);

    const duplicates = [...new Set(names.filter((n, i) => names.indexOf(n) !== i))];
    expect(duplicates).toEqual([]);

    for (const t of tools) {
      expect(t.name, "tool name must be a non-empty string").toMatch(/.+/);
      expect(t.inputSchema, `tool "${t.name}" must define an inputSchema`).toBeDefined();
    }
  });

  it("grouped mode collapses LinkedIn into fewer total tools than flat mode", () => {
    const flat = captureInventory(false).length;
    const grouped = captureInventory(true).length;
    expect(grouped).toBeLessThan(flat);
  });
});

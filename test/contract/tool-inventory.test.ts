import { describe, it, expect } from "vitest";
import type { McpServer } from "@/features/pilot-tools/shared";
import { registerPilotMcpTools } from "@/features/pilot-tools/mcp/register";
import { registerWorkspaceProfileTools } from "@/features/workspace-profile/mcp/register";

// Contract test: register EVERY tool into a fake server and assert invariants.
// This catches the silent-drift failures the live `verify-tools.mjs` script
// cannot — a renamed/dropped domain, a duplicate name, a missing schema, or a
// grouped-vs-flat regression — without needing a running server.

type Captured = { name: string; inputSchema: unknown };

function captureInventory(grouped: boolean): Captured[] {
  const prev = process.env.GROUPED_TOOLS;
  if (grouped) process.env.GROUPED_TOOLS = "true";
  else delete process.env.GROUPED_TOOLS;

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
    if (prev === undefined) delete process.env.GROUPED_TOOLS;
    else process.env.GROUPED_TOOLS = prev;
  }
  return tools;
}

describe("MCP tool inventory (contract)", () => {
  it("registers a healthy catalog with unique names and valid schemas (flat mode)", () => {
    const tools = captureInventory(false);
    const names = tools.map((t) => t.name);

    // Regression guard: if a whole domain silently stops registering, this trips.
    expect(tools.length).toBeGreaterThan(50);

    // Duplicate tool names break MCP clients — there must be none.
    const duplicates = [...new Set(names.filter((n, i) => names.indexOf(n) !== i))];
    expect(duplicates).toEqual([]);

    // Every tool must have a non-empty name and a defined input schema.
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

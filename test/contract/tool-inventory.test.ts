import { describe, it, expect } from "vitest";
import type { McpServer } from "@/features/pilot-tools/shared";
import {
  registerPilotMcpTools,
  resolveToolMode,
} from "@/features/pilot-tools/mcp/register";
import { registerWorkspaceProfileTools } from "@/features/workspace-profile/mcp/register";
import {
  MCP_TOOL_BUDGET,
  droppedByClientCap,
  operationCount,
} from "@/features/pilot-tools/mcp/client-cap";

type Captured = { name: string; inputSchema: unknown };

/**
 * Run the real registrars against a recorder. `mode` is the literal value of
 * GROUPED_TOOLS (undefined = unset, i.e. the production default).
 */
function captureInventory(
  mode: string | undefined,
  { admin = true, simulators = true }: { admin?: boolean; simulators?: boolean } = {},
): Captured[] {
  const prev = {
    grouped: process.env.GROUPED_TOOLS,
    admin: process.env.ENABLE_ADMIN_TOOLS,
    simulators: process.env.ENABLE_WEBHOOK_SIMULATORS,
  };

  if (mode === undefined) delete process.env.GROUPED_TOOLS;
  else process.env.GROUPED_TOOLS = mode;
  if (admin) process.env.ENABLE_ADMIN_TOOLS = "true";
  else delete process.env.ENABLE_ADMIN_TOOLS;
  if (simulators) process.env.ENABLE_WEBHOOK_SIMULATORS = "true";
  else delete process.env.ENABLE_WEBHOOK_SIMULATORS;

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
    const restore = (k: string, v: string | undefined) => {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    };
    restore("GROUPED_TOOLS", prev.grouped);
    restore("ENABLE_ADMIN_TOOLS", prev.admin);
    restore("ENABLE_WEBHOOK_SIMULATORS", prev.simulators);
  }
  return tools;
}

describe("MCP tool inventory (contract)", () => {
  it("registers a healthy catalog with unique names and valid schemas", () => {
    const tools = captureInventory("false");
    const names = tools.map((t) => t.name);

    expect(tools.length).toBeGreaterThan(50);

    const duplicates = [...new Set(names.filter((n, i) => names.indexOf(n) !== i))];
    expect(duplicates).toEqual([]);

    for (const t of tools) {
      expect(t.name, "tool name must be a non-empty string").toMatch(/.+/);
      expect(t.inputSchema, `tool "${t.name}" must define an inputSchema`).toBeDefined();
    }
  });

  it("grouped mode collapses the catalog to far fewer tools than flat mode", () => {
    expect(captureInventory(undefined).length).toBeLessThan(
      captureInventory("false").length,
    );
  });
});

describe("client catalog cap (contract)", () => {
  // ── THE REGRESSION THIS FILE EXISTS FOR ──────────────────────────────────
  // max-agent merges this catalog with two other MCP servers' and caps the
  // result at 128 tools, dropping the overflow SILENTLY on every turn. Before
  // this test, the flat catalog had grown to 154 tools and 30 were being
  // discarded in production — including all 19 linkedin_* tools — with nothing
  // failing anywhere. Adding a tool must never quietly evict another one.

  it("the DEFAULT catalog fits in the budget max-agent leaves for MCP tools", () => {
    const names = captureInventory(undefined).map((t) => t.name);
    const dropped = droppedByClientCap(names);

    expect(
      dropped,
      `The default catalog registers ${names.length} tools and does not fit in ` +
        `max-agent's ${MCP_TOOL_BUDGET}-slot budget. These would be silently ` +
        `dropped on every turn: ${dropped.join(", ")}. Group a domain rather ` +
        `than registering more flat tools — see features/pilot-tools/mcp/register.ts.`,
    ).toEqual([]);
  });

  it("leaves headroom for the other MCP servers sharing the budget", () => {
    // GetLeads and Explorium contribute to the same 122 slots. The default
    // catalog must not consume so much of it that a modest provider catalog
    // starts evicting our tools.
    const names = captureInventory(undefined).map((t) => t.name);
    expect(droppedByClientCap(names, 40)).toEqual([]);
  });

  it("every grouped tool name is cap-safe (no underscore)", () => {
    // max-agent's tier() treats a name containing "_" as a droppable flat
    // tool. A grouped tool named `prospect_lists` would defeat its own point.
    const flat = new Set(captureInventory("false").map((t) => t.name));
    const groupNames = captureInventory(undefined)
      .map((t) => t.name)
      .filter((n) => !flat.has(n));

    expect(groupNames.length).toBeGreaterThan(0);
    expect(groupNames.filter((n) => n.includes("_"))).toEqual([]);
  });

  it("documents that flat mode does NOT fit — it is an escape hatch, not a default", () => {
    const names = captureInventory("false").map((t) => t.name);
    expect(droppedByClientCap(names).length).toBeGreaterThan(0);
  });
});

describe("GROUPED_TOOLS mode resolution", () => {
  it("defaults to grouped when unset, empty, 'true' or 'all'", () => {
    for (const v of [undefined, "", "true", "TRUE", "all", " All "]) {
      expect(resolveToolMode(v)).toBe("grouped");
    }
  });

  it("supports the legacy linkedin-only mode and an explicit flat escape hatch", () => {
    expect(resolveToolMode("linkedin")).toBe("linkedin-only");
    expect(resolveToolMode("false")).toBe("flat");
    expect(resolveToolMode("off")).toBe("flat");
  });

  it("falls back to grouped — never the overflowing mode — on an unknown value", () => {
    expect(resolveToolMode("banana")).toBe("grouped");
  });
});

describe("capability is packaging-independent (contract)", () => {
  /** Total operations the catalog exposes, however it is packaged. */
  const operations = (tools: Captured[]) =>
    tools.reduce((total, t) => total + operationCount(t.inputSchema), 0);

  // ── THE GUARANTEE THIS FILE OWES ─────────────────────────────────────────
  // Grouping changes how operations are ADDRESSED, never how many exist.
  // `list_chats` becomes `unibox` + action "list_chats"; it does not disappear.
  // Without this test, a botched grouping could quietly drop a domain's
  // actions and every other assertion here would still pass — the tool count
  // would even look better.
  it("grouped mode exposes exactly as many operations as flat mode", () => {
    expect(operations(captureInventory(undefined))).toBe(
      operations(captureInventory("false")),
    );
  });

  it("holds for the legacy linkedin-only mode too", () => {
    expect(operations(captureInventory("linkedin"))).toBe(
      operations(captureInventory("false")),
    );
  });

  it("holds with the optional flag-gated tools off", () => {
    const opts = { admin: false, simulators: false };
    expect(operations(captureInventory(undefined, opts))).toBe(
      operations(captureInventory("false", opts)),
    );
  });

  it("collapses many registrations into far fewer, without losing operations", () => {
    const flat = captureInventory("false");
    const grouped = captureInventory(undefined);
    // Far fewer entries...
    expect(grouped.length).toBeLessThan(flat.length / 3);
    // ...carrying strictly more operations than entries, i.e. really grouped.
    expect(operations(grouped)).toBeGreaterThan(grouped.length);
  });
});

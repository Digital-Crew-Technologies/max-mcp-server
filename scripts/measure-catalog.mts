/**
 * Measure the wire cost of the `tools/list` payload, per tool mode.
 *
 *   pnpm catalog:measure
 *
 * WHY THIS EXISTS: the tool catalog is re-sent, in full, as input on EVERY
 * model step — and max-agent's chat model (Kimi K3 via OpenRouter) reports
 * `supports_implicit_caching: false`, so none of it is discounted. That makes
 * catalog bytes a direct, recurring cost, and it was previously invisible:
 * `docs/tools.json` counts tools, nothing counted bytes. A change that adds one
 * tool with a 900-character description costs more than one that adds six terse
 * ones, and only this script will tell you.
 *
 * It also prints the CAP CHECK — whether the catalog still fits in the budget
 * max-agent leaves for MCP tools. See test/contract/tool-inventory.test.ts,
 * which asserts the same thing and fails the build.
 */

import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { McpServer } from "../features/pilot-tools/shared";
import { registerWorkspaceProfileTools } from "../features/workspace-profile/mcp/register";
import { registerPilotMcpTools } from "../features/pilot-tools/mcp/register";
import {
  MCP_TOOL_BUDGET,
  droppedByClientCap,
} from "../features/pilot-tools/mcp/client-cap";

type Captured = { name: string; description: string; schema: unknown };

/**
 * Is this a Zod schema (as opposed to a bare shape record)?
 *
 * Duck-typed on purpose. `instanceof z.ZodType` is unreliable here: this script
 * and the feature modules can resolve to different copies of zod under pnpm,
 * and a cross-copy instanceof silently returns false — which made an earlier
 * version of this script serialize every grouped union as an empty object and
 * under-report schema bytes by ~10x. Structural checks survive that.
 */
function isZodSchema(v: unknown): v is z.ZodTypeAny {
  return (
    !!v &&
    typeof v === "object" &&
    "_def" in (v as object) &&
    typeof (v as { safeParse?: unknown }).safeParse === "function"
  );
}

/** Serialize an inputSchema the way mcp-handler would put it on the wire. */
function toJsonSchema(input: unknown): unknown {
  try {
    if (isZodSchema(input)) {
      return zodToJsonSchema(input as z.ZodTypeAny, { $refStrategy: "none" });
    }
    if (input && typeof input === "object") {
      return zodToJsonSchema(
        z.object(input as Record<string, z.ZodTypeAny>),
        { $refStrategy: "none" },
      );
    }
  } catch (e) {
    return { __unserializable: String(e) };
  }
  return {};
}

function capture(
  mode: string | undefined,
  admin = false,
  simulators = false,
): Captured[] {
  if (mode === undefined) delete process.env.GROUPED_TOOLS;
  else process.env.GROUPED_TOOLS = mode;
  if (admin) process.env.ENABLE_ADMIN_TOOLS = "true";
  else delete process.env.ENABLE_ADMIN_TOOLS;
  if (simulators) process.env.ENABLE_WEBHOOK_SIMULATORS = "true";
  else delete process.env.ENABLE_WEBHOOK_SIMULATORS;

  const tools: Captured[] = [];
  const recorder: McpServer = {
    registerTool(name, config) {
      tools.push({
        name,
        description: String(config.description ?? ""),
        schema: toJsonSchema(config.inputSchema),
      });
    },
  };
  registerWorkspaceProfileTools(recorder);
  registerPilotMcpTools(recorder);
  return tools;
}

/** ~3.7 chars/token for a JSON + English mix. Deliberately conservative. */
const tok = (chars: number) => Math.round(chars / 3.7);

function measure(tools: Captured[]) {
  const wire = JSON.stringify(
    tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.schema,
    })),
  );
  return {
    count: tools.length,
    bytes: wire.length,
    tokens: tok(wire.length),
    descBytes: tools.reduce((a, t) => a + t.description.length, 0),
    schemaBytes: tools.reduce((a, t) => a + JSON.stringify(t.schema).length, 0),
    names: tools.map((t) => t.name),
  };
}

const MODES: Array<{ label: string; tools: Captured[] }> = [
  { label: "flat (GROUPED_TOOLS=false)", tools: capture("false") },
  { label: "linkedin-only (legacy)", tools: capture("linkedin") },
  { label: "grouped (DEFAULT)", tools: capture(undefined) },
  { label: "grouped + admin + sim", tools: capture(undefined, true, true) },
];

const rows = MODES.map((m) => ({ label: m.label, ...measure(m.tools) }));

const pad = (s: string | number, n: number) => String(s).padStart(n);
console.log(
  "mode".padEnd(28) +
    pad("tools", 6) +
    pad("bytes", 10) +
    pad("~tokens", 9) +
    pad("descB", 9) +
    pad("schemaB", 9),
);
for (const r of rows) {
  console.log(
    r.label.padEnd(28) +
      pad(r.count, 6) +
      pad(r.bytes.toLocaleString(), 10) +
      pad(r.tokens.toLocaleString(), 9) +
      pad(r.descBytes.toLocaleString(), 9) +
      pad(r.schemaBytes.toLocaleString(), 9),
  );
}

const flat = rows[0];
const grouped = rows[2];
const pct = (a: number, b: number) => `${(((b - a) / a) * 100).toFixed(1)}%`;
console.log(
  `\nflat → grouped:  ${flat.count} → ${grouped.count} tools` +
    `   ~${flat.tokens.toLocaleString()} → ~${grouped.tokens.toLocaleString()} tokens` +
    `  (${pct(flat.tokens, grouped.tokens)})`,
);

console.log(`\nCAP CHECK  (max-agent leaves ${MCP_TOOL_BUDGET} slots for MCP tools)`);
for (const r of rows) {
  const dropped = droppedByClientCap(r.names);
  const verdict = dropped.length === 0 ? "fits" : `DROPS ${dropped.length}`;
  console.log(`  ${r.label.padEnd(28)} ${pad(r.count, 4)} tools → ${verdict}`);
  if (dropped.length > 0) console.log(`      ${dropped.join(", ")}`);
}

console.log(`\ngrouped catalog: ${grouped.names.join(", ")}`);

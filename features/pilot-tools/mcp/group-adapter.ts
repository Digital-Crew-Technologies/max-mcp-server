// Turn an existing FLAT registrar into a single grouped tool — without
// editing the domain's tools.ts.
//
// WHY AN ADAPTER RATHER THAN A REWRITE
// -----------------------------------
// Grouping every domain by hand would mean restructuring ~150 registrations
// across 25 files into GroupedActionDef[] literals. That is a huge diff, it has
// to be redone by every future author adding a tool, and each hand-conversion
// is a chance to silently change a schema or drop a handler.
//
// Instead we run the domain's existing registrar against a RECORDER that
// captures each `registerTool(name, config, handler)` call, then re-emit the
// whole capture as one grouped tool. The domain files stay flat and untouched,
// a newly added tool is grouped automatically, and flat mode is still the same
// code path it always was — so the two modes cannot drift apart.
//
// ACTION NAMING: the action is the tool's ORIGINAL flat name (`list_chats`,
// not `list`). That is deliberate:
//   • no collisions — flat names are already unique across the catalog;
//   • no per-domain prefix-stripping rules to get wrong;
//   • the mapping from the old catalog is mechanical and obvious to a reader
//     AND to a model that learned the flat names — `list_chats` becomes
//     `unibox(action: "list_chats")`.

import { z } from "zod";
import {
  registerGroupedTool,
  type GroupedActionDef,
  type McpServer,
} from "../shared";

/**
 * Normalize whatever a flat registration passed as `inputSchema` into the raw
 * Zod shape that `registerGroupedTool` needs for its union branches.
 *
 * Both forms are in use in this repo and both are valid to mcp-handler:
 *   • a ZodObject      — `inputSchema: S.listChatsSchema` (most domains)
 *   • a bare shape     — `inputSchema: { ...a.inputShape }` (linkedin/tools.ts)
 */
function toShape(schema: unknown): Record<string, z.ZodTypeAny> {
  if (schema instanceof z.ZodObject) {
    return schema.shape as Record<string, z.ZodTypeAny>;
  }
  if (schema && typeof schema === "object") {
    return schema as Record<string, z.ZodTypeAny>;
  }
  return {};
}

/** The subset of a flat tool's config the adapter needs. */
type FlatConfig = {
  title?: unknown;
  description?: unknown;
  inputSchema?: unknown;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
  };
};

/**
 * Run `registerFlat` against a recorder and register the captured tools as one
 * grouped tool named `groupName`.
 *
 * ⚠️ `groupName` MUST NOT CONTAIN AN UNDERSCORE. max-agent's catalog cap
 * (src/features/agent/utils/model-tool-cap.ts) tiers by name: `_` in the name
 * means "flat tool" (tier 1, droppable), no `_` means "grouped domain tool"
 * (tier 0, kept). A group called `prospect_lists` would be silently droppable
 * and defeat the whole point of grouping it. Enforced below.
 */
export function registerAsGroup(
  server: McpServer,
  groupName: string,
  blurb: string,
  registerFlat: (recorder: McpServer) => void,
): void {
  if (groupName.includes("_")) {
    throw new Error(
      `Grouped tool name "${groupName}" contains "_". Client catalog caps ` +
        `treat underscored names as droppable flat tools — use a single word ` +
        `(e.g. "lists", not "prospect_lists").`,
    );
  }

  const actions: GroupedActionDef[] = [];
  const recorder: McpServer = {
    registerTool(name, config, handler) {
      const c = config as FlatConfig;
      actions.push({
        action: name,
        title: typeof c.title === "string" ? c.title : name,
        description: typeof c.description === "string" ? c.description : "",
        inputShape: toShape(c.inputSchema),
        annotations: c.annotations,
        // The grouped wrapper strips `action` before calling this, so the
        // handler receives exactly the input it received in flat mode.
        handler,
      });
    },
  };

  registerFlat(recorder);
  registerGroupedTool(server, groupName, blurb, actions);
}

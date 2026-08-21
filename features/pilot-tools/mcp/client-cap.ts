// A model of the CLIENT-SIDE tool cap this server's catalog has to fit inside.
//
// ── WHY THIS LIVES HERE ───────────────────────────────────────────────────
// This server has no idea how big its own catalog is allowed to be — that
// limit belongs to the consumer. max-agent merges our catalog with two other
// MCP servers' and caps the result at 128 entries, because OpenAI hard-rejects
// a Chat Completions request with more than 128 tools and OpenRouter surfaces
// that as an opaque "Provider returned error". Anything past the cap is
// dropped, silently, on every turn.
//
// Nothing used to connect those two facts. This server happily grew to 154
// registered tools; the client quietly discarded 30 of them; no test on either
// side failed. The result was that every `linkedin_*` tool vanished from the
// model's catalog while max-agent's own prompt still told it to call
// `get_profile`. Encoding the client's budget here — and asserting against it
// in test/contract/tool-inventory.test.ts — is what makes that class of bug
// loud instead of silent.
//
// ⚠️ THIS IS A MIRROR, AND MIRRORS DRIFT. The numbers below are copied from
// max-agent `src/features/agent/utils/model-tool-cap.ts`. If that file changes,
// change this one. It is deliberately conservative: it assumes ZERO tools from
// the other two MCP servers (GetLeads, Explorium), so real headroom is smaller
// than this check implies, never larger.

/** max-agent: `MODEL_MAX_TOOLS` — OpenAI's limit, used as a cross-provider floor. */
export const MODEL_MAX_TOOLS = 128;

/**
 * Slots max-agent reserves for tools it defines locally and adds after ours:
 * 3 prospecting + 1 agent-config + `ask_user` + `navigate_app`.
 */
export const CLIENT_RESERVED_SLOTS = 6;

/** What is actually left for MCP tools from all servers combined. */
export const MCP_TOOL_BUDGET = MODEL_MAX_TOOLS - CLIENT_RESERVED_SLOTS;

/**
 * max-agent drops Apollo tools by name prefix before the cap is applied
 * (Apollo is not offered as a sourcing provider in the Search flow).
 */
export const CLIENT_DROPS_PREFIX = "apollo";

/**
 * max-agent's drop priority. Lower survives. Mirrors `tier()` in
 * model-tool-cap.ts — note the load-bearing rule: **a name containing "_" is
 * treated as a droppable flat tool (1); a name without one is a grouped domain
 * tool (0) and is kept.** That is why every grouped tool name in this repo must
 * be a single word.
 */
function tier(name: string): number {
  if (name.startsWith("simulate_")) return 4;
  if (name.startsWith("explorium_mcp_")) return 3;
  if (name.startsWith("getleads_mcp_")) return 2;
  if (name.includes("_")) return 1;
  return 0;
}

/**
 * Given the tool names this server registers, return the ones max-agent would
 * discard — in drop order, lowest-value first. Empty means the catalog fits.
 *
 * `otherServerToolCount` models tools contributed by the other MCP servers,
 * which compete for the same budget. Default 0 is the optimistic case.
 */
export function droppedByClientCap(
  registeredNames: readonly string[],
  otherServerToolCount = 0,
): string[] {
  const catalog = registeredNames.filter(
    (n) => !n.startsWith(CLIENT_DROPS_PREFIX),
  );
  const budget = Math.max(0, MCP_TOOL_BUDGET - otherServerToolCount);
  if (catalog.length <= budget) return [];

  return catalog
    .map((name, index) => ({ name, index, t: tier(name) }))
    .sort((a, b) => a.t - b.t || a.index - b.index)
    .slice(budget)
    .reverse()
    .map((r) => r.name);
}

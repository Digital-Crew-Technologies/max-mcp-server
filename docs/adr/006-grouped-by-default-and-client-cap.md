# ADR-006: Grouped tools by default, and a contract against the client's catalog cap

## Status

Accepted. **Supersedes [ADR-003](./003-grouped-tools-flag.md).**

## Context

ADR-003 introduced `GROUPED_TOOLS=true` to collapse the 19 `linkedin_*` tools
into one, and kept flat mode as the default "for backward compatibility". Two
things were not known when that decision was made.

**1. The flat catalog does not fit in the client's request.**

max-agent merges this server's catalog with two other MCP servers' (GetLeads,
Explorium) and caps the result at 128 tools — OpenAI hard-rejects a Chat
Completions request with more than 128 entries in `tools`, and OpenRouter
surfaces that as an opaque "Provider returned error", so the cap is a hard
requirement, not a tuning knob. Six slots are reserved for max-agent's own local
tools, leaving **122 for MCP tools from all servers combined**.

Flat mode registers **154 tools** in the default configuration. The overflow is
dropped silently, on every turn, ranked by a tier function whose load-bearing
rule is that *a name containing `_` is a droppable flat tool*, then by
registration order. Measured against the real registrars:

| mode | registered | dropped by the client | of which `linkedin_*` |
|---|---|---|---|
| flat (the old default) | 154 | **30** | **19 — all of them** |
| `GROUPED_TOOLS=linkedin` (old `true`) | 136 | 12 | 0 |
| grouped (this ADR) | 25 | **0** | 0 |

So on a default deployment every LinkedIn tool was absent from the model's
catalog — while max-agent's own system prompt still instructed the model to
"call `get_profile`" and "call `find_profile`" for LinkedIn intents
(`src/features/agent/handlers/chat-stream.handler.ts`). LinkedIn is one of Max's
four outreach channels. Nothing failed in CI on either side, because nothing
connected the size of this catalog to the budget the consumer allows it.

**2. Grouping is not a token optimization.**

ADR-003 and `docs/TOOL_REFERENCE.md` claimed grouping buys "~80% fewer schema
tokens". Measured (`pnpm catalog:measure`), it buys approximately nothing:

| mode | tools | `tools/list` bytes | ~tokens |
|---|---|---|---|
| flat | 154 | 133,499 | ~36,081 |
| grouped | 25 | 135,643 | ~36,660 |

A discriminated union still carries **every branch's full schema**. Collapsing
154 tools into 25 removes 129 JSON envelopes and adds 154 `action` literals plus
one object wrapper per branch; the two roughly cancel. The per-action
descriptions likewise move from 154 `description` fields into one long
`Actions:` list, and get slightly *longer* in the process.

Where the weight actually is, in the grouped catalog:

| component | bytes | ~tokens |
|---|---|---|
| JSON schemas | 94,938 (70%) | ~25,659 |
| — of which field-level `.describe()` text | 32,617 | ~8,815 |
| — of which `bearer_token`, repeated per branch | 5,440 | ~1,470 |
| tool descriptions | 39,079 (29%) | ~10,562 |

This matters because none of it is discounted: max-agent's chat model (Kimi K3
via OpenRouter) reports `supports_implicit_caching: false`, so the whole catalog
is charged at full input rate on **every** step, up to 6 steps per turn.

## Decision

**1. Group every domain, and make grouped the default.** Registration is driven
by a table in `features/pilot-tools/mcp/register.ts`. `GROUPED_TOOLS` now
resolves to three modes; an unrecognized value falls back to the safe one rather
than the one that overflows:

| value | mode |
|---|---|
| unset, `true`, `all` | group every domain (**default**) |
| `linkedin` | legacy: group LinkedIn only |
| `false`, `off` | fully flat — does not fit the cap; escape hatch only |

**2. Group via an adapter, not a rewrite.** `mcp/group-adapter.ts` runs a
domain's existing flat registrar against a recorder and re-emits the capture as
one grouped tool. Domain `tools.ts` files are untouched, a newly added tool is
grouped automatically, and flat mode remains the same code path — so the two
modes cannot drift. `docs/tools.json` is byte-identical after this change,
which is the evidence that flat mode still behaves exactly as before.

**3. The action name is the original flat tool name.** `list_chats` becomes
`unibox` with `action: "list_chats"` — not `action: "list"`. Flat names are
already unique, so there are no collisions and no per-domain prefix-stripping
rules to get wrong. LinkedIn is the one exception: it keeps its hand-written
grouped registrar and its short action names (`get_profile`), because
max-agent's LinkedIn fast path calls `linkedin` with `action: "get_profile"`
literally (`src/features/agent/utils/linkedin-chat-orchestration.ts`).

**4. Group names may not contain an underscore.** The client's tier function
reads `_` as "flat, droppable". A group called `prospect_lists` would be
silently droppable and defeat its own purpose. `registerAsGroup` throws on such
a name and a contract test asserts it. This is why the prospect-lists domain is
grouped as `lists`.

**5. Encode the client's budget as a contract test.**
`features/pilot-tools/mcp/client-cap.ts` mirrors max-agent's cap and
`test/contract/tool-inventory.test.ts` fails the build if the default catalog
would not fit — including a headroom test that assumes 40 tools from the other
MCP servers. Adding a tool must never quietly evict another one.

## Consequences

- **Breaking for MCP clients that hard-code tool names.** Under the default,
  `list_chats` is `unibox`/`action: "list_chats"`. Real MCP clients re-list
  tools each session and adapt with no change; only hand-written prompts that
  name a tool need updating. `GROUPED_TOOLS=false` restores the old names, at
  the cost of re-introducing the silent drop.
- **All 30 previously dropped tools are reachable again**, LinkedIn included.
  This is the point of the change.
- **Token cost is unchanged.** Grouping fixes correctness, not cost. Reducing
  the ~36k-token catalog requires not shipping every action's schema on every
  turn — progressive disclosure — which is deliberately out of scope here and
  tracked separately.
- **Annotation granularity is coarser.** A group exposes one set of hints, so
  it is `readOnlyHint` only when every action in it is read-only, and
  `destructiveHint` when any action is destructive. Per-action hints are no
  longer visible to clients in grouped mode.
- **Skill gating in max-agent becomes coarser too.** Its skill patterns match
  tool names by substring; with one tool per domain a skill can no longer gate a
  subset of a domain's actions. Worth re-checking when a skill needs finer
  granularity than a domain.
- `pnpm catalog:measure` reports catalog bytes and runs the same cap check, so
  the cost of adding a tool is visible before it is merged.

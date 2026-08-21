# ADR-003: GROUPED_TOOLS feature flag

## Status

**Superseded by [ADR-006](./006-grouped-by-default-and-client-cap.md).**

The premise below — that flat mode is a safe default, and that grouping is
primarily a schema-token optimization — did not survive measurement. Flat mode
overflows the client's 128-tool cap (30 tools dropped silently, including all 19
`linkedin_*`), and grouping turns out to save essentially no tokens because a
discriminated union still carries every branch's schema. See ADR-006.

## Context

~150 flat MCP tools strain client catalogs and schema token budgets. LinkedIn alone registers 19 actions.

## Decision

`GROUPED_TOOLS=true` collapses LinkedIn into one tool with a Zod `discriminatedUnion` over `action`. Other domains stay flat until validated against production traces.

## Consequences

- Flat mode remains the default for backward compatibility.
- Contract tests assert grouped mode registers fewer tools than flat mode.

# ADR-003: GROUPED_TOOLS feature flag

## Status

Accepted

## Context

~150 flat MCP tools strain client catalogs and schema token budgets. LinkedIn alone registers 19 actions.

## Decision

`GROUPED_TOOLS=true` collapses LinkedIn into one tool with a Zod `discriminatedUnion` over `action`. Other domains stay flat until validated against production traces.

## Consequences

- Flat mode remains the default for backward compatibility.
- Contract tests assert grouped mode registers fewer tools than flat mode.

# ADR-002: Opt-in env token fallback

## Status

Accepted

## Context

`resolveBearerToken` previously fell through to `DIGITALCREW_API_TOKEN`, granting anonymous callers full upstream privilege when the env var was set.

## Decision

Env token fallback requires `ALLOW_ENV_TOKEN_FALLBACK=true`. Default path: tool `bearer_token` → MCP `Authorization` header only.

## Consequences

- Legacy cron/scripts must opt in explicitly until re-tokened.
- Per-tenant authorization upstream is meaningful by default.

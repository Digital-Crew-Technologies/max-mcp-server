# ADR-001: MCP gateway shared-secret authentication

## Status

Accepted

## Context

The MCP endpoint exposes ~150 tools including destructive operations (delete, send email, webhook simulation). There was no inbound authentication.

## Decision

Gate `/mcp` and `/chat` with `middleware.ts` requiring `X-MCP-Gateway-Key` matching `MCP_GATEWAY_SECRET`. Fail closed when the secret is unset (503).

Admin operations use a separate `MCP_ADMIN_GATEWAY_KEY` checked at execution time via `requireAdmin()`.

## Consequences

- All MCP clients must send the gateway key.
- Phase 2 OAuth (`withMcpAuth`) remains a future upgrade for per-user identity.

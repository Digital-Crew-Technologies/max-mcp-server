# `max-mcp-server` Documentation

This server exposes the Digital Crew Max Agent API as a [Model Context Protocol](https://modelcontextprotocol.io) endpoint at `POST /mcp`. It carries **163 callable operations** with all feature flags on (154 with the flag-gated admin tools and webhook simulators off).

By default those operations are exposed as **~25 grouped domain tools** — one per domain, each taking an `action` discriminator (`unibox` with `action: "list_chats"`). Grouping is the default because the flat catalog does not fit in the 128-tool cap max-agent applies to the merged MCP catalog: flat mode overflows it and ~30 tools are dropped silently on every turn. See [ADR-006](adr/006-grouped-by-default-and-client-cap.md); `pnpm catalog:measure` prints the sizes and runs the cap check.

The generated operation inventory lives in [`tools.json`](tools.json) — one row per callable operation, generated in flat mode regardless of the deployed default — and is kept in sync with the code by `npm run docs:check` in CI.

## Documents

| File | Purpose |
|---|---|
| [`tools.json`](tools.json) | Generated tool inventory — the source of truth (`npm run docs:tools`) |
| [`TOOL_REFERENCE.md`](TOOL_REFERENCE.md) | Catalog of every MCP tool — endpoint, scope, description |
| [`ENDPOINT_CHECKLIST.md`](ENDPOINT_CHECKLIST.md) | Master inventory of max-agent endpoints with MCP coverage + verification status (snapshot from the 64-tool era) |
| [`TESTING.md`](TESTING.md) | How to verify each endpoint works; coverage matrix |
| [`TOOL_AUDIT.md`](TOOL_AUDIT.md) | Auto-generated per-tool test report (snapshot; regenerate with `node scripts/audit-endpoints.mjs`) |

## Quick start

```bash
# 1. Install
pnpm install

# 2. Configure
cp .env.example .env.local
# Edit .env.local — set DIGITALCREW_API_BASE_URL and DIGITALCREW_API_TOKEN

# 3. Run
pnpm run dev

# 4. Verify it works
npm run verify -- http://localhost:3000 <BEARER>
```

## Architecture

```
┌──────────────┐    POST /mcp    ┌──────────────────┐    HTTPS    ┌────────────┐
│ MCP client   │ ──────────────▶ │  max-mcp-server  │ ──────────▶ │ max-agent  │
│ (Claude etc) │                 │  (Next.js)       │             │  (API)     │
└──────────────┘                 └──────────────────┘             └────────────┘
                                         │
                                         ├── circuit breaker (per-host)
                                         ├── retry w/ exponential backoff
                                         ├── bounded concurrency (max 8)
                                         ├── dead-letter queue (Redis-backed)
                                         └── structured JSON span logs
```

## Code layout

```
features/pilot-tools/
├── shared.ts                 # apiUrl, authHeaders, buildQuery, callApi, McpServer type
├── http.ts                   # fetchWithRetry — timeout, retry, backoff
├── circuit-breaker.ts        # per-host state machine
├── dead-letter.ts            # Redis-backed failed-write log (in-mem fallback)
├── tracing.ts                # structured JSON span logs to stdout
├── {campaigns,prospects,prospect-lists,organizations,accounts,
│   unibox,ai-agent,apollo,explorium,dashboard,claire,enrichment,
│   intent,inbox,calendar,meetings,tasks,email-analytics,crm,
│   notion,agent-drafts,linkedin,webhooks}/
│   ├── repository.ts         # API call functions
│   ├── schema.ts             # Zod input schemas
│   └── tools.ts              # register*Tools(server)
├── admin/tools.ts            # circuit + dead-letter inspection tools (flag-gated)
└── mcp/register.ts           # orchestrator — wires all domains into server

features/workspace-profile/   # original (pre-pilot) tools, same layout
```

## Environment variables

| Variable | Required? | Purpose |
|---|---|---|
| `DIGITALCREW_API_BASE_URL` | yes | Base URL of max-agent (no trailing slash) |
| `DIGITALCREW_API_TOKEN` | one of these | Service token for max-agent |
| `DIGITALCREW_BEARER_TOKEN` | one of these | Fallback bearer token |
| `Authorization: Bearer …` | per request | Auth header on the MCP request itself |
| `MCP_GATEWAY_SECRET` | yes (prod) | Shared secret checked against `X-MCP-Gateway-Key` on every `/mcp` request; server fails closed (503) when unset |
| `REDIS_URL` | optional | Persistent dead-letter queue + chat rate limit (falls back to in-memory) |
| `OBSERVABILITY` | optional | Set to `off` to silence structured span logs |
| `GROUPED_TOOLS` | optional | `true` collapses the 19 `linkedin_*` tools into one grouped tool |
| `ENABLE_ADMIN_TOOLS` | optional | `true` registers the 3 admin/diagnostic tools (also needs `MCP_ADMIN_GATEWAY_KEY` at request time) |
| `ENABLE_WEBHOOK_SIMULATORS` | optional | `true` registers the 6 Unipile webhook simulator tools |
| `ALLOW_ENV_TOKEN_FALLBACK` | optional | `true` allows falling back to env tokens when the request carries none |
| `OPENROUTER_API_KEY` | only for `/chat` | Not MCP-related; powers a separate chat endpoint |

Token precedence (highest first):
1. Tool argument `bearer_token`
2. `Authorization: Bearer …` header on the MCP request
3. `DIGITALCREW_API_TOKEN` env var
4. `DIGITALCREW_BEARER_TOKEN` env var

## Health check

```bash
npm run verify -- http://localhost:3000
```

If every tool registers with a schema, output ends with `All verifications passed.` and exit code is 0. There is also a public liveness endpoint at `GET /health`. CI runs lint + type-check + build + audit on every push.

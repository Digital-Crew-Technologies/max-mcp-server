# `max-mcp-server` Documentation

This server exposes the Digital Crew Max Agent API as a [Model Context Protocol](https://modelcontextprotocol.io) endpoint at `POST /mcp`. **~154 tools** are registered across ~20 domains. The exact live count is regenerated into the root `README.md` by `pnpm docs:tools`; run that command whenever the tool surface changes.

## Documents

| File | Purpose |
|---|---|
| [`ENDPOINT_CHECKLIST.md`](ENDPOINT_CHECKLIST.md) | Master inventory of all max-agent endpoints with MCP coverage + verification status |
| [`TOOL_REFERENCE.md`](TOOL_REFERENCE.md) | Catalog of every MCP tool — endpoint, scope, description |
| [`TESTING.md`](TESTING.md) | How to verify each endpoint works; coverage matrix |
| [`TOOL_AUDIT.md`](TOOL_AUDIT.md) | Auto-generated per-tool test report (regenerate with `node scripts/audit-endpoints.mjs`) |

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
├── {campaigns,prospects,prospect-lists,organizations,
│   accounts,unibox,ai-agent,apollo,explorium,dashboard}/
│   ├── repository.ts         # API call functions
│   ├── schema.ts             # Zod input schemas
│   └── tools.ts              # register*Tools(server)
├── admin/tools.ts            # circuit + dead-letter inspection tools
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
| `REDIS_URL` | optional | Persistent dead-letter queue (falls back to in-memory) |
| `OBSERVABILITY` | optional | Set to `off` to silence structured span logs |
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

If every registered tool registers with a valid schema, output ends with `All verifications passed.` and exit code is 0. CI runs lint + type-check + build + audit on every push.

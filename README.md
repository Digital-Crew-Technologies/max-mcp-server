# Max MCP Server (Digital Crew)

[MCP](https://modelcontextprotocol.io/) server for **Max**, the AI sales agent from [Digital Crew](https://digitalcrew.tech). Max is built for lead qualification, cold outreach, and pipeline growth—see the product story on [max.digitalcrew.tech](https://max.digitalcrew.tech).

This repo hosts a **Next.js** app that exposes MCP tools over **Streamable HTTP** so Max (or any MCP-capable client) can read and update **workspace profile** settings against the Digital Crew backend API.

## What it does

The server registers tools that proxy to Digital Crew’s workspace profile API (`/api/v1/workspace-profile-settings`):

| Tool | Purpose |
|------|--------|
| `get_workspace_profile` | Fetch workspace profile (company info) for the authenticated workspace |
| `update_workspace_profile` | Create or update workspace profile (PUT upsert) |

Tool definitions and validation use **Zod** (`features/workspace-profile/mcp/schema.ts`). Registration lives under `features/workspace-profile/mcp/`.

## Requirements

- **Node.js** (see Next.js 15 requirements)
- **pnpm** (see `packageManager` in `package.json`)

## Configuration

Set these environment variables (e.g. in `.env.local` for local dev, or in your host’s env for production):

| Variable | Required | Description |
|----------|----------|-------------|
| `DIGITALCREW_API_BASE_URL` | Yes | Base URL of the Digital Crew API (no trailing slash) |
| `DIGITALCREW_API_TOKEN` or `DIGITALCREW_BEARER_TOKEN` | Optional* | Default Bearer token for API calls |

\*If you omit these, callers must supply auth per request: **`Authorization: Bearer <token>`** on the MCP HTTP request, or the optional `bearer_token` argument on a tool call. Precedence is: tool `bearer_token` → MCP `Authorization` → env.

## Getting started

```sh
pnpm install
# Create .env.local with DIGITALCREW_API_BASE_URL (and optional token vars)

pnpm dev
```

The MCP endpoint is:

- **Local:** `http://localhost:3000/mcp`
- **Production:** `https://<your-deployment>/mcp`

Point your MCP client at that URL using **Streamable HTTP** transport.

### Optional: smoke-test with the bundled script

`scripts/test-streamable-http-client.mjs` lists tools via Streamable HTTP. It expects the [`@modelcontextprotocol/sdk`](https://www.npmjs.com/package/@modelcontextprotocol/sdk) client package available in your environment (install it if the script is not runnable yet):

```sh
node scripts/test-streamable-http-client.mjs http://localhost:3000
```

> **Note:** SSE is currently disabled in `app/mcp/route.ts` (`disableSse: true`). The older `scripts/test-client.mjs` (SSE) is not aligned with the default setup unless you enable SSE and Redis per Vercel’s MCP pattern.

## Stack

- [Next.js](https://nextjs.org/) App Router
- [`mcp-handler`](https://www.npmjs.com/package/mcp-handler) (Vercel MCP adapter)
- [Zod](https://zod.dev/) for tool input schemas

## Deploying on Vercel

- Enable [Fluid compute](https://vercel.com/docs/functions/fluid-compute) for efficient execution.
- Adjust `maxDuration` in `app/mcp/route.ts` if your plan allows (e.g. up to 800s on Pro/Enterprise).
- **SSE:** If you switch `disableSse` to `false`, attach **Redis** and set `REDIS_URL` as required by the adapter. See also the [Next.js MCP template](https://vercel.com/templates/next.js/model-context-protocol-mcp-with-next-js).

## Learn more

- [Digital Crew](https://digitalcrew.tech) — AI workforce platform  
- [Max — Outreach control center](https://max.digitalcrew.tech) — Max product site  
- [Model Context Protocol](https://modelcontextprotocol.io/) — MCP specification  

## License

Private project (`"private": true` in `package.json`). Use and deployment are governed by your Digital Crew agreements.

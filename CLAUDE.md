# CLAUDE.md — max-mcp-server

## The repository
- MCP server (Streamable HTTP) that exposes Digital Crew's Max Agent API as MCP tools. Routes: `app/mcp/route.ts` (MCP, SSE disabled), `app/chat/route.ts`, `app/health/route.ts`.
- Stack: Next.js 15 (App Router, `output: "standalone"`), `mcp-handler`, Zod 3, strict TypeScript, Vitest. Import alias `@/*` points to the root.
- Package manager: pnpm 8.15.7, pinned by `packageManager` (lockfile v6). Use neither npm nor another pnpm version to change `pnpm-lock.yaml`.
- Node: no `.nvmrc` and no `engines`. CI runs on Node 20.
- Deployment: Vercel Git integration (preview on PR, production on merge to main). CI only blocks.

## Commands (package.json)
- Install: `pnpm install` (CI runs `pnpm install --frozen-lockfile`).
- Dev: `pnpm dev`. Lint: `pnpm lint`. Typecheck: `pnpm type-check` (there is no `typecheck` script).
- Tests: `pnpm test` (vitest run), `pnpm test:watch`.
- Tool inventory: `pnpm docs:check` (checks), `pnpm docs:tools` (regenerates).
- Build: `pnpm build` (`postbuild` runs `scripts/copy-standalone-assets.mjs`).
- Catalog size and cap check: `pnpm catalog:measure`.
- No `test:security` script and no format script.
- CI order (`.github/workflows/ci.yml`, job `legacy`, required check `Lint · Type-check · Test · Build`): lint, type-check, test, docs:check, build, presence of `.next/standalone/server.js`, `pnpm audit` (advisory only).
- Kit CI and security gates (KIT-02.6): `ci.yml` job `ci` and `security.yml` call the MANAGED inline copies `kit-ci-node.yml` and `kit-security.yml` of digitalcrew-agent-kit `v0.1.0` (checks `ci / ci-gate` and `security / security-gate`). Do not edit the copies by hand; copy a newer kit tag instead.
- `pnpm verify` and `pnpm test:endpoints` need a running server. `verify` without a bearer token lists the tools but skips the real calls; `test:endpoints` requires a token and creates and deletes real resources: do not run it without human approval.

## Structure
- `app/`: Next.js routes (`mcp`, `chat`, `health`).
- `middleware.ts` (+ `middleware.test.ts`): authentication gateway in front of `/mcp` and `/chat`.
- `features/pilot-tools/<domain>/`: one domain per folder, usually `tools.ts` (registration), `schema.ts` (Zod), `repository.ts` (API calls), `tools.test.ts`.
- `features/pilot-tools/mcp/register.ts`: registration entry point and the `GROUPS` list (one grouped tool per domain).
- `features/pilot-tools/shared.ts`, `http.ts`, `circuit-breaker.ts`, `dead-letter.ts`: HTTP client, retries, circuit breaker, dead-letter queue.
- `features/workspace-profile/`: workspace profile tools.
- `shared/auth/`, `shared/http/`: Max API keys, gateway scope, Digital Crew client, chat rate limit.
- `test/contract/`: contract tests (inventory, catalog cap, published schemas).
- `docs/`: `tools.json` (generated), tool reference, ADRs in `docs/adr/`. `scripts/`: docs generator and manual test scripts.

## Rules
- Adding, renaming or removing a tool: run `pnpm docs:tools` and commit `docs/tools.json` and the README table (between `<!-- TOOLS:START -->` and `<!-- TOOLS:END -->`). Do not edit these two outputs by hand: `docs:check` fails CI when they drift.
- Grouped mode is the default (`GROUPED_TOOLS` unset). A grouped tool name must not contain `_`. The default catalog must fit in 122 tools (`MCP_TOOL_BUDGET`, `features/pilot-tools/mcp/client-cap.ts`). `test/contract/tool-inventory.test.ts` checks it. See ADR-006.
- Input schemas must stay visible once published by the MCP SDK (`test/contract/published-schema.test.ts`). After a schema change, check that this test passes.
- Sensitive tools sit behind a flag, off by default: purchases (`ENABLE_PURCHASE_TOOLS`), admin (`ENABLE_ADMIN_TOOLS`), webhook simulators (`ENABLE_WEBHOOK_SIMULATORS`). Do not remove these safeguards and do not turn them on by default.
- Authentication: a bearer token per request. The fallback to an environment token is only active when `ALLOW_ENV_TOKEN_FALLBACK=true` (ADR-002). Do not make it a default.
- `.env.example`: variable names with empty or dummy values only. Never a real secret, nor a hard-coded production URL in the code.
- Add or adapt the tests (`*.test.ts` next to the code) with every change.
- No migrations and no i18n folder in this repository.

## Git flow
- Branch `claude/<card-key>-<keyword>`, created from `main`. PR to `main` (the default branch), with human review.
- Never push to `main` or `develop`, never merge, never force-push.
- Before pushing: `pnpm lint`, `pnpm type-check`, `pnpm test` and `pnpm docs:check` (what CI runs).

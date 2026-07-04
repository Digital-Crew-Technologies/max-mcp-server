# MCP Server Testing Guide

This server exposes **64 MCP tools** wrapping the Digital Crew Max Agent API. This document explains how to verify each tool works, what's covered, and what isn't.

---

## TL;DR

```bash
# Smoke test (10 seconds, no token needed — registration + schemas only)
npm run verify -- http://localhost:3000

# Full live smoke test with read probes (needs bearer token)
npm run verify -- http://localhost:3000 <BEARER>

# Lifecycle integration test (create → update → delete → cleanup)
npm run test:endpoints -- http://localhost:3000 <BEARER>

# Same plus campaign state-machine
npm run test:endpoints -- http://localhost:3000 <BEARER> --include-launches

# Generate a per-tool audit report into docs/TOOL_AUDIT.md
node scripts/audit-endpoints.mjs http://localhost:3000 <BEARER>
```

---

## Three layers of testing

| Layer | Script | What it does | When to run |
|---|---|---|---|
| **Smoke** | `scripts/verify-tools.mjs` | Boots the MCP, lists all tools, validates schemas, runs 8 read probes | Every change |
| **Lifecycle** | `scripts/test-endpoints.mjs` | Creates real test resources, exercises every write tool, deletes everything | Before release |
| **Audit** | `scripts/audit-endpoints.mjs` | One-shot per-tool call, writes markdown report to `docs/TOOL_AUDIT.md` | When you need an inventory |

---

## Coverage matrix

### ✓ Tools tested live (22 read probes + 26 lifecycle write tests = 48 endpoints verified)

| Category | Read tools | Write/lifecycle tools |
|---|---|---|
| Workspace | `get_workspace_profile` | — |
| Campaigns | `list_campaigns`, `get_campaign`, `get_campaign_stats`, `get_campaign_lead_analytics`, `get_campaign_node_run_counts` | `create_campaign`, `update_campaign`, `archive_campaign`, `restore_campaign`, `delete_campaign` (plus negative-test that `launch_campaign` correctly rejects without `workflow_config`) |
| Prospects | `list_prospects`, `get_prospect`, `get_prospect_campaign_activity` | `create_prospect`, `update_prospect`, `delete_prospect`, `bulk_import_prospects`, `bulk_delete_prospects` |
| Prospect Lists | `list_prospect_lists`, `get_prospect_list`, `list_prospect_list_members`, `search_prospect_lists` | `create_prospect_list`, `update_prospect_list`, `delete_prospect_list`, `add_prospects_to_list`, `remove_prospects_from_list` |
| Organizations | `list_organizations`, `get_organization` | `create_organization`, `update_organization`, `delete_organization` |
| Accounts | `list_accounts`, `get_account`, `get_account_rate_limits` | — |
| Unibox | `list_chats` | — (no test chats available) |
| Dashboard | `get_dashboard_kpis` | — |
| Admin | `get_circuit_status`, `list_failed_requests` | — |

### - Tools intentionally skipped

| Category | Tool | Reason |
|---|---|---|
| destructive | `update_workspace_profile` | Would overwrite real workspace settings |
| destructive | `update_account` | Would overwrite real account config |
| destructive | `disconnect_account` | Would disconnect a real connected LinkedIn/email account |
| destructive | `update_account_rate_limit` | Would change real sending caps |
| destructive | `update_chat` | Would change real chat metadata |
| destructive | `archive_chat` | Would archive a real chat |
| destructive | `clear_failed_requests` | Wipes the dead-letter queue |
| sending | `send_chat_message` | Would send a real message to a real recipient |
| sending | `launch_campaign` | Would start real outreach (also blocked by `workflow_config` requirement) |
| billing | `generate_workflow` | Charges credits per invocation |
| billing | `generate_message_preview` | Charges credits per invocation |
| billing | `apollo_create_list` | Charges credits + creates real Apollo data |
| billing | `apollo_add_more` | Charges credits per lead |
| billing | `explorium_create_list` | Charges credits + creates real Explorium data |
| billing | `explorium_add_more` | Charges credits per lead |
| state | `pause_campaign`, `resume_campaign`, `stop_campaign` | Require an actually-launched campaign with a valid `workflow_config` |
| external | `wait_for_prospect_list` | Requires an Apollo list in `pending` state |
| external | `hosted_auth_link` | Returns `401` with the pilot API key (requires `accounts:write` scope) |

### How to manually test the skipped ones

| Tool | How to verify manually |
|---|---|
| `update_workspace_profile` | Call with all current fields (read first via `get_workspace_profile`), confirm the update applied and revert |
| `update_account` | Call against a test account you own; confirm `get_account` reflects the new config |
| `disconnect_account` | Run on a test account; verify `list_accounts` no longer returns it |
| `update_account_rate_limit` | Bump a daily cap by 1, confirm `get_account_rate_limits`, revert |
| `update_chat` | Toggle `is_archived: true/false` on a test chat, confirm round-trip |
| `archive_chat` | Run on a test chat, confirm with `list_chats { archived: true }` |
| `send_chat_message` | Reply in a chat with a connected account; verify with `list_chat_messages` |
| `launch_campaign` | Create a campaign with a real `workflow_config` (use `generate_workflow` or copy from the web UI), then launch |
| `generate_workflow` | Pass a short prompt; verify response has `workflow_config`, `campaign_name`, `campaign_description` |
| `generate_message_preview` | Pass `channel: "linkedin_message"` and a real prospect ID; expect `{ message }` |
| `apollo_create_list` | Pass a valid Apollo `mixed_people/search` payload; poll with `wait_for_prospect_list` |
| `explorium_create_list` | Pass a valid `explorium_search_criteria` object (e.g. `{ job_level: ["cxo"], country_code: ["us"], has_email: true }`); poll with `wait_for_prospect_list` |
| `hosted_auth_link` | Requires `accounts:write` scope on the bearer token (workspace API key) |

---

## Known issues found during testing

These are bugs in `max-agent` (the upstream API), not the MCP server. The MCP forwards what the API returns; the tests work around these but they should be fixed upstream.

### 1. `GET /api/v1/campaigns/{bad-uuid}` returns 500 instead of 404

**Severity:** Low (cosmetic — clients can still treat it as "not found", but it pollutes 5xx error metrics).

**Reproduction:** Call `get_campaign { id: "00000000-0000-0000-0000-000000000000" }`. Expected: `404 Not Found`. Actual: `500 Cannot coerce the result to a single JSON object`.

**Probable cause:** The route handler is using `.single()` on a Postgres query that returns no rows, instead of `.maybeSingle()` or a presence check.

**Fix location:** `max-agent` `app/api/v1/campaigns/[id]/route.ts` (and likely similar route files for other resources — worth a sweep).

### 2. `PATCH /api/v1/organizations/{id}` requires `name` field

**Severity:** Low (workaround exists — always send `name`).

**Reproduction:** Call `update_organization { id, industry: "X" }` without `name`. Expected: 200 with updated industry. Actual: `400 Required: name`.

**Probable cause:** The Zod validator for the PATCH route requires `name` even though PATCH should accept partial bodies.

**Fix location:** `max-agent` `app/api/v1/organizations/[id]/route.ts` — make the body schema `.partial()`.

---

## Last test run

| Date | Tier 1 (smoke) | Tier 2 (lifecycle) | Tier 3 (audit) |
|---|---|---|---|
| 2026-05-27 | 63/63 register · 8/8 probes pass | 48 pass · 0 fail · 2 skip | 22 pass · 1 fail (`hosted_auth_link` scope) · 40 intentional skips |

See [`TOOL_AUDIT.md`](TOOL_AUDIT.md) for the full per-tool breakdown.

---

## Running tests against a deployed server

```bash
node scripts/verify-tools.mjs https://your-mcp.example.com <BEARER>
node scripts/test-endpoints.mjs https://your-mcp.example.com <BEARER> --include-launches
```

The scripts work against any URL that exposes the MCP at `/mcp`.

# MCP Tool Reference

Complete catalog of all **63 MCP tools** exposed by `max-mcp-server`. Each entry includes the underlying HTTP endpoint, required scope, key inputs, and a one-line description.

Every tool accepts an optional `bearer_token` argument that overrides the bearer extracted from the MCP request or environment.

---

## Authentication scopes

The Max API recognizes two auth types and a set of fine-grained scopes:

| Auth | Format | Used by |
|---|---|---|
| Workspace API key | `max_live_...` | Server-to-server, agents |
| Supabase JWT | three dot-separated segments | Web app users |

| Scope | Tools |
|---|---|
| `campaigns:read` | list/get campaign, stats, lead-analytics, node-run-counts |
| `campaigns:write` | create/update/delete/launch/pause/resume/stop/archive/restore |
| `prospects:read` | list/get prospect, campaign-activity |
| `prospects:write` | create/update/delete, bulk-import, bulk-delete |
| `prospect-lists:read` | list/get list, list-members, search |
| `prospect-lists:write` | create/update/delete, add/remove members, csv-import, Apollo |
| `organizations:read` | list/get org |
| `organizations:write` | create/update/delete, bulk-import, bulk-delete |
| `accounts:read` | list/get account, rate-limits |
| `accounts:write` | update, disconnect, rate-limit, hosted-auth-link |
| `unibox:read` | list chats, list messages, get chat |
| `unibox:write` | update chat, archive chat, send message |
| `dashboard:read` | dashboard kpis |
| `workspace:read` / `workspace:write` | workspace profile |
| _(AI agent uses op-dependent scopes; charges credits)_ | generate_workflow, generate_message_preview |
| _(JWT-only — workspace API keys rejected)_ | billing, notifications, api-keys |

---

## Workspace (2)

| Tool | HTTP | Scope | Description |
|---|---|---|---|
| `get_workspace_profile` | `GET /api/v1/workspace-profile-settings` | `workspace:read` | Fetch company profile used for AI personalization |
| `update_workspace_profile` | `PUT /api/v1/workspace-profile-settings` | `workspace:write` | Upsert the company profile (all fields required) |

---

## Campaigns (14)

| Tool | HTTP | Scope | Description |
|---|---|---|---|
| `list_campaigns` | `GET /api/v1/campaigns` | `campaigns:read` | List campaigns with pagination, status filter, search, sort |
| `get_campaign` | `GET /api/v1/campaigns/:id` | `campaigns:read` | Full campaign details — workflow, accounts, lists, stats |
| `create_campaign` | `POST /api/v1/campaigns` | `campaigns:write` | Create a draft campaign — requires `included_lists` + `accounts` |
| `update_campaign` | `PATCH /api/v1/campaigns/:id` | `campaigns:write` | Partial update — name, description, workflow, lists, accounts |
| `delete_campaign` | `DELETE /api/v1/campaigns/:id` | `campaigns:write` | Hard delete (prefer `archive_campaign` for soft delete) |
| `launch_campaign` | `POST /api/v1/campaigns/:id/launch` | `campaigns:write` | Draft → active. Requires valid `workflow_config` |
| `pause_campaign` | `PATCH /api/v1/campaigns/:id/pause` | `campaigns:write` | Active → paused |
| `resume_campaign` | `PATCH /api/v1/campaigns/:id/resume` | `campaigns:write` | Paused → active |
| `stop_campaign` | `PATCH /api/v1/campaigns/:id/stop` | `campaigns:write` | Active/paused → stopped (cannot resume) |
| `archive_campaign` | `PATCH /api/v1/campaigns/:id/archive` | `campaigns:write` | Any → archived (soft delete) |
| `restore_campaign` | `PATCH /api/v1/campaigns/:id/restore` | `campaigns:write` | Archived → draft |
| `get_campaign_stats` | `GET /api/v1/campaigns/:id/stats` | `campaigns:read` | Aggregate counters — sent/opened/replied per channel |
| `get_campaign_lead_analytics` | `GET /api/v1/campaigns/:id/lead-analytics` | `campaigns:read` | Per-prospect message-event timeline |
| `get_campaign_node_run_counts` | `GET /api/v1/campaigns/:id/node-run-counts` | `campaigns:read` | Workflow-node execution counts for funnel viz |

---

## Prospects (8)

| Tool | HTTP | Scope | Description |
|---|---|---|---|
| `list_prospects` | `GET /api/v1/prospects` | `prospects:read` | Rich filtering — name, email, title, org, country, industry |
| `get_prospect` | `GET /api/v1/prospects/:id` | `prospects:read` | Full profile + enrichment data |
| `create_prospect` | `POST /api/v1/prospects` | `prospects:write` | Single prospect — dedupes by email |
| `update_prospect` | `PATCH /api/v1/prospects/:id` | `prospects:write` | Partial update |
| `delete_prospect` | `DELETE /api/v1/prospects/:id` | `prospects:write` | Hard delete |
| `bulk_import_prospects` | `POST /api/v1/prospects/bulk-import` | `prospects:write` | Atomic batch with dedup; returns `{imported, existing, failed, total}` |
| `bulk_delete_prospects` | `POST /api/v1/prospects/bulk-delete` | `prospects:write` | Atomic batch delete by IDs |
| `get_prospect_campaign_activity` | `GET /api/v1/prospects/:id/campaign-activity` | `prospects:read` | Chronological message-event log across all campaigns |

---

## Prospect Lists (11)

| Tool | HTTP | Scope | Description |
|---|---|---|---|
| `list_prospect_lists` | `GET /api/v1/prospect-lists` | `prospect-lists:read` | List all lists with status |
| `get_prospect_list` | `GET /api/v1/prospect-lists/:id` | `prospect-lists:read` | Full list details |
| `create_prospect_list` | `POST /api/v1/prospect-lists` | `prospect-lists:write` | Empty platform list (use `apollo_create_list` for Apollo-sourced) |
| `update_prospect_list` | `PATCH /api/v1/prospect-lists/:id` | `prospect-lists:write` | Update `list_name` or `status` |
| `delete_prospect_list` | `DELETE /api/v1/prospect-lists/:id` | `prospect-lists:write` | Delete the list (prospects unaffected) |
| `list_prospect_list_members` | `GET /api/v1/prospect-lists/:id/prospects` | `prospect-lists:read` | Paginated list members with sort/filter |
| `add_prospects_to_list` | `POST /api/v1/prospect-lists/:id/prospects` | `prospect-lists:write` | Add prospects by UUIDs |
| `remove_prospects_from_list` | `DELETE /api/v1/prospect-lists/:id/prospects` | `prospect-lists:write` | Remove prospects by UUIDs |
| `search_prospect_lists` | `POST /api/v1/prospect-lists/search` | `prospect-lists:read` | Preview prospects matching filters without creating a list |
| `import_prospect_list_csv` | `POST /api/v1/prospect-lists/import-csv` | `prospect-lists:write` | Create a list and import rows in one call (email required) |
| `wait_for_prospect_list` | _(client-side polling)_ | `prospect-lists:read` | Polls `get_prospect_list` until terminal status — pairs with `apollo_create_list` |

---

## Organizations (7)

| Tool | HTTP | Scope | Description |
|---|---|---|---|
| `list_organizations` | `GET /api/v1/organizations` | `organizations:read` | Filter by industry/country, search by name/domain |
| `get_organization` | `GET /api/v1/organizations/:id` | `organizations:read` | Full company details + enrichment |
| `create_organization` | `POST /api/v1/organizations` | `organizations:write` | Dedupes by domain |
| `update_organization` | `PATCH /api/v1/organizations/:id` | `organizations:write` | Partial update _(currently requires `name` — known max-agent bug)_ |
| `delete_organization` | `DELETE /api/v1/organizations/:id` | `organizations:write` | Linked prospects get `organization_id: null` |
| `bulk_import_organizations` | `POST /api/v1/organizations/bulk-import` | `organizations:write` | Atomic batch with domain dedup |
| `bulk_delete_organizations` | `POST /api/v1/organizations/bulk-delete` | `organizations:write` | Optional `deleteProspects: true` to cascade-delete linked prospects |

---

## Accounts (7)

| Tool | HTTP | Scope | Description |
|---|---|---|---|
| `list_accounts` | `GET /api/v1/accounts` | `accounts:read` | List connected LinkedIn + email accounts |
| `get_account` | `GET /api/v1/accounts/:id` | `accounts:read` | Provider, channel, config, sync status |
| `update_account` | `PATCH /api/v1/accounts/:id` | `accounts:write` | Update sender name, timezone, working hours |
| `disconnect_account` | `DELETE /api/v1/accounts?account_id=:id` | `accounts:write` | Revoke Unipile connection; reconnect via `hosted_auth_link` |
| `get_account_rate_limits` | `GET /api/v1/accounts/:id/rate-limits` | `accounts:read` | Per-action-type daily/weekly caps + current counts |
| `update_account_rate_limit` | `PATCH /api/v1/account-rate-limits/:id` | `accounts:write` | Bump or lower daily/weekly cap on one rate-limit row |
| `hosted_auth_link` | `POST /api/v1/unipile/hosted-auth/link` | `accounts:write` | Generate Unipile hosted-auth URL for user to (re)connect an account |

---

## Unibox (6)

| Tool | HTTP | Scope | Description |
|---|---|---|---|
| `list_chats` | `GET /api/v1/unibox/chats` | `unibox:read` | All threads — filter by channel, prospect, account, archived |
| `get_chat` | `GET /api/v1/unibox/chats/:id` | `unibox:read` | Chat metadata |
| `update_chat` | `PATCH /api/v1/unibox/chats/:id` | `unibox:write` | Title, read state, archived, prospect link |
| `archive_chat` | `DELETE /api/v1/unibox/chats/:id` | `unibox:write` | Soft delete (messages preserved) |
| `list_chat_messages` | `GET /api/v1/unibox/chats/:id/messages` | `unibox:read` | Message list with direction (in/out) and status |
| `send_chat_message` | `POST /api/v1/unibox/chats/:id/messages` | `unibox:write` | Send manual reply — channel inferred from chat |

---

## AI Agent (2)

| Tool | HTTP | Scope | Description |
|---|---|---|---|
| `generate_workflow` | `POST /api/v1/ai-agent/generate-workflow` | _credits_ | Generate a complete campaign workflow from natural language |
| `generate_message_preview` | `POST /api/v1/ai-agent/generate-message-preview` | _credits_ | Generate a personalized message for one prospect on one channel |

Both charge credits. Check balance with `get_workspace_balance` (JWT-only). On `402`, body contains `{ details: { required, balance } }`.

---

## Apollo (2)

| Tool | HTTP | Scope | Description |
|---|---|---|---|
| `apollo_create_list` | `POST /api/v1/apollo/people/create-list` | `prospect-lists:write` + _credits_ | Async Apollo people-search → list ingestion. Auto-injects `idempotency_key` if not provided |
| `apollo_add_more` | `POST /api/v1/apollo/people/add-more` | `prospect-lists:write` + _credits_ | Append leads to an existing Apollo list |

Both are async — poll the resulting list's status (or use `wait_for_prospect_list`).

---

## Dashboard (1)

| Tool | HTTP | Scope | Description |
|---|---|---|---|
| `get_dashboard_kpis` | `GET /api/v1/dashboard/kpis` | `dashboard:read` | Workspace-wide aggregate stats — execution counts, channel rates, completion % |

---

## Admin / Diagnostics (3, MCP-only)

These are local to the MCP server and don't call the Max API.

| Tool | Description |
|---|---|
| `get_circuit_status` | Per-host circuit-breaker state — closed/open/half-open, failure count |
| `list_failed_requests` | Inspect the dead-letter queue of permanently-failed write requests |
| `clear_failed_requests` | Drain the dead-letter queue |

---

## HTTP status codes

| Code | Meaning | Common cause |
|---|---|---|
| `200` | Success | — |
| `201` | Created | `create_*` tools |
| `400` | Bad request | Invalid body / missing required field |
| `401` | Auth failed | Bad/expired token |
| `402` | Insufficient credits | AI agent / Apollo tools when balance is 0 |
| `403` | Missing scope | Body has `requiredScope` field |
| `404` | Not found | Bad UUID — _(except `get_campaign` returns 500, known bug)_ |
| `409` | State conflict | e.g. launch an already-active campaign |
| `422` | Semantically invalid | e.g. workflow with broken edges |
| `429` | Rate limited | Reserved; not currently emitted |
| `500` | Server error | Bug in max-agent |
| `502` | Upstream provider down | Unipile / Apollo unreachable |
| `503` | Feature disabled | — |
| `504` | Upstream timeout | Provider slow |

The MCP retry layer automatically retries `429`, `502` (safe methods only), `503`, `504`, and network errors with jittered exponential backoff (3 attempts, capped at 8s). Permanently-failed writes land in the dead-letter queue.

---

## Response envelope

| Operation type | Shape |
|---|---|
| Single resource | `{ "data": { ... } }` |
| Paginated list | `{ "data": [...], "count": N, "page": 1, "pageSize": 20 }` |
| State transition | `{ "message": "...", "campaign": {...} }` |
| Bulk operation | `{ "success": true, "imported": N, "existing": N, "failed": N, "total": N }` |
| Error | `{ "error": "...", "details": {...} }` (403 also includes `requiredScope`) |

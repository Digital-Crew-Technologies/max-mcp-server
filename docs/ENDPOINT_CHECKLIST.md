# Master Endpoint Checklist

The complete inventory of max-agent endpoints with current MCP server coverage status. Used as the source of truth for "what's exposed vs what's still on the API but not exposed."

**Legend**
- ✅ — exposed as MCP tool **and** verified working against live API
- 🟡 — exposed as MCP tool but **not yet live-verified** (registration + schema only)
- ⛔ — exists in API but **not exposed** as MCP tool (with reason)
- ❓ — discrepancy or open question against this checklist

Last verified: 2026-05-27.

---

## SYSTEM & HEALTH

| Method | Endpoint | Description | MCP Tool | Status |
|---|---|---|---|---|
| GET | `/api/health` | max-agent liveness + DB/Apollo/Unipile connection check | — | ⛔ Not exposed. Recommend adding as `health_check` tool. |

## ACCOUNTS

| Method | Endpoint | Description | MCP Tool | Status |
|---|---|---|---|---|
| GET | `/api/v1/accounts` | List workspace accounts | `list_accounts` | ✅ |
| GET | `/api/v1/accounts/{id}` | Get one account | `get_account` | ✅ |
| GET | `/api/v1/accounts/{id}/rate-limits` | Account daily/weekly caps | `get_account_rate_limits` | ✅ |
| PATCH | `/api/v1/accounts/{id}` | Update account config | `update_account` | 🟡 Skipped in tests (destructive) |
| DELETE | `/api/v1/accounts?account_id=` | Disconnect | `disconnect_account` | 🟡 Skipped in tests (destructive) |
| PATCH | `/api/v1/account-rate-limits/{id}` | Update rate limit row | `update_account_rate_limit` | 🟡 Skipped in tests (destructive) |

## API KEYS (JWT-only)

| Method | Endpoint | Description | MCP Tool | Status |
|---|---|---|---|---|
| GET | `/api/v1/api-keys` | List API keys | — | ⛔ JWT-only — workspace API keys are rejected. Need JWT auth path. |
| GET | `/api/v1/api-keys/{id}` | Get one key | — | ⛔ JWT-only |
| POST | `/api/v1/api-keys` | Create key (secret returned once) | — | ⛔ JWT-only |
| DELETE | `/api/v1/api-keys/{id}` | Revoke key | — | ⛔ JWT-only |

## CAMPAIGNS

| Method | Endpoint | Description | MCP Tool | Status |
|---|---|---|---|---|
| GET | `/api/v1/campaigns` | List campaigns | `list_campaigns` | ✅ |
| POST | `/api/v1/campaigns` | Create campaign | `create_campaign` | ✅ |
| GET | `/api/v1/campaigns/{id}` | Get campaign | `get_campaign` | ✅ ❓ Returns 500 on bad UUID instead of 404 (max-agent bug) |
| PATCH | `/api/v1/campaigns/{id}` | Update campaign | `update_campaign` | ✅ |
| DELETE | `/api/v1/campaigns/{id}` | Delete campaign | `delete_campaign` | ✅ |
| POST | `/api/v1/campaigns/{id}/launch` | Launch | `launch_campaign` | 🟡 ❓ Checklist says POST; my MCP uses POST too ✓. Requires valid `workflow_config`. |
| POST/PATCH | `/api/v1/campaigns/{id}/pause` | Pause | `pause_campaign` | 🟡 ❓ Checklist says POST; my MCP uses **PATCH** per OpenAPI spec. **Verify which is correct in max-agent.** |
| POST/PATCH | `/api/v1/campaigns/{id}/resume` | Resume | `resume_campaign` | 🟡 ❓ Same method discrepancy as pause. |
| POST/PATCH | `/api/v1/campaigns/{id}/stop` | Stop | `stop_campaign` | 🟡 ❓ Same. |
| POST/PATCH | `/api/v1/campaigns/{id}/archive` | Archive | `archive_campaign` | ✅ (works as PATCH) |
| POST/PATCH | `/api/v1/campaigns/{id}/restore` | Restore | `restore_campaign` | ✅ (works as PATCH) |
| GET | `/api/v1/campaigns/{id}/stats` | Aggregate stats | `get_campaign_stats` | ✅ |
| GET | `/api/v1/campaigns/{id}/lead-analytics` | Per-prospect timeline | `get_campaign_lead_analytics` | ✅ |
| GET | `/api/v1/campaigns/{id}/node-run-counts` | Funnel viz counts | `get_campaign_node_run_counts` | ✅ |

## PROSPECTS

| Method | Endpoint | Description | MCP Tool | Status |
|---|---|---|---|---|
| GET | `/api/v1/prospects` | List prospects | `list_prospects` | ✅ |
| POST | `/api/v1/prospects` | Create single | `create_prospect` | ✅ |
| GET | `/api/v1/prospects/{id}` | Get one | `get_prospect` | ✅ |
| PATCH | `/api/v1/prospects/{id}` | Update | `update_prospect` | ✅ |
| DELETE | `/api/v1/prospects/{id}` | Delete | `delete_prospect` | ✅ |
| GET | `/api/v1/prospects/{id}/campaign-activity` | Activity timeline | `get_prospect_campaign_activity` | ✅ |
| POST | `/api/v1/prospects/bulk-delete` | Batch delete | `bulk_delete_prospects` | ✅ |
| POST | `/api/v1/prospects/bulk-import` | Batch import | `bulk_import_prospects` | ✅ |

## PROSPECT LISTS

| Method | Endpoint | Description | MCP Tool | Status |
|---|---|---|---|---|
| GET | `/api/v1/prospect-lists` | List | `list_prospect_lists` | ✅ |
| POST | `/api/v1/prospect-lists` | Create | `create_prospect_list` | ✅ |
| GET | `/api/v1/prospect-lists/{id}` | Get one | `get_prospect_list` | ✅ |
| PATCH | `/api/v1/prospect-lists/{id}` | Update | `update_prospect_list` | ✅ |
| DELETE | `/api/v1/prospect-lists/{id}` | Delete | `delete_prospect_list` | ✅ |
| GET | `/api/v1/prospect-lists/{id}/prospects` | List members | `list_prospect_list_members` | ✅ |
| POST | `/api/v1/prospect-lists/{id}/prospects` | Add members | `add_prospects_to_list` | ✅ |
| DELETE | `/api/v1/prospect-lists/{id}/prospects` | Remove members | `remove_prospects_from_list` | ✅ |
| POST | `/api/v1/prospect-lists/import-csv` | CSV import | `import_prospect_list_csv` | 🟡 Not live-tested |
| GET/POST | `/api/v1/prospect-lists/search` | Preview filter results | `search_prospect_lists` | ✅ ❓ Checklist says GET; my MCP uses **POST** per OpenAPI spec (filter body in JSON). **Verify in max-agent.** |

## APOLLO

| Method | Endpoint | Description | MCP Tool | Status |
|---|---|---|---|---|
| POST | `/api/v1/apollo/people/create-list` | Async create from Apollo search | `apollo_create_list` | 🟡 Not tested (charges credits). MCP wraps + auto-injects `idempotency_key`. |
| POST | `/api/v1/apollo/people/add-more` | Append to existing list | `apollo_add_more` | 🟡 Not tested (charges credits) |
| POST | `/api/v1/apollo/cron/process-pending` | Process pending Apollo jobs | — | ⛔ Internal cron. Not appropriate as agent tool unless we want a manual "kick the queue" admin tool. |
| GET | `/api/v1/billing/apollo-search-quote` | Cost quote before search | — | ⛔ JWT-only |

## EXPLORIUM

| Method | Endpoint | Description | MCP Tool | Status |
|---|---|---|---|---|
| POST | `/api/v1/explorium/people/create-list` | Async create from Explorium search | `explorium_create_list` | 🟡 Not tested (charges credits). MCP wraps + auto-injects `idempotency_key`. |
| POST | `/api/v1/explorium/people/add-more` | Append to existing list | `explorium_add_more` | 🟡 Not tested (charges credits) |
| POST | `/api/v1/explorium/cron/process-pending` | Process pending Explorium jobs | — | ⛔ Internal cron. Not appropriate as agent tool unless we want a manual "kick the queue" admin tool. |

## AI AGENT

| Method | Endpoint | Description | MCP Tool | Status |
|---|---|---|---|---|
| POST | `/api/v1/ai-agent/generate-message-preview` | Personalized message gen | `generate_message_preview` | 🟡 Not tested (charges credits) |
| POST | `/api/v1/ai-agent/generate-workflow` | Full workflow gen | `generate_workflow` | 🟡 Not tested (charges credits) |

## ONBOARDING (JWT-only)

| Method | Endpoint | Description | MCP Tool | Status |
|---|---|---|---|---|
| GET | `/api/v1/onboarding` | Entry point | — | ⛔ JWT-only; flow-based, not really agent-actionable |
| POST | `/api/v1/onboarding/chat` | AI chat | — | ⛔ JWT-only |
| GET | `/api/v1/onboarding/chat-history` | Prior messages | — | ⛔ JWT-only |
| POST | `/api/v1/onboarding/parse-icp` | Parse ICP from description | — | ⛔ JWT-only — but **could be useful as a generic ICP-parser tool** if max-agent moves it to API-key scope |
| POST | `/api/v1/onboarding/scrape` | Scrape company site | — | ⛔ JWT-only |
| GET | `/api/v1/onboarding/voice-presets` | Tone presets | — | ⛔ JWT-only |
| POST | `/api/v1/onboarding/voice-sample` | Sample with preset | — | ⛔ JWT-only |

## ORGANIZATIONS

| Method | Endpoint | Description | MCP Tool | Status |
|---|---|---|---|---|
| GET | `/api/v1/organizations` | List | `list_organizations` | ✅ |
| POST | `/api/v1/organizations` | Create | `create_organization` | ✅ |
| GET | `/api/v1/organizations/{id}` | Get one | `get_organization` | ✅ |
| PATCH | `/api/v1/organizations/{id}` | Update | `update_organization` | ✅ ❓ Currently requires `name` field even on partial update (max-agent bug) |
| DELETE | `/api/v1/organizations/{id}` | Delete | `delete_organization` | ✅ |
| POST | `/api/v1/organizations/bulk-delete` | Batch delete | `bulk_delete_organizations` | 🟡 Not live-tested (covered ad-hoc) |
| POST | `/api/v1/organizations/bulk-import` | Batch import | `bulk_import_organizations` | 🟡 Not live-tested |

## NOTIFICATIONS (JWT-only)

| Method | Endpoint | Description | MCP Tool | Status |
|---|---|---|---|---|
| GET | `/api/v1/notifications` | List | — | ⛔ JWT-only |
| POST | `/api/v1/notifications/{id}/read` | Mark one read | — | ⛔ JWT-only |
| POST | `/api/v1/notifications/mark-all-read` | Mark all read | — | ⛔ JWT-only |
| GET | `/api/v1/notifications/unread-count` | Unread count | — | ⛔ JWT-only |

## UNIBOX (Unified Inbox)

| Method | Endpoint | Description | MCP Tool | Status |
|---|---|---|---|---|
| GET | `/api/v1/unibox/chats` | List chats | `list_chats` | ✅ (returned 0 chats — no test data in workspace) |
| GET | `/api/v1/unibox/chats/{id}` | Get chat | `get_chat` | 🟡 No chats to probe |
| PATCH | `/api/v1/unibox/chats/{id}` | Update chat | `update_chat` | 🟡 Skipped (destructive) |
| DELETE | `/api/v1/unibox/chats/{id}` | Archive | `archive_chat` | 🟡 Skipped (destructive) |
| GET | `/api/v1/unibox/chats/{id}/messages` | List messages | `list_chat_messages` | 🟡 No chats to probe |
| POST | `/api/v1/unibox/chats/{id}/messages` | Send message | `send_chat_message` | 🟡 Skipped (would send real message) |

## UNIPILE — auth + webhooks

| Method | Endpoint | Description | MCP Tool | Status |
|---|---|---|---|---|
| POST | `/api/v1/unipile/hosted-auth/link` | Generate connect link | `hosted_auth_link` | 🟡 401 with pilot key (needs `accounts:write` scope) |
| POST | `/api/v1/unipile/webhook/account-connected` | Webhook: account connected | — | ⛔ **Inbound webhook from Unipile** — not appropriate as agent tool |
| POST | `/api/v1/unipile/webhook/account-status` | Webhook: status change | — | ⛔ Inbound webhook |
| POST | `/api/v1/unipile/webhook/email-events/new-email` | Webhook: new email | — | ⛔ Inbound webhook |
| POST | `/api/v1/unipile/webhook/email-events/tracking-email` | Webhook: open/click | — | ⛔ Inbound webhook |
| POST | `/api/v1/unipile/webhook/linkedin-events/messaging` | Webhook: LinkedIn DM | — | ⛔ Inbound webhook |
| POST | `/api/v1/unipile/webhook/linkedin-events/new-relation` | Webhook: invite accepted | — | ⛔ Inbound webhook |

## BILLING (JWT-only + crons)

| Method | Endpoint | Description | MCP Tool | Status |
|---|---|---|---|---|
| GET | `/api/v1/billing/workspace-balance` | Credit balance | — | ⛔ JWT-only |
| GET | `/api/v1/billing/workspace-movements` | Ledger | — | ⛔ JWT-only |
| POST | `/api/v1/billing/cron/unipile-daily` | Daily Unipile cost calc | — | ⛔ Internal cron |

## DASHBOARD

| Method | Endpoint | Description | MCP Tool | Status |
|---|---|---|---|---|
| GET | `/api/v1/dashboard/kpis` | Workspace KPIs | `get_dashboard_kpis` | ✅ |

## WORKER & WORKSPACE

| Method | Endpoint | Description | MCP Tool | Status |
|---|---|---|---|---|
| POST | `/api/v1/worker/campaign-workflow` | Manual workflow tick | — | ⛔ Internal worker; not appropriate as agent tool |
| GET | `/api/v1/workspace-profile-settings` | Read profile | `get_workspace_profile` | ✅ |
| PUT | `/api/v1/workspace-profile-settings` | Upsert profile | `update_workspace_profile` | 🟡 Skipped (destructive) |

## MATTERMOST & AUTH

| Method | Endpoint | Description | MCP Tool | Status |
|---|---|---|---|---|
| POST | `/api/mattermost` | Mattermost bot webhook | — | ⛔ Bot integration; not for agents |
| GET | `/api/auth/callback` | Supabase auth callback | — | ⛔ OAuth callback; not for agents |

---

## Coverage summary

| Category | Total endpoints | Exposed as MCP | Verified live | Skipped (safe) | Skipped (JWT/webhook/internal) |
|---|---|---|---|---|---|
| System & Health | 1 | 0 | 0 | 0 | 0 (recommend adding) |
| Accounts | 6 | 6 | 3 | 3 | 0 |
| API Keys | 4 | 0 | 0 | 0 | 4 (JWT-only) |
| Campaigns | 14 | 14 | 11 | 0 | 0 |
| Prospects | 8 | 8 | 8 | 0 | 0 |
| Prospect Lists | 10 | 10 | 9 | 1 | 0 |
| Apollo | 4 | 2 | 0 | 2 | 2 (cron + JWT quote) |
| Explorium | 3 | 2 | 0 | 2 | 1 (cron) |
| AI Agent | 2 | 2 | 0 | 2 | 0 |
| Onboarding | 7 | 0 | 0 | 0 | 7 (JWT-only) |
| Organizations | 7 | 7 | 5 | 2 | 0 |
| Notifications | 4 | 0 | 0 | 0 | 4 (JWT-only) |
| Unibox | 6 | 6 | 1 | 5 | 0 |
| Unipile auth | 1 | 1 | 0 | 1 | 0 |
| Unipile webhooks | 6 | 0 | 0 | 0 | 6 (inbound) |
| Billing | 3 | 0 | 0 | 0 | 3 (JWT + cron) |
| Dashboard | 1 | 1 | 1 | 0 | 0 |
| Worker & Workspace | 3 | 2 | 1 | 1 | 1 (internal worker) |
| Mattermost & Auth | 2 | 0 | 0 | 0 | 2 (internal) |
| **TOTAL** | **89** | **59** | **39** | **17** | **29** |

(MCP server registers 63 tools — 59 wrap unique API endpoints + 1 `wait_for_prospect_list` polling helper + 3 local admin tools `get_circuit_status`, `list_failed_requests`, `clear_failed_requests`.)

---

## Outstanding action items

### Discrepancies to resolve (verify against max-agent source)
- [ ] Campaign state transitions (`pause`/`resume`/`stop`/`archive`/`restore`): checklist says POST, MCP uses PATCH (per OpenAPI). My implementation tested PATCH successfully against archive/restore. Need to confirm pause/resume/stop with a launched campaign.
- [ ] `/api/v1/prospect-lists/search`: checklist says GET, MCP uses POST (filter body in JSON, per OpenAPI). My POST works against live API.

### Possible additions to MCP
- [ ] `health_check` — wrapping `/api/health` for agent self-diagnostics
- [ ] (Future) JWT auth path so JWT-only endpoints (billing, notifications, api-keys, onboarding) can be exposed when a session JWT is present

### Known max-agent bugs (file upstream)
- [ ] `GET /campaigns/{bad-uuid}` returns 500 instead of 404 (use `.maybeSingle()`)
- [ ] `PATCH /organizations/{id}` requires `name` (Zod schema should be `.partial()`)

### Live-verify items still needing real data
- [ ] Unibox full flow (`send_chat_message`, `list_chat_messages`, `update_chat`, `archive_chat`) — needs at least one chat in workspace
- [ ] Apollo flow (`apollo_create_list`, `apollo_add_more`, `wait_for_prospect_list`) — costs credits
- [ ] Explorium flow (`explorium_create_list`, `explorium_add_more`, `wait_for_prospect_list`) — costs credits
- [ ] AI agent (`generate_workflow`, `generate_message_preview`) — costs credits
- [ ] `hosted_auth_link` — needs bearer with `accounts:write` scope
- [ ] Campaign state machine (`launch`/`pause`/`resume`/`stop`) — needs a valid `workflow_config`

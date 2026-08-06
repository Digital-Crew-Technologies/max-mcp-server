# MCP Tool Reference

Complete catalog of the MCP tools exposed by `max-mcp-server` — **166 tools** with all feature flags on (`ENABLE_ADMIN_TOOLS`, `ENABLE_WEBHOOK_SIMULATORS`), 157 in the default flat configuration. With `GROUPED_TOOLS=true` the 22 `linkedin_*` tools collapse into one grouped `linkedin` tool. The machine-generated source of truth is [`docs/tools.json`](./tools.json) (regenerate with `npm run docs:tools`; CI enforces sync via `npm run docs:check`). Each entry below includes the underlying HTTP endpoint and a one-line description; legacy domains also list the required scope.

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

## Campaigns (16)

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
| `get_campaign_memory` | `GET /api/v1/campaigns/:id/memory` | `campaigns:read` | Read the campaign's agent memory notes |
| `update_campaign_memory` | `PATCH /api/v1/campaigns/:id/memory` | `campaigns:write` | Update the campaign's agent memory notes |

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

## Unibox (7)

| Tool | HTTP | Scope | Description |
|---|---|---|---|
| `list_chats` | `GET /api/v1/unibox/chats` | `unibox:read` | All threads — filter by channel, prospect, account, archived |
| `get_chat` | `GET /api/v1/unibox/chats/:id` | `unibox:read` | Chat metadata |
| `update_chat` | `PATCH /api/v1/unibox/chats/:id` | `unibox:write` | Title, read state, archived, prospect link |
| `archive_chat` | `DELETE /api/v1/unibox/chats/:id` | `unibox:write` | Soft delete (messages preserved) |
| `list_chat_messages` | `GET /api/v1/unibox/chats/:id/messages` | `unibox:read` | Message list with direction (in/out) and status |
| `send_chat_message` | `POST /api/v1/unibox/chats/:id/messages` | `unibox:write` | Send manual reply — channel inferred from chat |
| `send_new_email` | `POST /api/v1/unibox/send-email` | `unibox:write` | Start a new outbound email thread to any address |

---

## AI Agent (2)

| Tool | HTTP | Scope | Description |
|---|---|---|---|
| `generate_workflow` | `POST /api/v1/ai-agent/generate-workflow` | _credits_ | Generate a complete campaign workflow from natural language |
| `generate_message_preview` | `POST /api/v1/ai-agent/generate-message-preview` | _credits_ | Generate a personalized message for one prospect on one channel |

Both charge credits. Billing endpoints are JWT-only and not exposed as MCP tools — check the balance in the Max app. On `402`, body contains `{ details: { required, balance } }`.

---

## Apollo (2)

| Tool | HTTP | Scope | Description |
|---|---|---|---|
| `apollo_create_list` | `POST /api/v1/apollo/people/create-list` | `prospect-lists:write` + _credits_ | Async Apollo people-search → list ingestion. Auto-injects `idempotency_key` if not provided |
| `apollo_add_more` | `POST /api/v1/apollo/people/add-more` | `prospect-lists:write` + _credits_ | Append leads to an existing Apollo list |

Both are async — poll the resulting list's status (or use `wait_for_prospect_list`).

---

## Explorium (3)

| Tool | HTTP | Scope | Description |
|---|---|---|---|
| `explorium_create_list` | `POST /api/v1/explorium/people/create-list` | `prospect-lists:write` + _credits_ | Async Explorium prospect-search → contact enrichment → list ingestion. Auto-injects `idempotency_key` if not provided |
| `explorium_create_company_list` | `POST /api/v1/explorium/companies/create-list` | `prospect-lists:write` + _credits_ | Async Explorium company-search → organization list (`search_type=organizations`) + company enrichment. Auto-injects `idempotency_key` if not provided. Add-more is not supported for organization lists |
| `explorium_add_more` | `POST /api/v1/explorium/people/add-more` | `prospect-lists:write` + _credits_ | Append leads to an existing Explorium (people) list |

Both are async — poll the resulting list's status (or use `wait_for_prospect_list`).

Apollo and Explorium are interchangeable data suppliers for prospect lists. A
list's `search_source` (`apollo` or `explorium`) determines which provider's
endpoints accept it; pick whichever supplier the workspace has an API key for.

---

## Dashboard (1)

| Tool | HTTP | Scope | Description |
|---|---|---|---|
| `get_dashboard_kpis` | `GET /api/v1/dashboard/kpis` | `dashboard:read` | Workspace-wide aggregate stats — execution counts, channel rates, completion % |

---

## Claire research (5)

Proxy to the Claire research hub via max-agent. These max-agent routes are session-JWT-only.

| Tool | Backend | Description |
|---|---|---|
| `claire_search` | `POST /api/v1/claire/search` | Free-text research query against Claire's hub. |
| `claire_deep_research` | `POST /api/v1/claire/deep-research` | Multi-source background research on a named person or company. |
| `claire_market_watch` | `POST /api/v1/claire/market-watch` | Run a market-watch pass on a URL, optionally filtered by criteria (e.g. |
| `claire_find_competitors` | `POST /api/v1/claire/competitor-finder` | Identify direct competitors of a company by URL. |
| `claire_extract_prospects_from_url` | `POST /api/v1/claire/extract-prospects` | Fetch a public URL (conference attendee list, team / about page, press release, panel announcement, etc.) and extract structured prospects (people / contacts) from it via Claire. |

---

## Enrichment (5)

| Tool | Backend | Description |
|---|---|---|
| `enrich_prospect` | `POST /api/v1/enrichment/prospect/:id` | Run Claire deep-research on a prospect and save the result onto the record. |
| `enrich_organization` | `POST /api/v1/enrichment/organization/:id` | Run Claire deep-research on an organization and save the result onto the record. |
| `bulk_enrich` | `POST /api/v1/enrichment/bulk` | Queue many prospects and/or organizations for background enrichment by the cron worker (does NOT run inline). |
| `get_enrichment_status` | `GET /api/v1/enrichment/status` | Check the enrichment state of a single prospect or organization. |
| `get_enrichment_credits` | `GET /api/v1/enrichment/credits` | Return the workspace's daily enrichment quota usage: {cap, used_today, remaining}. |

---

## Intent signals (9)

| Tool | Backend | Description |
|---|---|---|
| `create_intent_trigger` | `POST /api/v1/intent/triggers` | Set up a trigger that watches a target URL for a buying signal (funding, hiring, tech_stack, news, job_change, or custom). |
| `list_intent_signals` | `GET /api/v1/intent/triggers` | List the workspace's intent triggers (optionally filtered by active state) so you can see what is being monitored and review recent signal activity. |
| `get_signal_history` | `GET /api/v1/intent/signals` | Return the detected SignalEvent rows for a single trigger — each event records whether the poll found changes, a summary, and the raw scrape. |
| `disable_trigger` | `PATCH /api/v1/intent/triggers/:id` | Disable an intent trigger (sets active=false) so it stops re-polling. |
| `list_signal_proposals` | `GET /api/v1/intent/proposals` | List the AI-generated campaign proposals produced from detected signals, optionally filtered by status (pending, approved, rejected, modified, launched, expired). |
| `get_signal_proposal` | `GET /api/v1/intent/proposals/:id` | Fetch a single signal proposal by id, including its full recommendation (campaign name/description, workflow_config, target_prospect_ids, estimated contacts/credits, matched ICP... |
| `approve_proposal` | `POST /api/v1/intent/proposals/:id/approve` | Approve a pending proposal and launch its draft campaign. |
| `reject_proposal` | `POST /api/v1/intent/proposals/:id/reject` | Reject a pending proposal so it will not be launched. |
| `modify_proposal` | `POST /api/v1/intent/proposals/:id/modify` | Adjust a pending proposal WITHOUT launching it: pass modifications (titles, target_prospect_ids, campaign_name, campaign_description) to re-select prospects and regenerate the c... |

---

## Inbox autopilot (5)

| Tool | Backend | Description |
|---|---|---|
| `set_inbox_autopilot` | `PUT /api/v1/inbox/autopilot` | Set the workspace's inbox autopilot configuration. |
| `get_inbox_autopilot_status` | `GET /api/v1/inbox/autopilot` | Return the workspace's current inbox autopilot setting: {enabled, mode ('auto_safe'\|'draft_all'\|'off'), daily_cap}. |
| `list_inbox_drafts` | `GET /api/v1/inbox/drafts` | List the autopilot-generated reply drafts awaiting review (status='draft') for the workspace, newest first. |
| `approve_inbox_draft` | `POST /api/v1/inbox/drafts/:id/approve` | Approve a drafted reply and send it in-thread via Unipile, setting the action's status to 'approved'. |
| `reject_inbox_draft` | `POST /api/v1/inbox/drafts/:id/reject` | Reject a drafted reply so it will not be sent, setting the action's status to 'rejected'. |

---

## Calendar (8)

| Tool | Backend | Description |
|---|---|---|
| `connect_calendar` | `POST /api/v1/calendar/connection` | Connect the workspace's self-hosted Cal.com instance so Max can read availability and book meetings. |
| `calendar_status` | `GET /api/v1/calendar/connection` | Return the workspace's Cal.com connection status. |
| `get_availability` | `GET /api/v1/calendar/availability` | Fetch open booking slots for an event type, grouped by date. |
| `propose_times` | `POST /api/v1/calendar/propose-times` | Return the n soonest available slots as a flat list — handy for offering a prospect a few concrete times. |
| `book_meeting` | `POST /api/v1/calendar/book` | Create a Cal.com booking and record it as a meeting. |
| `send_booking_link` | `POST /api/v1/calendar/booking-link` | Compose the rep's public Cal.com booking link so it can be shared with a prospect. |
| `get_upcoming_meetings` | `GET /api/v1/calendar/meetings` | List upcoming non-cancelled meetings ordered by start time ascending. |
| `cancel_meeting` | `POST /api/v1/calendar/meetings/:id/cancel` | Cancel a recorded meeting by its meetings.id UUID. |

---

## Meeting hub (2)

Grouped tools (always grouped, independent of `GROUPED_TOOLS`). The `meetings` tool exposes actions `list`, `get`, `get_transcript`, `get_summary`, `list_participants` over `GET /api/v1/meeting-hub/sessions*`.

| Tool | Backend | Description |
|---|---|---|
| `meetings` | `GET /api/v1/meeting-hub/sessions[...]` | Read the workspace's meetings from the meeting hub. |
| `prospect_list_meetings` | `GET /api/v1/meeting-hub/sessions?prospect_id=...` | List the meetings involving one prospect, newest first — the prospect meeting feed. |

---

## Tasks (2)

Grouped tools. The `tasks` tool exposes actions `list`, `get`, `create_suggestion`, `update`, `complete` over `/api/v1/tasks*` (optimistic locking via `expectedVersion`).

| Tool | Backend | Description |
|---|---|---|
| `tasks` | `GET/POST/PATCH /api/v1/tasks[...]` | Read tasks and propose new ones. |
| `prospect_list_tasks` | `GET /api/v1/tasks?prospect_id=...` | List the tasks about one prospect, newest first. |

---

## Email analytics (4)

| Tool | Backend | Description |
|---|---|---|
| `get_email_tracking_events` | `GET /api/v1/analytics/email-events` | Raw per-event email tracking rows for a prospect (opens, clicks, replies, bounces) with url/ip/user_agent detail. |
| `get_prospect_engagement_timeline` | `GET /api/v1/analytics/prospect-timeline` | Chronological email engagement timeline for a prospect (oldest first) — every open, click, reply, and bounce. |
| `get_link_click_details` | `GET /api/v1/analytics/link-clicks` | Link clicks for a campaign grouped by url, with total click counts and unique-prospect counts. |
| `get_campaign_engagement_summary` | `GET /api/v1/analytics/campaign-summary` | Engagement summary for a campaign: open/click/reply/bounce rates plus per-link click detail (top links, distinct URLs clicked). |

---

## CRM / HubSpot (16)

Token resolved via `GET /api/v1/crm/access-token` on max-agent, then HubSpot's REST API (`api.hubapi.com`) is called directly. Writes are gated on the connected token's `access_mode`.

| Tool | Backend | Description |
|---|---|---|
| `crm_status` | `probe + GET /api/v1/crm/access-token` | Report whether HubSpot is connected for this workspace. |
| `crm_search_contacts` | `POST hubapi /crm/v3/objects/contacts/search` | Search the connected CRM (HubSpot) for contacts by free text (name, email, company). |
| `crm_get_contact` | `POST hubapi /crm/v3/objects/contacts/search` | Fetch a single CRM contact by email (the dedup identity). |
| `crm_upsert_contact` | `POST/PATCH hubapi /crm/v3/objects/contacts` | Create-or-update a contact in the connected CRM, matched by email — never creates a duplicate. |
| `crm_upsert_company` | `POST/PATCH hubapi /crm/v3/objects/companies` | Create-or-update a company in the connected CRM, matched by domain — never creates a duplicate. |
| `crm_list_deals` | `POST hubapi /crm/v3/objects/deals/search` | List deals from HubSpot with optional filters (stage, owner, pipeline, amount range, close-date range, modified-after). |
| `crm_get_deal` | `GET hubapi /crm/v3/objects/deals/:id` | Fetch a single HubSpot deal by id, including its full properties and associated company/contact ids. |
| `crm_list_activities` | `POST hubapi /crm/v3/objects/{type}/search` | List HubSpot engagements (call/email/meeting/note/task) with optional filters (deal, contact, owner, types, since). |
| `crm_list_owners` | `GET hubapi /crm/v3/owners` | List HubSpot owners (sales reps) for the workspace. |
| `crm_list_pipeline_stages` | `GET hubapi /crm/v3/pipelines/deals` | List deal pipeline stages (optionally scoped to one pipeline). |
| `crm_pipeline_risk_scan` | `hubapi + workspace profile settings` | Scan open HubSpot deals for risk: days inactive, days-to-close, missing fields (amount/owner/next_step/last_activity), close-date slipping, and high-value-low-activity. |
| `crm_weekly_brief_compose` | `hubapi + workspace profile settings` | Compose a structured weekly sales brief from last week's activities, current open deals, the pipeline risk scan, and per-rep aggregates. |
| `crm_detect_forecast_changes` | `hubapi + GET /api/v1/crm/deal-snapshots` | Compare current open HubSpot deals against the workspace's deal snapshot from window_days ago (read from max-agent's crm_deal_snapshots via GET /api/v1/crm/deal-snapshots). |
| `crm_score_prospects` | `local scoring vs workspace ICP rules` | Score prospects 0–100 against the workspace ICP rules (agent_settings.icp_rules): country 25, industry 25, employee-in-range 20, any title keyword 30. |
| `crm_assign_prospects` | `GET hubapi /crm/v3/owners + assignment rules` | Assign prospects to HubSpot owners using agent_settings.assignment_rules (or assignment_rules_override). |
| `crm_export_import_csv` | `POST hubapi contacts/search (dedup); returns CSV` | Build a HubSpot-import CSV (base64-encoded) from prospects. |

---

## Notion (5)

Token resolved via `GET /api/v1/notion/access-token` on max-agent, then Notion's API (`api.notion.com/v1`) is called directly.

| Tool | Backend | Description |
|---|---|---|
| `notion_create_page` | `POST notion /v1/pages` | Create a new Notion page under a parent page, with an optional body of Notion block JSON. |
| `notion_append_blocks` | `PATCH notion /v1/blocks/:id/children` | Append an array of Notion block JSON objects to an existing page (chunked into ≤100-block requests). |
| `notion_get_page` | `GET notion /v1/pages/:id + children` | Fetch a Notion page object plus all of its child blocks (paginated). |
| `notion_search_pages` | `POST notion /v1/search` | Search the connected Notion workspace for pages matching a free-text query. |
| `notion_publish_weekly_brief` | `POST notion /v1/pages (composed brief)` | Render a crm_weekly_brief_compose output as a DRAFT Notion page (H1 title + H2 section per part) under the workspace's Drafts/the assistant parent. |

---

## Agent action drafts (3)

| Tool | Backend | Description |
|---|---|---|
| `agent_draft_create` | `POST /api/v1/agent-drafts` | Stage an action (e.g. |
| `agent_draft_list` | `GET /api/v1/agent-drafts` | List agent action drafts in the workspace, optionally filtered by state (pending/approved/rejected/executed/failed/canceled) and/or action_type. |
| `agent_draft_get` | `GET /api/v1/agent-drafts/:id` | Fetch one agent action draft by id, including its full payload, current state, audit trail, and any execution result. |

---

## LinkedIn (22)

All proxy `/api/v1/linkedin/{action}` on max-agent (which wraps Unipile). With `GROUPED_TOOLS=true` these collapse into a single `linkedin` tool with an `action` discriminator (~80% fewer schema tokens).

| Tool | Backend | Description |
|---|---|---|
| `linkedin_find_profile` | `GET /api/v1/linkedin/find-profile` | Find a LinkedIn profile by name, company and/or title. |
| `linkedin_get_profile` | `GET /api/v1/linkedin/get-profile` | Get a full LinkedIn profile by slug (public identifier). |
| `linkedin_get_own_profile` | `GET /api/v1/linkedin/own-profile` | Get the profile of the connected LinkedIn account. |
| `linkedin_get_company_profile` | `GET /api/v1/linkedin/company-profile` | Get a LinkedIn company profile by its identifier or slug. |
| `linkedin_list_connections` | `GET /api/v1/linkedin/connections` | List first-degree LinkedIn connections of the connected account. |
| `linkedin_search_people` | `GET /api/v1/linkedin/search-people` | Search LinkedIn people via the user's connected account (keywords, filters, cursor pagination; auto-uses Sales Navigator when the account has it, `api` param to override). Every call uses 1 of the account's daily search budget (default 50/day); 429 `SEARCH_QUOTA_EXCEEDED` when exhausted. |
| `linkedin_save_search_list` | `POST /api/v1/linkedin/save-list` | Save search results as a completed prospect list (source "Your LinkedIn"); existing workspace prospects are reused, not duplicated. |
| `linkedin_search_parameters` | `GET /api/v1/linkedin/search-parameters` | Resolve free text into LinkedIn parameter IDs (location/industry/company/school) for search_people filters. Does not consume the search quota. |
| `linkedin_get_search_quota` | `GET /api/v1/linkedin/search-quota` | Remaining LinkedIn people-searches for the connected account (cap, used_today, remaining, weekly counters, resets_at). |
| `linkedin_send_invitation` | `POST /api/v1/linkedin/send-invitation` | Send a LinkedIn connection request. |
| `linkedin_list_invitations_received` | `GET /api/v1/linkedin/invitations-received` | List pending LinkedIn invitations received from others. |
| `linkedin_list_invitations_sent` | `GET /api/v1/linkedin/invitations-sent` | List pending LinkedIn invitations you have sent. |
| `linkedin_cancel_invitation` | `POST /api/v1/linkedin/cancel-invitation` | Cancel/withdraw a sent LinkedIn invitation by its invitation_id (from list_invitations_sent). |
| `linkedin_send_message` | `POST /api/v1/linkedin/send-message` | Send a LinkedIn direct message to start a new conversation. |
| `linkedin_reply_in_chat` | `POST /api/v1/linkedin/reply-in-chat` | Reply in an existing LinkedIn conversation. |
| `linkedin_list_conversations` | `GET /api/v1/linkedin/conversations` | List LinkedIn conversations (inbox). |
| `linkedin_get_conversation_messages` | `GET /api/v1/linkedin/conversation-messages` | Get messages in a specific LinkedIn conversation. |
| `linkedin_get_all_messages` | `GET /api/v1/linkedin/all-messages` | Get all recent LinkedIn messages across all conversations. |
| `linkedin_create_post` | `POST /api/v1/linkedin/create-post` | Create a LinkedIn post from the connected account. |
| `linkedin_get_user_posts` | `GET /api/v1/linkedin/user-posts` | Get recent posts by a LinkedIn user. |
| `linkedin_react_to_post` | `POST /api/v1/linkedin/react-to-post` | React to a LinkedIn post. |
| `linkedin_comment_on_post` | `POST /api/v1/linkedin/comment-on-post` | Comment on a LinkedIn post. |

---

## Webhook simulators (6, flag-gated)

Registered only when `ENABLE_WEBHOOK_SIMULATORS=true`. Post synthetic Unipile webhook payloads to max-agent for end-to-end testing.

| Tool | Backend | Description |
|---|---|---|
| `simulate_account_connected` | `POST /api/v1/unipile/webhook/account-connected` | Fire a Unipile account-connected webhook event. |
| `simulate_account_status` | `POST /api/v1/unipile/webhook/account-status` | Fire a Unipile account-status webhook. |
| `simulate_new_email` | `POST /api/v1/unipile/webhook/email-events/new-email` | Fire a Unipile mail_received webhook. |
| `simulate_email_tracking` | `POST /api/v1/unipile/webhook/email-events/tracking-email` | Fire a Unipile mail_opened or mail_link_clicked tracking event. |
| `simulate_linkedin_messaging` | `POST /api/v1/unipile/webhook/linkedin-events/messaging` | Fire a Unipile LinkedIn messaging event (message_received, message_read, message_delivered, etc.). |
| `simulate_new_relation` | `POST /api/v1/unipile/webhook/linkedin-events/new-relation` | Fire a Unipile new_relation event (LinkedIn invitation accepted). |

---

## Admin / Diagnostics (3, flag-gated, MCP-only)

Registered only when `ENABLE_ADMIN_TOOLS=true` (plus the admin gateway key at request time). These are local to the MCP server and don't call the Max API.

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

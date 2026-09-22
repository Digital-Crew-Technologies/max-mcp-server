# Endpoint coverage: max-agent API → MCP tools

Last verified against max-agent `main` on 2026-09-22.

This is the current answer to "which max-agent endpoints can an MCP client
reach, and which ones are left out on purpose". It replaces
[`ENDPOINT_CHECKLIST.md`](ENDPOINT_CHECKLIST.md), a snapshot from the 64-tool era.
The machine-generated list of every tool is [`tools.json`](tools.json).

**Counts:** 418 tools carrying 444 operations with every flag on; 432 operations
with the flags off. By default they are published as 35 grouped tools (see
[ADR-006](adr/006-grouped-by-default-and-client-cap.md)).

## What "available" means

MCP clients authenticate to max-agent with a **workspace API key**
(`max_live_…`). The Max web chat forwards the signed-in user's JWT instead. An
endpoint is exposed as a tool when it accepts a scoped workspace API key:
`authenticateWorkspaceWithScope(request, "<scope>")`, with no later check that
turns API keys away.

Endpoints are left out when they:

- reject API keys (JWT-only, signed-in admin only, `human_review_required`);
- are infrastructure, such as cron, provider webhooks, the campaign worker,
  internal service-secret routes, public share/signing links and OAuth callbacks;
- move files (signed upload URLs, upload completion, raw file/PDF/attachment bytes);
- return a credential (tokens, mailbox passwords), or take a third-party API
  key as input.

## Sourcing order

Tools for finding new people or companies are ordered by cost, and every
description says so:

1. **`auto_create_prospect_list`** (in `lists`), plus **`preview_organization_search`**
   and **`auto_create_organization_list`** (in `organizations`). max-agent runs
   GetLeads first and falls back to Explorium on its own. Apollo is never part
   of this chain.
2. **`getleads`**: the first choice when a provider is pinned. It is about 100×
   cheaper than Explorium and billed only per contact returned.
3. **`explorium`**: the second choice. Use it for buyer intent, departments,
   revenue, website keywords, tech stack or enrichments, or when GetLeads finds
   nothing.
4. **`apollo`**: the last resort. max-agent's own chat drops these tools.

The three provider groups are registered next to each other in that order.
`features/pilot-tools/getleads/tools.test.ts` checks the order.

## Added in this change

Paths are relative to `/api/v1`.

| Domain (group) | Tools → endpoints |
|---|---|
| Sourcing (`lists`, `organizations`, `getleads`) | `auto_create_prospect_list` → POST prospect-lists/auto/create-list · `preview_organization_search` → POST organizations/search · `auto_create_organization_list` → POST organizations/search/create-list · `getleads_create_list` → POST getleads/people/create-list · `getleads_add_more` → POST getleads/people/add-more |
| Campaigns (`campaigns`) | A/B tests (GET/PATCH …/ab-tests) · audience (GET …/audience, GET/POST …/audience/prospects, POST …/audience/prospects/remove, POST …/audience/lists, DELETE …/audience/lists/{listId}, POST …/audience/sync) · conversations · duplicate · feed · launch/preflight · bulk node-run-counts · share link (GET/POST/DELETE) |
| Prospects (`prospects`) | campaigns · qualification · profile-activities · profile hooks (CRUD + run) · claire-enrich · intelligence-watch · refresh-images · social-profiles/refresh · share link · workspace/people-share-link · global `search` |
| Prospect lists (`lists`) | {id}/organizations · {id}/prospects/ids · share link · linkedin/create-list |
| Organizations (`organizations`) | geo-stats · geo-points · share link |
| Calendar (`calendar`) | meetings/{id}/confirm, /decline, /reschedule, /attendance, /cancel-series · team-availability · calendar-sync accounts (list, disconnect), events (create, update, delete), sync-now |
| Meeting hub (`meetings`) | calendar · coaching-library (read) · conversation-configuration (read) · conversation-intelligence (read) · feedback (read) · live-transcript · notes (list, add text, delete) · segments (batch correct) · summary/regenerate · POST sessions (manual meeting) · share link (revoke only) · Vexa bots (activity, meetings, transcripts, stop) |
| Deals (`deals`, new) | deals CRUD, board-totals, move/win/lose, stage-events, deal prospects · deal pipelines, stages, reorder, stage rules · attachment metadata (list, delete) · sales-workspace · sales-catalog items, fields, deal line items |
| Pipeline (`pipeline`, new) | pipelines, stages (+ reorder), stage rules (+ assignment preview), links, placements, campaign routes, canvas, journey, canvas drafts (CRUD, diff, validate, rebase, publish, publications, rollback) |
| Automations (`automations`, new) | list/get/create/update/delete · draft save/discard · activate/deactivate/resume · run · runs (list, get, cancel) · versions. A webhook token returned on activation is redacted. |
| Webhooks (`webhooks`, new) | pipeline/webhooks CRUD, rotate, test, deliveries, replay · pipeline/webhook-routes CRUD + reorder |
| ICP (`icp`, new) | icp CRUD · links (list, create, delete, reverse lookup) · generate |
| Saved views (`views`, new) | views CRUD |
| Workspace (`workspace`, new) | custom-fields (read) · data-suppliers (list, config, disconnect) · data-quality duplicates (list, dismiss, scan) and settings (read) · workspace-agents (read) · workspace-intel/generate · members, roles, crew-rates, digital-workers (read) · billing/workspace-wallet, budgets, consumption, gifts (read) · agent/sessions and their messages |
| Accounts (`accounts`) | accounts/sync · workspace/account-shares (read) |
| Deliverability (`deliverability`, new) | inbox placements · warm-up health · warm-up (list, pricing, update, cancel, sync) · Mailpool domains (list, search), pricing, orders (list, sync). **Behind `ENABLE_PURCHASE_TOOLS=true`:** POST warmup, POST warmup/{id}/resume, POST mailpool/orders |
| Social (`social`, new) | all 17 operations of `/social/{action}` (LinkedIn/Instagram as a chosen account) |
| Unibox (`unibox`) | channels · channel sync rules (get/set) · reply-suggestions · messages/{id} (read) · sync · sync/progress |
| Enrichment (`enrichment`) | contact-enrichment/enrich + jobs · email-verification/verify + jobs · enrichment/preview |
| Intent (`intent`) | triggers/bulk · triggers/attach-campaign. `create_intent_trigger` now takes every frequency, target type and platform the API accepts, plus `campaign_ids`. |
| Tasks (`tasks`) | `get_thread` → GET tasks/{id}/thread |
| AI (`generate`) | ai-agent/suggest-campaign-ideas |
| Analytics (`analytics`) | analytics/overview · analytics/conversations · analytics/entity |
| CRM (`crm`) | Every CRM tool now calls max-agent's scoped CRM routes. Before, they fetched a HubSpot token from `crm/access-token`, a route max-agent no longer serves, and called HubSpot directly. `crm_status` → GET crm/status · `crm_search_contacts`, `crm_get_contact`, `crm_upsert_contact`, `crm_upsert_company` → POST crm/search-contacts, …/get-contact, …/upsert-contact, …/upsert-company · `crm_list_deals`, `crm_get_deal`, `crm_list_activities` → POST crm/list-deals, …/get-deal, …/list-activities · `crm_list_owners`, `crm_list_pipeline_stages` → GET crm/list-owners, …/list-pipeline-stages. The composites read through the same routes: `crm_pipeline_risk_scan` and `crm_weekly_brief_compose` (deals, activities, owners, stages), `crm_detect_forecast_changes` (deals, owners, stages, plus GET crm/deal-snapshots), `crm_assign_prospects` (owners) and `crm_export_import_csv` (dedup through crm/get-contact). The deal, activity, owner and stage routes need max-agent with those routes deployed; older max-agent builds answer them with 404. |

## Not exposed, by design

| Endpoint(s) | Why |
|---|---|
| tasks/{id}/approve, /reject | `human_review_required`: agents propose, humans approve or reject |
| tasks/{id}/run, tasks/prefill, tasks/suggestions, analytics/synthesis | JWT-only |
| agent-drafts/{id}/approve, /edit, /reject | Human approval of an agent's own drafts |
| meeting-hub participants/{pid} (PATCH), feedback (POST/DELETE, ask-max), conversation-intelligence (POST) | JWT-only or human review |
| meeting-hub coaching-library and conversation-configuration writes | Signed-in admin only |
| meeting-hub share-link GET/POST | Returns or creates a public access token; only revoke is exposed |
| meeting-hub notes upload-url/complete/file, recordings/{id}/signed-url | File flows |
| vexa/bots (POST), vexa/capture-identity | Need a signed-in user with an email; API keys get 401 |
| vexa/token, vexa/browser-session*, vexa/orchestrator/* | Credential or infrastructure |
| webhooks/outbound/* | `requireWorkspaceAdmin` without `allowApiKey`, so every API key gets 403 (the `webhooks:*` scopes do not help) |
| webhooks/ingest/*, webhooks/automations/*, automations/{id}/webhook-token/rotate | Inbound receivers, or return a plaintext credential |
| calendar event-types, schedules, team, team-event-types | Signed-in admin only |
| calendar/overlay, integrations/google-calendar/connect, integrations/microsoft-calendar/connect | JWT-only / browser OAuth |
| custom-fields writes, data-quality settings PUT, workspace members/roles/digital-workers writes, crew-rates PUT | Signed-in admin only |
| data-quality/merge, workspace-agents writes, workspace-agents/me, workspace-intel GET | JWT-only, or `can_edit=false` for API keys |
| data-suppliers/{provider}/connect-key | Takes a raw third-party API key as input |
| billing/* except the workspace-wallet reads | JWT-only or signed-in admin |
| accounts/{id}/conversation-sharing, accounts/{id}/data (DELETE), workspace/account-shares writes | Need a signed-in user |
| unibox/messages/{id} PATCH | Owner-only; always 403 for API keys |
| unibox/messages/{id}/attachments/{attachmentId} | File bytes |
| mailpool/orders/{id}/mailboxes/{mailboxId} | Returns mailbox passwords and 2FA secrets |
| deals attachments upload-url/complete/POST/GET bytes | File flows |
| icp/import, icp/import/upload-url | File flow (uploaded PDF) |
| documents/*, sales-agents/*, sign/*, shared/* | JWT-only or public token routes |
| pipeline/transfer-destinations | Browser session only |
| agent/chat, agent/chat/stream, bridge/*, hermes/chat, onboarding chat/runs, prospect-lists/talk | Max chat itself: streaming, and calling it from Max's own toolbox would recurse |
| api-keys/*, notifications/*, workspace membership/invitation/switch/share routes, auth/* | JWT-only |
| `*/cron/*`, `unipile/webhook/*`, `worker/*`, `internal/*`, `extension/telemetry`, `test/*` | Infrastructure |

## Known gaps

- **`connect_calendar`** posts to `calendar/connection`, which is signed-in-admin
  only. It works from the web chat but not with an API key.

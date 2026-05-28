# MCP Endpoint Audit Report

**Generated:** 2026-05-27T19:43:48.280Z
**Server:** http://localhost:3011
**Tools audited:** 63

## Summary

| Outcome | Count |
|---|---|
| ✓ Pass | 22 |
| ✗ Fail | 1 |
| - Skip | 40 |

## Workspace

| Tool | Outcome | Status | Notes |
|---|---|---|---|
| `get_workspace_profile` | ✓ pass | `200` | ``{"data":{"id":"b929cb1e-8025-42ff-9e06-b6753e102816","workspace_id":"b929cb1e…`` |
| `update_workspace_profile` | - skip | — | destructive: would overwrite real workspace settings |

## Campaigns

| Tool | Outcome | Status | Notes |
|---|---|---|---|
| `list_campaigns` | ✓ pass | `200` | ``{"data":[{"id":"780bd8c6-210d-41c8-87c3-7b972e038b9f","name":"Marketplace Fac…`` |
| `get_campaign` | ✓ pass | `200` | ``{"id":"780bd8c6-210d-41c8-87c3-7b972e038b9f","name":"Marketplace Factory � Li…`` |
| `get_campaign_stats` | ✓ pass | `200` | ``{"execution":{"total":0,"pending":0,"running":0,"paused":0,"waiting":0,"compl…`` |
| `get_campaign_lead_analytics` | ✓ pass | `200` | ``{"data":[],"total":0}`` |
| `get_campaign_node_run_counts` | ✓ pass | `200` | ``{"nodeRunCounts":{}}`` |
| `create_campaign` | - skip | — | lifecycle: see test-endpoints.mjs --include-launches |
| `update_campaign` | - skip | — | lifecycle: tested in test-endpoints.mjs lifecycle |
| `delete_campaign` | - skip | — | lifecycle: tested in test-endpoints.mjs lifecycle |
| `launch_campaign` | - skip | — | sending: would start real outreach; only run via --include-launches in test-endpoints |
| `pause_campaign` | - skip | — | lifecycle: state machine; tested in test-endpoints |
| `resume_campaign` | - skip | — | lifecycle: state machine; tested in test-endpoints |
| `stop_campaign` | - skip | — | lifecycle: state machine; tested in test-endpoints |
| `archive_campaign` | - skip | — | lifecycle: state machine; tested in test-endpoints |
| `restore_campaign` | - skip | — | lifecycle: state machine; tested in test-endpoints |

## Prospects

| Tool | Outcome | Status | Notes |
|---|---|---|---|
| `list_prospects` | ✓ pass | `200` | ``{"data":[{"id":"ddeb315b-577b-4f7a-a692-1bd1897c30a1","apollo_id":null,"first…`` |
| `get_prospect` | ✓ pass | `200` | ``{"data":{"id":"ddeb315b-577b-4f7a-a692-1bd1897c30a1","apollo_id":null,"first_…`` |
| `get_prospect_campaign_activity` | ✓ pass | `200` | ``{"data":[]}`` |
| `create_prospect` | - skip | — | lifecycle: tested in test-endpoints.mjs lifecycle |
| `update_prospect` | - skip | — | lifecycle: tested in test-endpoints.mjs lifecycle |
| `delete_prospect` | - skip | — | lifecycle: tested in test-endpoints.mjs lifecycle |
| `bulk_import_prospects` | - skip | — | lifecycle: tested in test-endpoints.mjs lifecycle |
| `bulk_delete_prospects` | - skip | — | lifecycle: tested in test-endpoints.mjs lifecycle |

## Prospect Lists

| Tool | Outcome | Status | Notes |
|---|---|---|---|
| `list_prospect_lists` | ✓ pass | `200` | ``{"data":[{"id":"90daa4fe-ca04-476f-819a-c0c1bbd076c1","list_name":"Marketplac…`` |
| `get_prospect_list` | ✓ pass | `200` | ``{"data":{"id":"90daa4fe-ca04-476f-819a-c0c1bbd076c1","list_name":"Marketplace…`` |
| `list_prospect_list_members` | ✓ pass | `200` | ``{"data":[{"id":"ddeb315b-577b-4f7a-a692-1bd1897c30a1","apollo_id":null,"first…`` |
| `search_prospect_lists` | ✓ pass | `200` | ``{"data":[{"id":"040f6b00-3776-48b3-bc8f-7b6ca9e79a57","apollo_id":null,"first…`` |
| `create_prospect_list` | - skip | — | lifecycle: tested in test-endpoints.mjs lifecycle |
| `update_prospect_list` | - skip | — | lifecycle: tested in test-endpoints.mjs lifecycle |
| `delete_prospect_list` | - skip | — | lifecycle: tested in test-endpoints.mjs lifecycle |
| `add_prospects_to_list` | - skip | — | lifecycle: tested in test-endpoints.mjs lifecycle |
| `remove_prospects_from_list` | - skip | — | lifecycle: tested in test-endpoints.mjs lifecycle |
| `import_prospect_list_csv` | - skip | — | lifecycle: would create real list; covered by ad-hoc test |
| `wait_for_prospect_list` | - skip | — | external: requires an Apollo list in pending state |

## Organizations

| Tool | Outcome | Status | Notes |
|---|---|---|---|
| `list_organizations` | ✓ pass | `200` | ``{"data":[{"id":"5847488c-e3a1-4217-94a8-cd16fe837503","apollo_id":null,"name"…`` |
| `get_organization` | ✓ pass | `200` | ``{"data":{"id":"5847488c-e3a1-4217-94a8-cd16fe837503","apollo_id":null,"name":…`` |
| `create_organization` | - skip | — | lifecycle: tested in test-endpoints.mjs lifecycle |
| `update_organization` | - skip | — | lifecycle: tested in test-endpoints.mjs lifecycle |
| `delete_organization` | - skip | — | lifecycle: tested in test-endpoints.mjs lifecycle |
| `bulk_import_organizations` | - skip | — | lifecycle: covered by ad-hoc test |
| `bulk_delete_organizations` | - skip | — | lifecycle: covered by ad-hoc test |

## Accounts

| Tool | Outcome | Status | Notes |
|---|---|---|---|
| `list_accounts` | ✓ pass | `200` | ``{"data":[{"id":"9b4cc034-fd96-4614-b747-f32625896859","provider":"unipile","p…`` |
| `get_account` | ✓ pass | `200` | ``{"data":{"id":"9b4cc034-fd96-4614-b747-f32625896859","provider":"unipile","pr…`` |
| `get_account_rate_limits` | ✓ pass | `200` | ``{"data":[{"id":"7e116f7a-87c7-487c-b635-74b1ce684b5e","account_id":"9b4cc034-…`` |
| `update_account` | - skip | — | destructive: would overwrite real account config |
| `disconnect_account` | - skip | — | destructive: would disconnect a real connected account |
| `update_account_rate_limit` | - skip | — | destructive: would change real sending caps |
| `hosted_auth_link` | ✗ fail | `401` | ``API error (401): {"error":"Invalid or expired token"}`` |

## Unibox

| Tool | Outcome | Status | Notes |
|---|---|---|---|
| `list_chats` | ✓ pass | `200` | ``{"data":[],"count":0,"page":1,"pageSize":1}`` |
| `get_chat` | - skip | — | —: no chat available in workspace |
| `list_chat_messages` | - skip | — | —: no chat available in workspace |
| `update_chat` | - skip | — | destructive: would change real chat metadata |
| `archive_chat` | - skip | — | destructive: would archive a real chat |
| `send_chat_message` | - skip | — | sending: would send real message to real recipient |

## AI Agent

| Tool | Outcome | Status | Notes |
|---|---|---|---|
| `generate_workflow` | - skip | — | billing: charges credits per invocation |
| `generate_message_preview` | - skip | — | billing: charges credits per invocation |

## Apollo

| Tool | Outcome | Status | Notes |
|---|---|---|---|
| `apollo_create_list` | - skip | — | billing: charges credits + creates real list |
| `apollo_add_more` | - skip | — | billing: charges credits per lead |

## Dashboard

| Tool | Outcome | Status | Notes |
|---|---|---|---|
| `get_dashboard_kpis` | ✓ pass | `200` | ``{"execution":{"total":3,"pending":0,"running":0,"paused":0,"waiting":3,"compl…`` |

## Admin

| Tool | Outcome | Status | Notes |
|---|---|---|---|
| `get_circuit_status` | ✓ pass | `200` | ``{   "max.digitalcrew.tech": {     "state": "closed",     "failures": 0,     "…`` |
| `list_failed_requests` | ✓ pass | `200` | ``{   "count": 1,   "entries": [     {       "id": "s9qsxiy6mpogxwig",       "t…`` |
| `clear_failed_requests` | - skip | — | destructive: wipes dead-letter queue |

## Known Issues

### `get_campaign` returns 500 instead of 404 for non-existent UUIDs
- **Severity:** Low
- **Location:** max-agent

Hitting `GET /api/v1/campaigns/{bad-uuid}` returns `500 Cannot coerce the result to a single JSON object` instead of the OpenAPI-documented `404`. The MCP test harness accepts both, but the API itself should be fixed to return a clean 404.

### `update_organization` PATCH requires `name` field
- **Severity:** Low
- **Location:** max-agent

PATCH `/api/v1/organizations/{id}` rejects the request with `400 Required: name` if `name` is omitted, even though PATCH should support partial updates. Workaround: always send `name` when updating an organization.

## Failures

### `hosted_auth_link`
- **Category:** Accounts
- **Status:** 401

```
API error (401): {"error":"Invalid or expired token"}
```

# Sales OS crew and desktop tools

Max MCP exposes four Sales OS tools, grouped as `salesos` under the default
`GROUPED_TOOLS` configuration (`salesos` with `action: "list_sales_os_crew"`)
and registered flat under `GROUPED_TOOLS=false`. They proxy max-agent's
`/api/v1/sales-os/*` routes with the caller's bearer. The MCP server enforces
nothing itself: max-agent authenticates every call, derives the workspace from
the bearer and returns its own errors, which the tools pass back with the MCP
error flag.

| Tool | Max backend endpoint | Scope | Credential |
| --- | --- | --- | --- |
| `list_sales_os_crew` | `GET /api/v1/sales-os/crew` | `workspace:read` | Any workspace API key, including the shared "Max MCP" key, or a member's session |
| `sales_os_crew_check_in` | `POST /api/v1/sales-os/crew/check-in` | `workspace:write` | An API key (the shared "Max MCP" key works). A member's session gets 400 |
| `list_sales_os_desktop_items` | `GET /api/v1/sales-os/items` | `sales_os:read` | A personal API key, or a member's session (Max's in-app chat; see below) |
| `add_sales_os_desktop_item` | `POST /api/v1/sales-os/items` | `sales_os:write` | A personal API key, or a member's session (Max's in-app chat; see below) |

Responses are max-agent's `{data: …}` envelope, unchanged. Errors arrive as
`API error (<status>): {"error": "…", "code": "…"}`, cut to 500 characters
with any bearer redacted.

## Crew status

`list_sales_os_crew` returns who on the team is active now and who is not:
people, Max, the workspace's digital workers and agents that checked in.
`include_ai: false` lists people only (sent as `?include_ai=false`).

```text
{data: {
  members: [{key, kind, id, name, role, ai, status, active, activity, lastSeenAt, source, workerKey?, agentSurface?}],
  counts: {total, active, ai, aiActive},
  live: {available, reason},
  generatedAt
}}
```

- `kind` is `human`, `max`, `digital_worker` or `agent`.
- People are `online`, `idle`, `away`, `offline` or `hidden`. A member who
  turned live presence off is always `hidden`, with no last-seen time.
- AI is `working`, `active`, `ready`, `paused`, `error` or `offline`.
- `active` is true for `online`, `idle`, `working` and `active`. Members come
  sorted with the active ones first.
- `activity` is only ever set for AI. It is either what the agent reported or
  derived from its tasks (for example "2 tasks in progress").
- `live.available` says whether live cursors (Supabase Realtime) are on for
  the deployment. Team status works either way.

## Checking in

`sales_os_crew_check_in` puts this agent on the roster, with what it is
doing, so it shows as active in the Crew widget. Call it at the start of a
work session and whenever the activity changes, and with `state: "offline"`
when done.

| Argument | Meaning |
| --- | --- |
| `name` | Required, 1–40 characters. The agent's name in the Crew widget. One entry per API key and name, so keep the name stable. |
| `state` | `active` (default), `busy` (working now), `idle` (waiting) or `offline` (removes the entry). |
| `activity` | Up to 120 characters, shown to the team. Each check-in replaces the previous activity; leaving it out clears it. |
| `worker_id` | Check in as one of the workspace's active digital workers (a UUID from `list_digital_workers` or `list_sales_os_crew`) instead of as a named agent. The worker's own name shows and `name` is ignored. |

The tool always sends `client: "mcp"`, so the roster shows the agent as
connected over MCP. The caller cannot set it. The body holds only the fields
above, because max-agent's body is strict.

max-agent decides who is checking in from the credential. An API key checks in
as an agent (`${apiKeyId}:${slug(name)}`) or, with `worker_id`, as a digital
worker. It can never check in as a person. A member's browser session checks
in from the Sales OS desktop instead. When Max's in-app chat calls this tool
with the member's session, max-agent answers 400, because `name` and `client`
are API-key fields. Max is already on the roster as itself.

| Response | Meaning |
| --- | --- |
| 200 `{recorded: true, member}` | Written. `member` is the entry as the roster shows it. |
| 200 `{recorded: true, throttled: true}` | A repeat within 10 s with the same state and activity was not written again. |
| 200 `{recorded: false}` | `state: "offline"`: the entry was removed. |
| 400 `NAME_REQUIRED` | The name was empty after sanitising. |
| 403 `{error: "Forbidden", requiredScope}` | The key lacks `workspace:write`. |
| 404 `WORKER_NOT_FOUND` | No such digital worker in this workspace. |
| 409 `WORKER_PAUSED` | An admin paused that worker. |
| 429 `RATE_LIMITED` | More than 30 check-ins a minute from this key. |
| 503 `SALES_OS_NOT_AVAILABLE` | The crew presence table is not migrated yet. |

A check-in is never retried. It is a heartbeat, so the next call replaces a
lost one, and retrying a 429 inside max-agent's one-minute window would only
use up the limit. Agents unseen for a week drop off the roster, and a workspace
keeps at most 20 checked-in agents (the least recently seen go first).

## Desktop items

The desktop tools read and change the **caller's own** Sales OS desktop. For an
API key, that is the desktop of the member who created the key. max-agent
accepts a key there only when all of these hold, and re-checks them on every
call:

| Requirement | Otherwise |
| --- | --- |
| The key carries `sales_os:read` (list) or `sales_os:write` (add) | 403 `{error: "Forbidden", requiredScope}` |
| It is not the workspace's shared "Max MCP" key. Any member can fetch that key, so its creator is not necessarily the caller | 403 `PERSONAL_KEY_REQUIRED` |
| It has an owner | 403 `API_KEY_OWNER_REQUIRED` |
| Its owner is still a joined member of the workspace | 403 `API_KEY_OWNER_NOT_MEMBER` |
| It has no custom role | 403 `API_KEY_ROLE_RESTRICTED` |

If max-agent cannot verify the key's standing, it answers 503 and fails closed.
Keys created before the `sales_os:*` scopes existed do not carry them, so the
member creates a new personal key (Settings → API keys) with those scopes.
Max's in-app chat forwards the member's own session, which needs no scope,
when max-agent has `MCP_GATEWAY_SECRET` set. Without it, the chat connects with
the shared "Max MCP" key, and the desktop tools answer 403
`PERSONAL_KEY_REQUIRED`.

`list_sales_os_desktop_items` lists the desktop's top-level items and its
widgets. With `folder_id` (an id from an earlier listing), it lists that
folder's direct children instead. `root` is the desktop itself. Items in the
Trash, or inside a trashed folder, are left out.

```text
{data: {
  revision, folderId,
  items: [{id, type, name, parentId, kind?, href?, text?, childCount?}],
  widgets?: [{id, type, title, size}]
}}
```

- `type` is `folder`, `shortcut`, `note`, `file` or `shared_folder`.
- Shortcuts carry `kind` and `href`. Notes carry `text`, cut to a
  500-character preview. Folders carry `childCount`.
- `widgets` appears only at the root.
- A member who never saved a desktop gets the default one at revision 0.
- An unknown or trashed folder answers 404 `FOLDER_NOT_FOUND`.

`add_sales_os_desktop_item` adds one item, on the desktop or into a folder
(`folder_id`).

| `type` | Required | Optional |
| --- | --- | --- |
| `note` | `text` (1–2000 characters, not blank) | `color`: yellow, pink, blue, green, purple, orange, graphite |
| `shortcut` | `href`: a Max route with a single leading `/`, for example `/campaigns/42`. Full URLs are refused | `name` (1–80 characters; defaults to the page's name) |
| `folder` | `name` (1–80 characters) | `color`: blue, indigo, purple, pink, red, orange, yellow, green, teal, graphite |

The tool checks the arguments against the type before any request. For
example, `href` on a note, or a folder colour on a note, is an MCP error and
nothing is sent. The body holds only that type's fields and `folder_id`.

| Response | Meaning |
| --- | --- |
| 201 `{id, created: true, revision}` | Added. |
| 200 `{id, created: false, revision}` | That shortcut is already in that place, and its id is returned. |
| 400 `INVALID_HREF`, `FOLDER_TOO_DEEP`, `INVALID_ITEM` | The link is not a Max route, folders nest at most 8 deep, or the result would not be a valid desktop. |
| 404 `FOLDER_NOT_FOUND` | The target folder is missing or in the Trash. |
| 409 `REVISION_CONFLICT` | The desktop kept changing (an open tab saving) across max-agent's three attempts. Try again later. |
| 413 `DESKTOP_FULL` | The desktop is at its item or size limit. |

An add is never retried: a retry after a slow success would add a second
note or folder. An open Max tab picks the new item up when it next regains
focus.

## Not exposed

- `GET`/`PUT /api/v1/sales-os` (the whole desktop document). Personal keys
  can call it, but a read is up to 256 KiB and a save replaces the whole
  document at a revision. The items routes are the compact, one-item-at-a-time
  way in.
- `/api/v1/sales-os/presence` (presence opt-in) and
  `POST /api/v1/sales-os/presence/token`: browser-session only, and the token
  is a Realtime credential.
- `/api/v1/sales-os/files*` and `/api/v1/sales-os/shared-folders*`: file flows
  and browser-session only.

No tool takes a workspace or member argument. max-agent derives both from the
bearer and answers `workspace_id`, `workspaceId`, `user_id` or `userId` in the
query with 400.

## Deploy order

Deploy max-agent first, then publish this catalog:

1. max-agent with the `GET /api/v1/sales-os/crew`,
   `POST /api/v1/sales-os/crew/check-in` and `GET`/`POST /api/v1/sales-os/items`
   routes and the `sales_os:read` / `sales_os:write` scopes.
2. The `sales_os_crew_presence` migration
   (`20261004100000_sales_os_crew_presence.sql`). Before it, the roster still
   loads, without check-ins, but every check-in answers 503. A 5xx counts
   toward the per-host circuit breaker, so a client that kept checking in
   could pause every Max tool for 30 s.
3. This MCP server.

Without step 1, every tool answers 404. Max's own chat loads MCP domains by
keyword (max-agent `src/features/agent/services/mcp-tool-tiering.ts`,
`DOMAIN_HINTS`). Until that map has a `salesos` entry, the chat loads the group
only when a message contains "salesos". Otherwise the model sees it in the
deferred-domain index and reaches it through `invoke`.

import { callApi, toolHints, type McpServer } from "../shared";
import * as repo from "./repository";
import * as S from "./schema";

// Sales OS (max-agent /api/v1/sales-os/*): the team's crew status and the
// member's own desktop.
//
// Crew (scopes workspace:read / workspace:write — the workspace "Max MCP" key
// has both): who on the team, people and AI, is active now; and a check-in
// that puts this agent on that roster with what it is doing. An API key
// checks in as a named agent or as one of the workspace's digital workers,
// never as a person; a browser session (Max's own chat) checks in for its
// member from the desktop instead, so it gets 400 here.
//
// Desktop (scopes sales_os:read / sales_os:write): the key owner's own
// desktop, so it needs a PERSONAL API key; the shared "Max MCP" key is
// refused (403 PERSONAL_KEY_REQUIRED). Max's in-app chat forwards the member's
// session and works too.
//
// Bodies are built field by field rather than forwarded: max-agent's bodies
// are strict, and in grouped mode a handler receives the caller's raw input,
// so any stray key (a tenant selector included) would only earn a 400.

type ToolResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };

function invalid(message: string): ToolResult {
  return { content: [{ type: "text", text: `Invalid arguments: ${message}` }], isError: true };
}

type CheckInInput = {
  name: string;
  state?: string;
  activity?: string;
  worker_id?: string;
};

/** The check-in body: always `client: "mcp"`, so the Crew widget shows where the agent came from. */
function checkInBody(input: CheckInInput): Record<string, unknown> {
  const body: Record<string, unknown> = { name: input.name, client: "mcp" };
  if (input.state !== undefined) body.state = input.state;
  if (input.activity !== undefined) body.activity = input.activity;
  if (input.worker_id !== undefined) body.worker_id = input.worker_id;
  return body;
}

const ITEM_FIELDS: Record<S.AddSalesOsDesktopItemInput["type"], { required: string; allowed: string[] }> = {
  note: { required: "text", allowed: ["text", "color"] },
  shortcut: { required: "href", allowed: ["href", "name"] },
  folder: { required: "name", allowed: ["name", "color"] },
};

/** The one-of body max-agent accepts for `type`, or why the arguments don't fit it. */
function addItemBody(input: S.AddSalesOsDesktopItemInput): Record<string, unknown> | string {
  const fields = ITEM_FIELDS[input.type];
  if (!fields) return `unknown type "${String(input.type)}"`;
  const given = input as Record<string, unknown>;
  if (given[fields.required] === undefined) return `type ${input.type} needs ${fields.required}`;
  for (const field of ["text", "href", "name", "color"]) {
    if (given[field] !== undefined && !fields.allowed.includes(field)) {
      return `${field} does not apply to type ${input.type}`;
    }
  }
  if (input.color !== undefined) {
    const colors: readonly string[] = input.type === "note" ? S.NOTE_COLORS : S.FOLDER_COLORS;
    if (!colors.includes(input.color)) {
      return `color for type ${input.type} must be one of ${colors.join(", ")}`;
    }
  }
  const body: Record<string, unknown> = { type: input.type };
  for (const field of fields.allowed) {
    if (given[field] !== undefined) body[field] = given[field];
  }
  if (input.folder_id !== undefined) body.folder_id = input.folder_id;
  return body;
}

export function registerSalesOsTools(server: McpServer): void {
  server.registerTool(
    "list_sales_os_crew",
    {
      title: "List Sales OS crew",
      description:
        "Who on the team is active now vs inactive — people, Max, digital workers and connected agents — with status (people: online/idle/away/offline/hidden; AI: working/active/ready/paused/error/offline), activity and lastSeenAt, active first. Scope workspace:read. Returns {data: {members: [{key, kind, id, name, role, ai, status, active, activity, lastSeenAt}], counts, live, generatedAt}}.",
      inputSchema: S.listSalesOsCrewSchema,
      ...toolHints.readOnly,
    },
    async (input) =>
      callApi(input.bearer_token, (t) => repo.listCrew(t, { include_ai: input.include_ai })),
  );

  server.registerTool(
    "sales_os_crew_check_in",
    {
      title: "Check in to the Sales OS crew",
      description:
        "Tell the team what this AI agent is doing so it shows as active in the Crew widget: call at the start of a work session and whenever the activity changes (state busy while working), and with state offline when done. Repeats within 10 s are coalesced (throttled: true); over 30 calls/min → 429 RATE_LIMITED. worker_id: 404 WORKER_NOT_FOUND, 409 WORKER_PAUSED. API-key connections only (a signed-in session gets 400). Scope workspace:write. Never retried. Returns {data: {recorded, member?}}.",
      inputSchema: S.salesOsCrewCheckInSchema,
      ...toolHints.idempotent,
    },
    async (input) => callApi(input.bearer_token, (t) => repo.checkInCrew(t, checkInBody(input))),
  );

  server.registerTool(
    "list_sales_os_desktop_items",
    {
      title: "List Sales OS desktop items",
      description:
        "List the member's own Sales OS desktop — its top-level items and widgets — or one folder's direct children: folders (childCount), shortcuts to Max pages (kind, href), sticky notes (text, ≤500-char preview), files and shared folders; trashed items are left out. Needs a personal API key with sales_os:read (the shared \"Max MCP\" key gets 403 PERSONAL_KEY_REQUIRED) or Max's in-app chat. 404 FOLDER_NOT_FOUND. Returns {data: {revision, folderId, items: [{id, type, name, parentId, …}], widgets?}}.",
      inputSchema: S.listSalesOsDesktopItemsSchema,
      ...toolHints.readOnly,
    },
    async (input) =>
      callApi(input.bearer_token, (t) => repo.listDesktopItems(t, { folder_id: input.folder_id })),
  );

  server.registerTool(
    "add_sales_os_desktop_item",
    {
      title: "Add Sales OS desktop item",
      description:
        "Add a sticky note (text), a shortcut to a Max page (href, e.g. /campaigns/42) or a folder (name) to the member's own Sales OS desktop or into a folder; the same shortcut already there returns its id with created: false. Needs a personal API key with sales_os:write (the shared \"Max MCP\" key gets 403 PERSONAL_KEY_REQUIRED) or Max's in-app chat. 404 FOLDER_NOT_FOUND, 413 DESKTOP_FULL, 409 REVISION_CONFLICT (desktop kept changing; try again later). Never retried. Returns {data: {id, created, revision}}.",
      inputSchema: S.addSalesOsDesktopItemSchema,
    },
    async (input) => {
      const body = addItemBody(input);
      if (typeof body === "string") return invalid(body);
      return callApi(input.bearer_token, (t) => repo.addDesktopItem(t, body));
    },
  );
}

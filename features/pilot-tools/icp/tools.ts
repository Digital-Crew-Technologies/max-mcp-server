import { randomUUID } from "node:crypto";
import { callApi, strip, toolHints, type McpServer } from "../shared";
import * as repo from "./repository";
import * as S from "./schema";

// Ideal Customer Profiles (max-agent /api/v1/icp/*). An ICP has a searchable
// `criteria` half and a qualitative `profile` half, and can be linked to the
// deals / organizations / prospects it describes. Every workspace has a default
// one (drafted by Max from the company profile when there is none).
// search_from_icp runs the criteria half as a people search (the same map the
// People search bar uses), and a search given an icp_id and no targeting of
// its own runs that ICP too.

export function registerIcpTools(server: McpServer): void {
  server.registerTool(
    "list_icps",
    {
      title: "List ICPs",
      description:
        "List the workspace's Ideal Customer Profiles (default first). Filter by status (default active) or name search. Returns {data: Icp[]} with criteria, profile and stats (linked deals/organizations/prospects, searches run).",
      inputSchema: S.listIcpsSchema,
      ...toolHints.readOnly,
    },
    async (input) =>
      callApi(input.bearer_token, (t) => repo.listIcps(t, strip(input, "bearer_token"))),
  );

  server.registerTool(
    "get_icp",
    {
      title: "Get ICP",
      description: "Get one ICP by id with its criteria, profile and stats. Returns {data: Icp}.",
      inputSchema: S.getIcpSchema,
      ...toolHints.readOnly,
    },
    async (input) => callApi(input.bearer_token, (t) => repo.getIcp(t, input.icp_id)),
  );

  server.registerTool(
    "create_icp",
    {
      title: "Create ICP",
      description:
        "Save a new ICP. Only name is required; criteria/profile can be filled later. 409 code name_taken on a duplicate name. Returns {data: Icp}.",
      inputSchema: S.createIcpSchema,
    },
    async (input) =>
      callApi(input.bearer_token, (t) => repo.createIcp(t, strip(input, "bearer_token"))),
  );

  server.registerTool(
    "update_icp",
    {
      title: "Update ICP",
      description:
        "Patch an ICP: rename, archive, make default, or replace its criteria/profile. Omitted fields are untouched, but a sent criteria or profile object replaces that whole half. Returns {data: Icp}.",
      inputSchema: S.updateIcpSchema,
      ...toolHints.idempotent,
    },
    async (input) =>
      callApi(input.bearer_token, (t) =>
        repo.updateIcp(t, input.icp_id, strip(input, "bearer_token", "icp_id")),
      ),
  );

  server.registerTool(
    "delete_icp",
    {
      title: "Delete ICP",
      description:
        "Permanently delete an ICP and its record links (searches it produced are kept). Prefer update_icp status=archived. Returns {data: {id}}.",
      inputSchema: S.deleteIcpSchema,
      ...toolHints.destructive,
    },
    async (input) => callApi(input.bearer_token, (t) => repo.deleteIcp(t, input.icp_id)),
  );

  server.registerTool(
    "list_icp_links",
    {
      title: "List ICP links",
      description:
        "List the deals, organizations and prospects an ICP claims. Returns {data: IcpLink[]} (entity_type, entity_id, entity_label, fit_score, rationale, linked_by).",
      inputSchema: S.listIcpLinksSchema,
      ...toolHints.readOnly,
    },
    async (input) => callApi(input.bearer_token, (t) => repo.listIcpLinks(t, input.icp_id)),
  );

  server.registerTool(
    "link_icp",
    {
      title: "Link ICP to a record",
      description:
        "Mark a deal, organization or prospect as matching an ICP, with optional fit_score (0-100) and rationale. Upserts: re-linking updates the existing link. Returns {data: IcpLink}.",
      inputSchema: S.linkIcpSchema,
    },
    async (input) =>
      callApi(input.bearer_token, (t) =>
        repo.createIcpLink(t, input.icp_id, strip(input, "bearer_token", "icp_id")),
      ),
  );

  server.registerTool(
    "unlink_icp",
    {
      title: "Unlink ICP from a record",
      description: "Remove one ICP link by link_id (the record itself is untouched). Returns {data: {id}}.",
      inputSchema: S.unlinkIcpSchema,
      ...toolHints.destructive,
    },
    async (input) =>
      callApi(input.bearer_token, (t) => repo.deleteIcpLink(t, input.icp_id, input.link_id)),
  );

  server.registerTool(
    "list_icps_for_record",
    {
      title: "List ICPs for a record",
      description:
        "Reverse lookup: which ICPs claim this deal, organization or prospect. Returns {data: IcpLink[]} including icp_name.",
      inputSchema: S.listIcpsForRecordSchema,
      ...toolHints.readOnly,
    },
    async (input) =>
      callApi(input.bearer_token, (t) =>
        repo.listIcpLinksForRecord(t, strip(input, "bearer_token")),
      ),
  );

  server.registerTool(
    "get_default_icp",
    {
      title: "Get default ICP",
      description:
        "Read the workspace's default ICP — the one searches run from when nothing names another. Never writes. Returns {data: Icp | null}; null means none yet (ensure_default_icp drafts one).",
      inputSchema: S.getDefaultIcpSchema,
      ...toolHints.readOnly,
    },
    async (input) => callApi(input.bearer_token, (t) => repo.getDefaultIcp(t)),
  );

  server.registerTool(
    "ensure_default_icp",
    {
      title: "Ensure default ICP",
      description:
        "Make sure the workspace has a default ICP that says who to look for: returns the current default, else promotes the most recent active ICP, else has Max draft one from the company profile and SAVES it (source 'max'). Unless fill=false, an ICP with no targeting is then filled by Max and saved. CHARGES credits only when Max writes; slow (up to ~90s) then. Returns {data: Icp, created, filled}; pass data.id as icp_id to auto_create_prospect_list.",
      inputSchema: S.ensureDefaultIcpSchema,
    },
    async (input) =>
      callApi(input.bearer_token, (t) => repo.ensureDefaultIcp(t, strip(input, "bearer_token"))),
  );

  server.registerTool(
    "fill_icp",
    {
      title: "Fill ICP targeting with Max",
      description:
        "Fill an ICP's empty targeting (criteria) with Max, from its name, description and the company profile, and SAVE it; its qualitative profile is written only if empty. An ICP that already has targeting is returned unchanged and uncharged. CHARGES credits when Max writes; slow (up to ~90s). Returns {data: Icp, filled}; 422 when Max can't work out a target.",
      inputSchema: S.fillIcpSchema,
    },
    async (input) => callApi(input.bearer_token, (t) => repo.fillIcp(t, input.icp_id)),
  );

  server.registerTool(
    "generate_icp",
    {
      title: "Generate ICP draft",
      description:
        "Draft an ICP with Max from a free-text brief (or refine icp_id). CHARGES workspace credits; slow (up to ~90s). Returns an UNSAVED {data: {draft, model, truncated}} — save it with create_icp/update_icp and source='max', then run it with search_from_icp.",
      inputSchema: S.generateIcpSchema,
    },
    async (input) =>
      callApi(input.bearer_token, (t) => repo.generateIcp(t, strip(input, "bearer_token"))),
  );

  server.registerTool(
    "search_from_icp",
    {
      title: "Search from ICP",
      description:
        "Find people matching a saved ICP: runs its criteria as a prospect search (async), the same as picking the ICP in the People search bar. Auto chain (the member's LinkedIn → GetLeads → Explorium) unless provider pins one. CHARGES credits. The list is tagged with the ICP. 422 code ICP_NO_TARGETING when the ICP has no search filters (fill them with fill_icp first), 409 ICP_ARCHIVED, 402 INSUFFICIENT_CREDITS. Returns {data: ProspectList (pending), icp_id, criteria, dropped_filters, notes}; poll with wait_for_prospect_list.",
      inputSchema: S.searchFromIcpSchema,
    },
    async (input) => {
      const body = strip(input, "bearer_token", "icp_id");
      // A retried request replays the same list instead of starting (and
      // billing) a second search.
      body.idempotency_key = input.idempotency_key ?? randomUUID();
      return callApi(input.bearer_token, (t) => repo.searchFromIcp(t, input.icp_id, body));
    },
  );
}

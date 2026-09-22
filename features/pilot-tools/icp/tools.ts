import { callApi, strip, toolHints, type McpServer } from "../shared";
import * as repo from "./repository";
import * as S from "./schema";

// Ideal Customer Profiles (max-agent /api/v1/icp/*). An ICP has a searchable
// `criteria` half and a qualitative `profile` half, and can be linked to the
// deals / organizations / prospects it describes.

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
    "generate_icp",
    {
      title: "Generate ICP draft",
      description:
        "Draft an ICP with Max from a free-text brief (or refine icp_id). CHARGES workspace credits; slow (up to ~90s). Returns an UNSAVED {data: {draft, model, truncated}} — save it with create_icp/update_icp and source='max'.",
      inputSchema: S.generateIcpSchema,
    },
    async (input) =>
      callApi(input.bearer_token, (t) => repo.generateIcp(t, strip(input, "bearer_token"))),
  );
}

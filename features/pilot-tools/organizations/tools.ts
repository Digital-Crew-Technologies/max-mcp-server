import { callApi, omitKey, strip, toolHints, type McpServer } from "../shared";
import * as repo from "./repository";
import * as S from "./schema";

export function registerOrganizationTools(server: McpServer): void {
  server.registerTool("list_organizations", {
    title: "List organizations",
    description: "List all organizations/companies — search by name or domain, filter by industry/country.",
    inputSchema: S.listOrganizationsSchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.listOrganizations(t, omitKey(input, "bearer_token"))));

  server.registerTool("get_organization", {
    title: "Get organization",
    description: "Get full details of an organization — domain, industry, employee count, funding, social URLs.",
    inputSchema: S.getOrganizationSchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) => repo.getOrganization(t, input.id)));

  server.registerTool("create_organization", {
    title: "Create organization",
    description: "Create a new organization/company record.",
    inputSchema: S.createOrganizationSchema,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.createOrganization(t, strip(input, "bearer_token"))));

  server.registerTool("update_organization", {
    title: "Update organization",
    description: "Update an organization's fields (partial update).",
    inputSchema: S.updateOrganizationSchema,
    ...toolHints.idempotent,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.updateOrganization(t, input.id, strip(input, "bearer_token", "id"))));

  server.registerTool("delete_organization", {
    title: "Delete organization",
    description: "Delete an organization. Linked prospects get organization_id = null.",
    inputSchema: S.deleteOrganizationSchema,
    ...toolHints.destructive,
  }, async (input) => callApi(input.bearer_token, (t) => repo.deleteOrganization(t, input.id)));

  server.registerTool("bulk_import_organizations", {
    title: "Bulk import organizations",
    description: "Import multiple organizations. Deduplicates by domain. Returns imported/existing/failed counts.",
    inputSchema: S.bulkImportOrganizationsSchema,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.bulkImportOrganizations(t, { organizations: input.organizations })));

  server.registerTool("bulk_delete_organizations", {
    title: "Bulk delete organizations",
    description: "Delete multiple organizations. Set deleteProspects=true to cascade-delete linked prospects.",
    inputSchema: S.bulkDeleteOrganizationsSchema,
    ...toolHints.destructive,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.bulkDeleteOrganizations(t, strip(input, "bearer_token"))));

  server.registerTool("get_organization_geo_stats", {
    title: "Get organization geo stats",
    description: "Geographic distribution of the workspace's organizations: { total, located, byCountry: [{ country, count }], byCity: [{ city, country, count }] }.",
    inputSchema: S.getOrganizationGeoSchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) => repo.getOrganizationGeoStats(t)));

  server.registerTool("get_organization_geo_points", {
    title: "Get organization map points",
    description: "The workspace's organizations geocoded from city/country to lat/lng: { points: [{ id, name, city, country, lat, lng, precision }], capped }. Ungeocodable ones are omitted; capped=true means the list was truncated.",
    inputSchema: S.getOrganizationGeoSchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) => repo.getOrganizationGeoPoints(t)));

  server.registerTool("get_organization_share_link", {
    title: "Get organization share link",
    description: "Read an organization's public share link: { data: { token, enabled, view_count, ... } | null }. Public URL is <app>/share/<token>. Owner or workspace admin only.",
    inputSchema: S.organizationShareLinkSchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) => repo.getOrganizationShareLink(t, input.id)));

  server.registerTool("create_organization_share_link", {
    title: "Create organization share link",
    description: "PUBLISHES the organization: enables an 'anyone with the link' URL (<app>/share/<token>) viewable without login. Re-enables the same token if one existed. Owner or workspace admin only; confirm with the user first.",
    inputSchema: S.organizationShareLinkSchema,
    ...toolHints.idempotent,
  }, async (input) => callApi(input.bearer_token, (t) => repo.createOrganizationShareLink(t, input.id)));

  server.registerTool("revoke_organization_share_link", {
    title: "Revoke organization share link",
    description: "Disable an organization's public share link — anyone holding the URL loses access immediately. Owner or workspace admin only.",
    inputSchema: S.organizationShareLinkSchema,
    ...toolHints.destructive,
  }, async (input) => callApi(input.bearer_token, (t) => repo.revokeOrganizationShareLink(t, input.id)));
}

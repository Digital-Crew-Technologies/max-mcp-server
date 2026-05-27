import { callApi, strip, type McpServer } from "../shared";
import * as repo from "./repository";
import * as S from "./schema";

export function registerOrganizationTools(server: McpServer): void {
  server.registerTool("list_organizations", {
    title: "List organizations",
    description: "List all organizations/companies — search by name or domain, filter by industry/country.",
    inputSchema: S.listOrganizationsSchema,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.listOrganizations(t, strip(input, "bearer_token") as any)));

  server.registerTool("get_organization", {
    title: "Get organization",
    description: "Get full details of an organization — domain, industry, employee count, funding, social URLs.",
    inputSchema: S.getOrganizationSchema,
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
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.updateOrganization(t, input.id, strip(input, "bearer_token", "id"))));

  server.registerTool("delete_organization", {
    title: "Delete organization",
    description: "Delete an organization. Linked prospects get organization_id = null.",
    inputSchema: S.deleteOrganizationSchema,
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
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.bulkDeleteOrganizations(t, strip(input, "bearer_token"))));
}

import { apiUrl, authHeaders, buildQuery, fetchWithRetry } from "../shared";

/**
 * GET /api/v1/custom-fields[?entity_type=…&includeArchived=true] — the
 * workspace's custom-field registry.
 *
 * 200 → { data: CustomFieldDefinition[] } | 400 unknown entity_type.
 *
 * Read-only from MCP, deliberately: defining/renaming/deleting fields is
 * workspace-admin configuration owned by humans in settings (the routes
 * additionally require workspace admin). Agents READ the registry so their
 * custom_fields writes on prospects/organizations/deals validate.
 */
export async function listCustomFields(
  token: string,
  params: { entity_type?: string; includeArchived?: string } = {},
): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/custom-fields${buildQuery(params)}`), {
    headers: authHeaders(token),
  });
}

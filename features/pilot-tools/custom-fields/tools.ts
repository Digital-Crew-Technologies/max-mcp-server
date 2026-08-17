// Custom-field registry MCP tool (read-only).
//
// max-agent validates every custom_fields object written to a prospect,
// organization or deal against the workspace's field registry — an unknown
// key or a wrong type is a 400. This tool lets an agent read that registry
// first, so its writes validate.
//
// READ-ONLY, deliberately: creating/renaming/archiving fields is
// workspace-admin configuration (the mutation routes require workspace:write
// PLUS workspace admin) and stays a human decision in settings. There is no
// create/update/delete tool here and there must not be.

import { callApi, toolHints, type McpServer } from "../shared";
import * as repo from "./repository";
import * as S from "./schema";

/** Read the workspace's custom-field registry. */
const CAP_CUSTOM_FIELDS_READ = "custom_fields.read";

/** Tool → the capability that governs it, for the capability-403 layer. */
export const CUSTOM_FIELDS_CAPABILITIES: Readonly<Record<string, string>> = {
  list_custom_fields: CAP_CUSTOM_FIELDS_READ,
};

export function registerCustomFieldsTools(server: McpServer): void {
  server.registerTool(
    "list_custom_fields",
    {
      title: "List custom fields",
      description:
        "List the workspace's custom-field definitions — the registry that validates the custom_fields object on every prospect / organization / deal write. Each field has entity_type, key (what you write values under), label, field_type (text, textarea, number, currency, date, boolean, single_select, multi_select, url, email, phone, user), options (for selects), is_required, default_value and is_archived. READ THIS BEFORE writing custom_fields anywhere: unknown keys or wrong types are rejected with a 400. Filter by entity_type; returns {data: CustomFieldDefinition[]}. Defining or changing fields is admin-only in the web app — there is no mutation tool.",
      inputSchema: S.listCustomFieldsSchema,
      ...toolHints.readOnly,
    },
    async (input) =>
      callApi(input.bearer_token as string | undefined, (t) =>
        repo.listCustomFields(t, {
          entity_type: input.entity_type as string | undefined,
          includeArchived: input.include_archived ? "true" : undefined,
        }),
      ),
  );
}

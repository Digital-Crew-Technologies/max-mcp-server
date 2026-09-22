import { callApi, strip, toolHints, type McpServer } from "../shared";
import * as repo from "./repository";
import * as S from "./schema";

// Saved views (max-agent /api/v1/views/*): named filter/sort/column presets for
// a list surface (prospects, organizations, campaigns, accounts,
// prospect-lists, pipeline, deals). Shared views are editable only by their
// creator or a signed-in admin, so with an API key PATCH/DELETE work only on
// views created by the key's owner.

export function registerViewTools(server: McpServer): void {
  server.registerTool(
    "list_saved_views",
    {
      title: "List saved views",
      description:
        "List one surface's saved views in tab order (workspace-shared plus your private ones). Returns {data: SavedView[]} with name, visibility, is_default, position, config.",
      inputSchema: S.listSavedViewsSchema,
      ...toolHints.readOnly,
    },
    async (input) =>
      callApi(input.bearer_token, (t) => repo.listViews(t, strip(input, "bearer_token"))),
  );

  server.registerTool(
    "get_saved_view",
    {
      title: "Get saved view",
      description: "Get one saved view by id. Returns {data: SavedView}.",
      inputSchema: S.getSavedViewSchema,
      ...toolHints.readOnly,
    },
    async (input) => callApi(input.bearer_token, (t) => repo.getView(t, input.view_id)),
  );

  server.registerTool(
    "create_saved_view",
    {
      title: "Create saved view",
      description:
        "Save a named view (filters, sorting, columns, page size) on a list surface; appended as the last tab. 409 code name_taken on a duplicate name. Returns {data: SavedView}.",
      inputSchema: S.createSavedViewSchema,
    },
    async (input) =>
      callApi(input.bearer_token, (t) => repo.createView(t, strip(input, "bearer_token"))),
  );

  server.registerTool(
    "update_saved_view",
    {
      title: "Update saved view",
      description:
        "Rename, reconfigure, reorder, share/unshare or make default a saved view. Only the view's creator (or a signed-in admin) may change it; else 403. Returns {data: SavedView}.",
      inputSchema: S.updateSavedViewSchema,
      ...toolHints.idempotent,
    },
    async (input) =>
      callApi(input.bearer_token, (t) =>
        repo.updateView(t, input.view_id, strip(input, "bearer_token", "view_id")),
      ),
  );

  server.registerTool(
    "delete_saved_view",
    {
      title: "Delete saved view",
      description:
        "Permanently delete a saved view (creator or signed-in admin only). Records are untouched. Returns {data: {id}}.",
      inputSchema: S.deleteSavedViewSchema,
      ...toolHints.destructive,
    },
    async (input) => callApi(input.bearer_token, (t) => repo.deleteView(t, input.view_id)),
  );
}

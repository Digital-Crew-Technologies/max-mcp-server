import { z } from "zod";
import { withToken } from "../shared";

// Mirrors max-agent src/features/saved-views/schemas/{saved-view.entity,saved-view.dto}.ts.

const objectKey = z
  .enum(["prospects", "pipeline", "organizations", "campaigns", "accounts", "prospect-lists", "deals"])
  .describe("List surface the view belongs to.");

const visibility = z
  .enum(["workspace", "private"])
  .describe("workspace = shared with the team (default); private = only the creator sees it.");

const viewId = z.string().uuid().describe("Saved view UUID.");

const configSchema = z
  .object({
    search: z.string().max(400).optional().describe("Toolbar free-text search."),
    filters: z
      .array(
        z.object({
          id: z.string().trim().min(1).max(120).describe("Column id."),
          value: z.unknown().describe("Filter value, as the table holds it."),
        }),
      )
      .max(50)
      .optional()
      .describe("Faceted column filters."),
    filterTree: z
      .record(z.unknown())
      .nullable()
      .optional()
      .describe(
        "Advanced filter: {kind:'group', logic:'and'|'or', children:[{kind:'condition', field, operator, value?} | group]}. Operators: eq, neq, contains, not_contains, starts_with, ends_with, gt, gte, lt, lte, before, after, in, not_in, is_empty, is_not_empty. Max depth 5, 50 conditions.",
      ),
    sorting: z
      .array(z.object({ id: z.string().trim().min(1).max(120), desc: z.boolean() }))
      .max(5)
      .optional()
      .describe("Sort columns, e.g. [{id:'created_at', desc:true}]."),
    columnVisibility: z.record(z.boolean()).optional().describe("Column id → visible."),
    pageSize: z.number().int().min(1).max(200).optional().describe("Rows per page."),
    aggregates: z
      .record(z.enum(["count", "count_not_empty", "count_empty", "count_unique", "sum", "avg", "min", "max"]))
      .optional()
      .describe("Summary chips: column id → aggregate op."),
    params: z
      .record(z.unknown())
      .optional()
      .describe("Surface-specific server filter params (e.g. People: titles, countries, employees_from)."),
  })
  .describe("View configuration. On update this REPLACES the stored config.");

export const listSavedViewsSchema = z.object({
  ...withToken,
  object: objectKey,
});

export const getSavedViewSchema = z.object({ ...withToken, view_id: viewId });

export const createSavedViewSchema = z.object({
  ...withToken,
  object_key: objectKey,
  name: z.string().trim().min(1).max(80).describe("Tab name (unique among views you can see)."),
  visibility: visibility.optional(),
  is_default: z
    .boolean()
    .optional()
    .describe("Make it the surface default (workspace views only; not supported for deals/pipeline)."),
  config: configSchema.optional(),
});

export const updateSavedViewSchema = z.object({
  ...withToken,
  view_id: viewId,
  name: z.string().trim().min(1).max(80).optional().describe("New name."),
  visibility: visibility.optional(),
  is_default: z.boolean().optional().describe("Make it (or stop it being) the surface default."),
  position: z.number().int().min(0).optional().describe("Tab order position (0-based)."),
  config: configSchema.optional(),
});

export const deleteSavedViewSchema = z.object({ ...withToken, view_id: viewId });

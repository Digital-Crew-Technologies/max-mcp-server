import { z } from "zod";
import { withToken } from "../shared";

/** Mirror of max-agent's CUSTOM_FIELD_ENTITY_TYPES. */
export const CUSTOM_FIELD_ENTITY_TYPES = [
  "prospect",
  "organization",
  "deal",
] as const;

/**
 * TENANCY — no workspace argument: the workspace is derived from the bearer
 * token by max-agent's auth gate. entity_type narrows within it.
 */
export const listCustomFieldsSchema = z.object({
  ...withToken,
  entity_type: z
    .enum(CUSTOM_FIELD_ENTITY_TYPES)
    .optional()
    .describe("Only fields defined on this entity type. Omit for all three."),
  include_archived: z
    .boolean()
    .optional()
    .describe("Also return archived fields (default false)."),
});

import { z } from "zod";
import { withToken } from "../shared";

/** Mirror of max-agent's DUPLICATE_ENTITY_TYPES. */
export const DUPLICATE_ENTITY_TYPES = ["prospect", "organization"] as const;

/**
 * TENANCY — no workspace argument: the workspace is derived from the bearer
 * token by max-agent's auth gate; the scan and the duplicate list only ever
 * cover that one workspace.
 */

export const listDuplicatesSchema = z.object({
  ...withToken,
  entity_type: z
    .enum(DUPLICATE_ENTITY_TYPES)
    .optional()
    .describe("Which entity's duplicate pairs to list (default prospect)."),
});

export const scanDuplicatesSchema = z.object({
  ...withToken,
});

export const dismissDuplicateSchema = z.object({
  ...withToken,
  id: z.string().uuid().describe("Duplicate-pair UUID (from list_duplicates)."),
});

import { z } from "zod";
import { withToken } from "../shared";

export const apolloCreateListSchema = z.object({
  ...withToken,
  list_name: z.string().min(1).describe("Name for the new list"),
  apollo_search_payload: z.record(z.unknown()).describe("Apollo mixed_people/search filter body"),
  idempotency_key: z.string().optional().describe("Idempotency key for safe retries"),
});

export const apolloAddMoreSchema = z.object({
  ...withToken,
  list_id: z.string().uuid().describe("Existing Apollo list UUID"),
  count: z.number().int().min(1).max(10000).optional().describe("Number of leads to add (default 100)"),
});

import { z } from "zod";
import { withToken } from "../shared";

const modeSchema = z
  .enum(["lite", "full"])
  .optional()
  .describe(
    "Research depth. 'lite' (default) is a fast first-pass; 'full' does deeper multi-source research and takes longer.",
  );

export const enrichProspectSchema = z.object({
  ...withToken,
  prospect_id: z.string().uuid().describe("Prospect UUID to enrich."),
  mode: modeSchema,
  force: z
    .boolean()
    .optional()
    .describe(
      "Re-run enrichment even if this prospect already has a completed result (default false).",
    ),
});

export const enrichOrganizationSchema = z.object({
  ...withToken,
  organization_id: z.string().uuid().describe("Organization UUID to enrich."),
  mode: modeSchema,
  force: z
    .boolean()
    .optional()
    .describe(
      "Re-run enrichment even if this organization already has a completed result (default false).",
    ),
});

export const bulkEnrichSchema = z
  .object({
    ...withToken,
    prospect_ids: z
      .array(z.string().uuid())
      .optional()
      .describe("Prospect UUIDs to queue for background enrichment."),
    organization_ids: z
      .array(z.string().uuid())
      .optional()
      .describe("Organization UUIDs to queue for background enrichment."),
    mode: modeSchema,
  })
  .refine(
    (b) =>
      (b.prospect_ids?.length ?? 0) + (b.organization_ids?.length ?? 0) > 0,
    { message: "Provide at least one prospect_id or organization_id." },
  );

export const getEnrichmentStatusSchema = z
  .object({
    ...withToken,
    prospect_id: z
      .string()
      .uuid()
      .optional()
      .describe("Prospect UUID to check enrichment status for."),
    organization_id: z
      .string()
      .uuid()
      .optional()
      .describe("Organization UUID to check enrichment status for."),
  })
  .refine(
    (b) => Boolean(b.prospect_id) !== Boolean(b.organization_id),
    { message: "Provide exactly one of prospect_id or organization_id." },
  );

export const getEnrichmentCreditsSchema = z.object({
  ...withToken,
});

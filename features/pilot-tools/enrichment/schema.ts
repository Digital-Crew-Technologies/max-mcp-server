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

// ── Contact enrichment / email verification / preview ──────────────────────
// Mirrors max-agent's contact-enrichment + email-verification handlers. Each
// takes prospect_ids OR list_id (max-agent 400s when neither is given); no
// .refine() here so the schema stays a plain ZodObject for grouped mode.

const targetShape = {
  prospect_ids: z
    .array(z.string().uuid())
    .optional()
    .describe("Prospect UUIDs. Provide this or list_id."),
  list_id: z
    .string()
    .uuid()
    .optional()
    .describe("Prospect list UUID (whole list). Provide this or prospect_ids."),
};

const contactFieldsSchema = z
  .array(z.enum(["email", "phone", "linkedin"]))
  .min(1)
  .optional()
  .describe("Data to find (default email+phone). Fewer fields cost less.");

export const enrichContactDetailsSchema = z.object({
  ...withToken,
  ...targetShape,
  provider: z
    .enum(["fullenrich", "explorium"])
    .optional()
    .describe("Contact supplier (default fullenrich). explorium cannot find linkedin."),
  fields: contactFieldsSchema,
  only_missing: z
    .boolean()
    .optional()
    .describe("Only enrich prospects missing a requested field (default false)."),
  verify_after: z
    .boolean()
    .optional()
    .describe("Chain an email verification once contacts land (extra credits)."),
});

export const getContactEnrichmentJobSchema = z.object({
  ...withToken,
  job_id: z.string().uuid().describe("Job UUID from enrich_contact_details."),
});

export const verifyEmailsSchema = z.object({
  ...withToken,
  ...targetShape,
});

export const getEmailVerificationJobSchema = z.object({
  ...withToken,
  job_id: z.string().uuid().describe("Job UUID from verify_emails."),
});

export const previewEnrichmentSchema = z.object({
  ...withToken,
  ...targetShape,
  fields: contactFieldsSchema,
  only_missing: z
    .boolean()
    .optional()
    .describe("Estimate only prospects missing a requested field."),
});

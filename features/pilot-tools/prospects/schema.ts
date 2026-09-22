import { z } from "zod";
import { withToken } from "../shared";

const prospectStatusEnum = z.enum(["prospect", "contacted", "replied", "interested", "not_interested", "existing_client"]);

export const listProspectsSchema = z.object({
  ...withToken,
  page: z.number().int().min(1).optional().describe("Page number (default 1)"),
  pageSize: z.number().int().min(1).max(100).optional().describe("Results per page (default 20, max 100)"),
  search: z.string().optional().describe("Search by name, email, or title"),
  status: prospectStatusEnum.optional().describe("Filter by status"),
  organization_id: z.string().uuid().optional().describe("Filter by organization UUID"),
  titles: z.array(z.string()).optional().describe("Filter by job titles (contains-any)"),
  countries: z.array(z.string()).optional().describe("Filter by countries"),
  industries: z.array(z.string()).optional().describe("Filter by industries"),
  sortBy: z.enum(["first_name", "last_name", "email", "title", "status", "created_at", "updated_at"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});

export const getProspectSchema = z.object({
  ...withToken,
  id: z.string().uuid().describe("Prospect UUID"),
});

export const createProspectSchema = z.object({
  ...withToken,
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  email: z.string().email().optional().describe("Primary email (used for dedup)"),
  title: z.string().optional().describe("Job title"),
  linkedin_url: z.string().optional().describe("LinkedIn profile URL"),
  organization_id: z.string().uuid().optional().describe("Organization UUID"),
  country: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  status: prospectStatusEnum.optional(),
  headline: z.string().optional(),
  seniority: z.string().optional(),
  phone_number: z.string().optional().describe("Phone number"),
  notes: z.string().optional().describe("Free-form note about the prospect"),
});

export const updateProspectSchema = z.object({
  ...withToken,
  id: z.string().uuid().describe("Prospect UUID"),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  email: z.string().email().optional(),
  title: z.string().optional(),
  linkedin_url: z.string().optional(),
  organization_id: z.string().uuid().nullable().optional(),
  country: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  status: prospectStatusEnum.optional(),
  phone_number: z.string().optional().describe("Phone number"),
  notes: z.string().optional().describe("Free-form note about the prospect"),
});

export const deleteProspectSchema = z.object({
  ...withToken,
  id: z.string().uuid().describe("Prospect UUID"),
});

export const bulkImportProspectsSchema = z.object({
  ...withToken,
  prospects: z.array(z.object({
    email: z.string().email().optional(),
    first_name: z.string().optional(),
    last_name: z.string().optional(),
    title: z.string().optional(),
    linkedin_url: z.string().optional(),
    organization_domain: z.string().optional().describe("Auto-attach/create org by domain"),
    country: z.string().optional(),
    status: prospectStatusEnum.optional(),
  })).min(1).describe("Array of prospect records to import"),
});

export const bulkDeleteProspectsSchema = z.object({
  ...withToken,
  ids: z.array(z.string().uuid()).min(1).describe("Prospect UUIDs to delete"),
});

export const getProspectCampaignActivitySchema = z.object({
  ...withToken,
  id: z.string().uuid().describe("Prospect UUID"),
});

// ── Prospect sub-resources ───────────────────────────────────────────────────

const prospectId = z.string().uuid().describe("Prospect UUID");
const hookId = z.string().uuid().describe("Profile hook UUID");

/** Any tool whose only argument is the prospect id. */
export const prospectIdSchema = z.object({
  ...withToken,
  id: prospectId,
});

const hookSourceEnum = z
  .enum(["all", "linkedin", "twitter", "instagram", "facebook", "tiktok", "youtube"])
  .describe("Platform to poll (scrapecreators hooks; default all)");
const hookFrequencyEnum = z.enum(["daily", "weekly", "monthly"]).describe("How often the hook re-runs");
const hookLabel = z.string().max(120).nullable().optional().describe("Display label");
const hookPrompt = z
  .string()
  .max(2000)
  .nullable()
  .optional()
  .describe("Claire hooks: custom research question (else a person deep-research)");

export const createProspectProfileHookSchema = z.object({
  ...withToken,
  id: prospectId,
  provider: z
    .enum(["scrapecreators", "fullenrich", "claire"])
    .describe("scrapecreators = social posts; fullenrich = contact re-enrichment; claire = research"),
  source: hookSourceEnum.optional(),
  label: hookLabel,
  custom_prompt: hookPrompt,
  frequency: hookFrequencyEnum.optional(),
});

export const updateProspectProfileHookSchema = z.object({
  ...withToken,
  id: prospectId,
  hook_id: hookId,
  source: hookSourceEnum.optional(),
  label: hookLabel,
  custom_prompt: hookPrompt,
  frequency: hookFrequencyEnum.optional(),
  active: z.boolean().optional().describe("false pauses the hook"),
});

export const prospectProfileHookIdSchema = z.object({
  ...withToken,
  id: prospectId,
  hook_id: hookId,
});

/** Tools with no arguments beyond the token (workspace People share link). */
export const tokenOnlySchema = z.object({ ...withToken });

export const searchWorkspaceSchema = z.object({
  ...withToken,
  q: z.string().min(1).max(200).describe("Search text (under 2 chars returns no groups)"),
  types: z
    .array(z.enum(["person", "organization", "deal", "list", "campaign", "task", "note"]))
    .optional()
    .describe("Entity kinds to search (default all enabled)"),
  limit: z.number().int().min(1).max(20).optional().describe("Hits per group (default 5, max 20)"),
});

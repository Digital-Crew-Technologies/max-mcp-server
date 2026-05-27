import { z } from "zod";
import { withToken } from "../shared";

const prospectStatusEnum = z.enum(["prospect", "contacted", "replied", "not_interested", "existing_client"]);

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
  phone: z.string().optional(),
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

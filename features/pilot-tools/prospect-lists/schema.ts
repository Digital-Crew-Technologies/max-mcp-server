import { z } from "zod";
import { withToken } from "../shared";

const prospectStatusEnum = z.enum(["prospect", "contacted", "replied", "not_interested", "existing_client"]);

export const listProspectListsSchema = z.object({
  ...withToken,
  page: z.number().int().min(1).optional().describe("Page number (default 1)"),
  pageSize: z.number().int().min(1).max(100).optional().describe("Results per page (default 20, max 100)"),
});

export const getProspectListSchema = z.object({
  ...withToken,
  id: z.string().uuid().describe("Prospect list UUID"),
});

export const createProspectListSchema = z.object({
  ...withToken,
  list_name: z.string().min(1).describe("Name for the new list"),
  search_source: z.enum(["apollo", "platform"]).optional().describe("Source type (default: platform)"),
});

export const updateProspectListSchema = z.object({
  ...withToken,
  id: z.string().uuid().describe("Prospect list UUID"),
  list_name: z.string().min(1).optional().describe("New name"),
  status: z.enum(["pending", "processing", "completed", "failed", "cancelled"]).optional(),
});

export const deleteProspectListSchema = z.object({
  ...withToken,
  id: z.string().uuid().describe("Prospect list UUID"),
});

export const listProspectListMembersSchema = z.object({
  ...withToken,
  id: z.string().uuid().describe("Prospect list UUID"),
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
  search: z.string().optional(),
  sortBy: z.enum(["first_name", "last_name", "email", "created_at"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
  status: z.array(prospectStatusEnum).optional(),
});

export const addProspectsToListSchema = z.object({
  ...withToken,
  id: z.string().uuid().describe("Prospect list UUID"),
  prospect_ids: z.array(z.string().uuid()).min(1).describe("Prospect UUIDs to add"),
});

export const removeProspectsFromListSchema = z.object({
  ...withToken,
  id: z.string().uuid().describe("Prospect list UUID"),
  prospect_ids: z.array(z.string().uuid()).min(1).describe("Prospect UUIDs to remove"),
});

export const searchProspectListsSchema = z.object({
  ...withToken,
  search_config: z.object({
    titles: z.array(z.string()).optional(),
    countries: z.array(z.string()).optional(),
    industries: z.array(z.string()).optional(),
    keywords: z.array(z.string()).optional(),
    status: z.array(z.string()).optional(),
    employees_from: z.number().int().optional(),
    employees_to: z.number().int().optional(),
    organization_id: z.string().uuid().optional(),
  }).describe("Filter criteria for prospect search"),
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
});

export const waitForProspectListSchema = z.object({
  ...withToken,
  id: z.string().uuid().describe("Prospect list UUID to poll"),
  timeout_seconds: z.number().int().min(5).max(300).optional().describe("Max wait time in seconds (default 120, max 300)"),
  poll_interval_seconds: z.number().int().min(2).max(30).optional().describe("Seconds between polls (default 5)"),
});

export const importProspectListCsvSchema = z.object({
  ...withToken,
  list_name: z.string().min(1).describe("Name for the new list"),
  prospects: z.array(z.object({
    email: z.string().email(),
    first_name: z.string().optional(),
    last_name: z.string().optional(),
    title: z.string().optional(),
    linkedin_url: z.string().optional(),
    country: z.string().optional(),
  })).min(1).describe("Prospect records with required email"),
});

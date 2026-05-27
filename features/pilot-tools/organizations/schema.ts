import { z } from "zod";
import { withToken } from "../shared";

export const listOrganizationsSchema = z.object({
  ...withToken,
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
  search: z.string().optional().describe("Search by name or domain"),
  industry: z.array(z.string()).optional(),
  country: z.string().optional(),
  sortBy: z.enum(["name", "primary_domain", "industry", "created_at", "updated_at"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});

export const getOrganizationSchema = z.object({
  ...withToken,
  id: z.string().uuid().describe("Organization UUID"),
});

export const createOrganizationSchema = z.object({
  ...withToken,
  name: z.string().min(1).describe("Company name"),
  primary_domain: z.string().optional().describe("Primary domain (e.g. example.com)"),
  website_url: z.string().optional(),
  linkedin_url: z.string().optional(),
  industry: z.string().optional(),
  estimated_num_employees: z.string().optional().describe("Range like '11-50'"),
  country: z.string().optional(),
  city: z.string().optional(),
  short_description: z.string().optional(),
});

export const updateOrganizationSchema = z.object({
  ...withToken,
  id: z.string().uuid().describe("Organization UUID"),
  name: z.string().min(1).optional(),
  primary_domain: z.string().optional(),
  website_url: z.string().optional(),
  linkedin_url: z.string().optional(),
  industry: z.string().optional(),
  estimated_num_employees: z.string().optional(),
  country: z.string().optional(),
  city: z.string().optional(),
  short_description: z.string().optional(),
});

export const deleteOrganizationSchema = z.object({
  ...withToken,
  id: z.string().uuid().describe("Organization UUID"),
});

export const bulkImportOrganizationsSchema = z.object({
  ...withToken,
  organizations: z.array(z.object({
    name: z.string().min(1),
    primary_domain: z.string().optional(),
    website_url: z.string().optional(),
    industry: z.string().optional(),
    estimated_num_employees: z.string().optional(),
    country: z.string().optional(),
  })).min(1).describe("Array of organization records"),
});

export const bulkDeleteOrganizationsSchema = z.object({
  ...withToken,
  ids: z.array(z.string().uuid()).min(1).describe("Organization UUIDs to delete"),
  deleteProspects: z.boolean().optional().describe("Also delete linked prospects (default false)"),
});

import { z } from "zod";

export const workspaceProfileCompanySizeSchema = z.enum([
  "1-10",
  "11-50",
  "51-200",
  "201+",
]);

export const upsertWorkspaceProfileSettingsToolSchema = z.object({
  company_name: z.string().min(1, "Company name is required"),
  company_website_url: z.string().url("Valid website URL is required"),
  company_description: z
    .string()
    .min(1, "Company description is required")
    .max(200, "Company description must be 200 characters or less"),
  industry: z.string().min(1, "Industry is required"),
  company_size: workspaceProfileCompanySizeSchema,
  main_products_services: z
    .string()
    .min(1, "Main products/services is required"),
  key_customer_pain_points: z
    .string()
    .min(1, "Key customer pain points is required"),
});

export const getWorkspaceProfileToolSchema = z.object({
  bearer_token: z.string().optional(),
});

export const updateWorkspaceProfileToolSchema =
  upsertWorkspaceProfileSettingsToolSchema.extend({
    bearer_token: z.string().optional(),
  });

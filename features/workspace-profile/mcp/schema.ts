import { z } from "zod";

export const workspaceProfileCompanySizeSchema = z.enum([
  "1-10",
  "11-50",
  "51-200",
  "201+",
]);

/**
 * `agent_settings` sub-schemas. Mirrors the `AgentSettingsConfig` interface in
 * `features/pilot-tools/crm/agent-settings.ts`, which is what the pilot tools read
 * back. Every field is optional: the PUT is an upsert and callers may send a partial
 * config.
 */
export const workspaceIcpRulesSchema = z.object({
  countries: z.array(z.string()).optional(),
  industries: z.array(z.string()).optional(),
  employee_min: z.number().nullable().optional(),
  employee_max: z.number().nullable().optional(),
  title_keywords: z.array(z.string()).optional(),
});

export const workspaceAssignmentRuleSchema = z.object({
  if: z
    .object({
      country: z.array(z.string()).optional(),
      industry: z.array(z.string()).optional(),
      product: z.string().optional(),
    })
    .optional(),
  assign_to_owner_id: z.string().min(1),
});

export const workspaceRiskThresholdsSchema = z.object({
  inactive_days: z.number().optional(),
  close_date_slip_days: z.number().optional(),
  high_value_threshold_eur: z.number().optional(),
  low_activity_threshold_count: z.number().optional(),
});

export const workspaceAgentSettingsSchema = z.object({
  icp_rules: workspaceIcpRulesSchema.optional(),
  assignment_rules: z.array(workspaceAssignmentRuleSchema).optional(),
  risk_thresholds: workspaceRiskThresholdsSchema.optional(),
  notion_drafts_parent_id: z.string().nullable().optional(),
  notion_weekly_template_id: z.string().nullable().optional(),
  agent_settings_v: z.number().optional(),
});

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
  agent_settings: workspaceAgentSettingsSchema
    .optional()
    .describe(
      "Agent behaviour config. icp_rules drives crm_score_prospects, assignment_rules " +
        "drives crm_assign_prospects, risk_thresholds drives crm_pipeline_risk_scan. " +
        "Omit to leave the stored config untouched. Note: allow_crm_writes and " +
        "allow_notion_writes are deliberately NOT exposed here — they are informational " +
        "only and are not the write gate (see features/pilot-tools/crm/agent-settings.ts).",
    ),
});

export const getWorkspaceProfileToolSchema = z.object({
  bearer_token: z.string().optional(),
});

export const updateWorkspaceProfileToolSchema =
  upsertWorkspaceProfileSettingsToolSchema.extend({
    bearer_token: z.string().optional(),
  });

import { describe, expect, it } from "vitest";

import {
  updateWorkspaceProfileToolSchema,
  workspaceAgentSettingsSchema,
} from "./schema";

const baseProfile = {
  company_name: "Acme",
  company_website_url: "https://acme.example",
  company_description: "Widgets",
  industry: "Manufacturing",
  company_size: "51-200" as const,
  main_products_services: "Widgets",
  key_customer_pain_points: "Slow widgets",
};

describe("updateWorkspaceProfileToolSchema — agent_settings", () => {
  it("accepts a profile without agent_settings (backwards compatible)", () => {
    const parsed = updateWorkspaceProfileToolSchema.parse(baseProfile);
    expect(parsed.agent_settings).toBeUndefined();
  });

  it("accepts icp_rules, assignment_rules and risk_thresholds", () => {
    const parsed = updateWorkspaceProfileToolSchema.parse({
      ...baseProfile,
      agent_settings: {
        icp_rules: {
          countries: ["FR"],
          industries: ["Construction"],
          employee_min: 50,
          employee_max: 500,
          title_keywords: ["BIM"],
        },
        assignment_rules: [
          { if: { country: ["FR"] }, assign_to_owner_id: "12345" },
          { assign_to_owner_id: "67890" },
        ],
        risk_thresholds: { inactive_days: 21 },
      },
    });
    expect(parsed.agent_settings?.icp_rules?.countries).toEqual(["FR"]);
    expect(parsed.agent_settings?.assignment_rules).toHaveLength(2);
    expect(parsed.agent_settings?.risk_thresholds?.inactive_days).toBe(21);
  });

  it("accepts null employee bounds and null notion ids", () => {
    const parsed = workspaceAgentSettingsSchema.parse({
      icp_rules: { employee_min: null, employee_max: null },
      notion_drafts_parent_id: null,
      notion_weekly_template_id: null,
    });
    expect(parsed.icp_rules?.employee_min).toBeNull();
    expect(parsed.notion_drafts_parent_id).toBeNull();
  });

  it("rejects an assignment rule without assign_to_owner_id", () => {
    expect(() =>
      workspaceAgentSettingsSchema.parse({
        assignment_rules: [{ if: { country: ["FR"] } }],
      }),
    ).toThrow();
  });

  it("does not expose the informational write flags", () => {
    const parsed = workspaceAgentSettingsSchema.parse({}) as Record<string, unknown>;
    expect(parsed.allow_crm_writes).toBeUndefined();
    expect(parsed.allow_notion_writes).toBeUndefined();
  });
});

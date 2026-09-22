import { z } from "zod";
import { withToken } from "../shared";

// Mirrors max-agent src/features/icp/schemas/{icp.entity,icp.dto,icp-link.entity}.ts.

const TEXT_MAX = 400;
const LIST_MAX = 40;

const chips = (what: string) =>
  z.array(z.string().trim().min(1).max(TEXT_MAX)).max(LIST_MAX).optional().describe(what);

const icpId = z.string().uuid().describe("ICP UUID.");

/** Searchable half — same vocabulary as the People search bar. */
const criteriaSchema = z
  .object({
    jobTitles: chips("Job titles."),
    seniorities: z
      .array(z.enum(["c_suite", "vp", "director", "manager", "senior", "entry", "owner", "partner"]))
      .max(LIST_MAX)
      .optional()
      .describe("Seniority levels."),
    personLocations: chips("Person locations (countries, regions, cities)."),
    industries: chips("Company industries."),
    companySize: z
      .object({
        min: z.number().int().min(0).optional().describe("Min employees."),
        max: z.number().int().min(0).optional().describe("Max employees."),
      })
      .optional()
      .describe("Employee-count range."),
    companyRevenue: chips("Company revenue bands."),
    jobDepartments: chips("Departments."),
    keywords: chips("Keywords."),
    companyDomains: chips("Company domains to target."),
    excludeCompanyDomains: chips("Company domains to exclude."),
    intentTopics: chips("Buying-intent topics."),
  })
  .describe(
    "Machine-searchable audience filters. On update this REPLACES the whole criteria object — omitted lists become empty.",
  );

/** Qualitative half — short statements, one per item. */
const profileSchema = z
  .object({
    painPoints: chips("What is broken for them today."),
    triggers: chips("Events that make them start looking."),
    valueProps: chips("What we say we do about it."),
    objections: chips("What they push back with."),
    disqualifiers: chips("What rules an otherwise-matching account out."),
    channels: chips("Where they answer."),
    techStack: chips("Tools they run that matter to the pitch."),
    personas: z
      .array(
        z.object({
          role: z.string().trim().min(1).max(TEXT_MAX).describe("Buying role."),
          pain: z.string().trim().max(TEXT_MAX).optional().describe("Their pain."),
          goal: z.string().trim().max(TEXT_MAX).optional().describe("Their goal."),
        }),
      )
      .max(10)
      .optional()
      .describe("Buying-committee roles."),
  })
  .describe(
    "Qualitative profile (pains, triggers, value props…). On update this REPLACES the whole profile object.",
  );

const icpFields = {
  description: z.string().trim().max(4000).nullable().optional().describe("Free-text summary."),
  criteria: criteriaSchema.optional(),
  profile: profileSchema.optional(),
  status: z.enum(["active", "archived"]).optional().describe("active (default) or archived."),
  is_default: z
    .boolean()
    .optional()
    .describe("Make this the workspace default ICP (moves the flag off the previous one)."),
  source: z
    .enum(["manual", "max", "onboarding"])
    .optional()
    .describe("Provenance; use 'max' when saving a generate_icp draft."),
  generated_model: z
    .string()
    .max(200)
    .nullable()
    .optional()
    .describe("Model that wrote the draft (from generate_icp)."),
};

const entityType = z
  .enum(["deal", "organization", "prospect"])
  .describe("Kind of record: deal, organization or prospect.");

export const listIcpsSchema = z.object({
  ...withToken,
  status: z
    .enum(["active", "archived", "all"])
    .optional()
    .describe("Filter by status (default active)."),
  search: z.string().trim().max(200).optional().describe("Case-insensitive name match."),
});

export const getIcpSchema = z.object({ ...withToken, icp_id: icpId });

export const createIcpSchema = z.object({
  ...withToken,
  name: z.string().trim().min(1).max(120).describe("Profile name (unique in the workspace)."),
  ...icpFields,
});

export const updateIcpSchema = z.object({
  ...withToken,
  icp_id: icpId,
  name: z.string().trim().min(1).max(120).optional().describe("New name."),
  ...icpFields,
});

export const deleteIcpSchema = z.object({ ...withToken, icp_id: icpId });

export const listIcpLinksSchema = z.object({ ...withToken, icp_id: icpId });

export const linkIcpSchema = z.object({
  ...withToken,
  icp_id: icpId,
  entity_type: entityType,
  entity_id: z.string().uuid().describe("UUID of the deal / organization / prospect."),
  fit_score: z
    .number()
    .int()
    .min(0)
    .max(100)
    .nullable()
    .optional()
    .describe("How well the record fits, 0-100."),
  rationale: z.string().trim().max(2000).nullable().optional().describe("Why it fits."),
  linked_by: z.enum(["manual", "max"]).optional().describe("Who made the link (default manual)."),
});

export const unlinkIcpSchema = z.object({
  ...withToken,
  icp_id: icpId,
  link_id: z.string().uuid().describe("Link UUID (from list_icp_links)."),
});

export const listIcpsForRecordSchema = z.object({
  ...withToken,
  entity_type: entityType,
  entity_id: z.string().uuid().describe("UUID of the record."),
});

export const generateIcpSchema = z.object({
  ...withToken,
  instructions: z
    .string()
    .trim()
    .max(6000)
    .nullable()
    .optional()
    .describe("Market/segment brief. Omit to work from the workspace's company profile."),
  icp_id: z
    .string()
    .uuid()
    .nullable()
    .optional()
    .describe("Existing ICP to refine instead of writing a new one."),
});

import { z } from "zod";

import { withToken } from "../shared";



/** Workflow canvas node — keys typed; `data` bag is open for node-specific config. */

export const workflowNodeSchema = z.object({

  id: z.string().min(1),

  type: z.string().min(1),

  position: z.object({ x: z.number(), y: z.number() }).optional(),

  data: z.record(z.string(), z.unknown()).optional(),

});



export const workflowEdgeSchema = z.object({

  id: z.string().min(1),

  source: z.string().min(1),

  target: z.string().min(1),

  sourceHandle: z.string().optional(),

  targetHandle: z.string().optional(),

});



const workflowConfigSchema = z.object({

  nodes: z.array(workflowNodeSchema).min(1),

  edges: z.array(workflowEdgeSchema).optional(),

});



const looseConfigRecord = z.record(z.string(), z.unknown());



export const listCampaignsSchema = z.object({

  ...withToken,

  page: z.number().int().min(1).optional().describe("Page number (default 1)"),

  pageSize: z.number().int().min(1).max(100).optional().describe("Results per page (default 20, max 100)"),

  status: z.enum(["draft", "active", "paused", "completed", "stopped", "archived"]).optional().describe("Filter by status"),

  search: z.string().optional().describe("Search by campaign name"),

  sortBy: z.enum(["name", "status", "created_at", "updated_at", "started_at", "last_activity_at"]).optional().describe("Sort column"),

  sortOrder: z.enum(["asc", "desc"]).optional().describe("Sort direction"),

});



export const getCampaignSchema = z.object({

  ...withToken,

  id: z.string().uuid().describe("Campaign UUID"),

});



export const getCampaignMemorySchema = z.object({

  ...withToken,

  id: z.string().uuid().describe("Campaign UUID"),

});



export const updateCampaignMemorySchema = z.object({

  ...withToken,

  id: z.string().uuid().describe("Campaign UUID"),

  memory: z

    .record(z.string(), z.unknown())

    .describe(

      "Partial memory object to merge; top-level keys replace (send the full array to change decisions/notes). e.g. { summary, icp, decisions: [], notes: [] }",

    ),

});



export const createCampaignSchema = z.object({

  ...withToken,

  name: z.string().min(1).max(255).describe("Campaign name"),

  description: z.string().max(1000).optional().describe("Campaign description"),

  included_lists: z.array(z.string().uuid()).min(1).describe("Prospect list UUIDs to include"),

  accounts: z.array(z.object({

    account_id: z.string().uuid(),

    enabled: z.boolean().optional(),

    priority: z.number().int().min(0).max(100).optional(),

    rotation_weight: z.number().int().min(1).optional(),

  })).min(1).describe("Sending accounts"),

  excluded_lists: z.array(z.string().uuid()).optional().describe("Prospect list UUIDs to exclude"),

  workflow_config: workflowConfigSchema.optional().describe("Workflow canvas config (nodes and edges)"),

  exclusion_settings: looseConfigRecord.optional().describe("Exclusion rules"),

  scheduling_config: looseConfigRecord.optional().describe("Scheduling config"),

});



export const updateCampaignSchema = z.object({

  ...withToken,

  id: z.string().uuid().describe("Campaign UUID"),

  name: z.string().min(1).optional().describe("Campaign name"),

  description: z.string().nullable().optional().describe("Campaign description"),

  workflow_config: workflowConfigSchema.optional().describe("Updated workflow config"),

  included_lists: z.array(z.string().uuid()).optional(),

  excluded_lists: z.array(z.string().uuid()).optional(),

  accounts: z.array(z.object({

    account_id: z.string().uuid(),

    enabled: z.boolean().optional(),

    priority: z.number().int().optional(),

    rotation_weight: z.number().int().optional(),

  })).optional(),

  exclusion_settings: looseConfigRecord.optional(),

  scheduling_config: looseConfigRecord.optional(),

});



export const deleteCampaignSchema = z.object({

  ...withToken,

  id: z.string().uuid().describe("Campaign UUID"),

});



export const campaignTransitionSchema = z.object({

  ...withToken,

  id: z.string().uuid().describe("Campaign UUID"),

});



export const getCampaignStatsSchema = z.object({

  ...withToken,

  id: z.string().uuid().describe("Campaign UUID"),

});



export const getCampaignLeadAnalyticsSchema = z.object({

  ...withToken,

  id: z.string().uuid().describe("Campaign UUID"),

  page: z.number().int().min(1).optional(),

  pageSize: z.number().int().min(1).max(100).optional(),

});



export const getCampaignNodeRunCountsSchema = z.object({

  ...withToken,

  id: z.string().uuid().describe("Campaign UUID"),

});


export const listSchedulePresetsSchema = z.object({
  ...withToken,
});

export const createSchedulePresetSchema = z.object({
  ...withToken,
  name: z.string().min(1).max(80).describe("Name for the saved schedule, e.g. 'European business hours'"),
  scheduling_config: looseConfigRecord.describe(
    "Scheduling config to store — { timezone, available_days: [0-6], time_windows: [{ start: 'HH:mm', end: 'HH:mm', timezone }] }",
  ),
  is_default: z.boolean().optional().describe("Pre-fill this schedule on new campaigns (replaces the current default)"),
});

export const updateSchedulePresetSchema = z.object({
  ...withToken,
  id: z.string().uuid().describe("Schedule preset UUID"),
  name: z.string().min(1).max(80).optional().describe("New name"),
  scheduling_config: looseConfigRecord.optional().describe("Replacement scheduling config"),
  is_default: z.boolean().optional().describe("Make this the schedule pre-filled on new campaigns"),
});

export const deleteSchedulePresetSchema = z.object({
  ...withToken,
  id: z.string().uuid().describe("Schedule preset UUID"),
});

// ── A/B tests ────────────────────────────────────────────────────────────────

const campaignId = () => z.string().uuid().describe("Campaign UUID");

export const getCampaignAbTestsSchema = z.object({
  ...withToken,
  id: campaignId(),
});

// max-agent's body is a discriminated union on `action`. It is flattened here
// (a union is not a ZodObject, which the grouped-tool adapter requires) and the
// discriminator is renamed `operation`, because `action` is the grouped tool's
// own discriminator and would collide with it.
export const updateCampaignAbTestSchema = z.object({
  ...withToken,
  id: campaignId(),
  operation: z
    .enum(["pause", "activate", "promote", "set_weights", "reset"])
    .describe(
      "pause/activate a variant; promote = send only this variant and pause the rest; set_weights = re-split traffic; reset = back to the step's saved split, nothing paused",
    ),
  node_id: z.string().min(1).describe("Email step node_id (from get_campaign_ab_tests)"),
  variant_id: z.string().min(1).optional().describe("Variant id — required for pause, activate and promote"),
  weights: z
    .record(z.string(), z.number().int().min(0).max(100))
    .optional()
    .describe("Required for set_weights: { variant_id: weight 0-100 } relative to siblings"),
});

// ── Audience ────────────────────────────────────────────────────────────────

export const getCampaignAudienceSchema = z.object({
  ...withToken,
  id: campaignId(),
});

export const listCampaignAudienceProspectsSchema = z.object({
  ...withToken,
  id: campaignId(),
  page: z.number().int().min(1).optional().describe("Page number (default 1)"),
  pageSize: z.number().int().min(1).max(100).optional().describe("Results per page (default 20, max 100)"),
  search: z.string().optional().describe("Free text over name and email"),
  // Not `status`: in grouped mode a shared field name is published with its
  // FIRST definition, which is list_campaigns' campaign-status enum.
  enrollment_status: z
    .enum(["active", "finished", "opted_out", "skipped", "removed"])
    .optional()
    .describe("Enrollment status filter"),
  source: z.enum(["list", "manual"]).optional().describe("How they were added: from a list, or directly"),
});

export const addCampaignAudienceProspectsSchema = z.object({
  ...withToken,
  id: campaignId(),
  prospect_ids: z.array(z.string().uuid()).max(1000).optional().describe("Prospect UUIDs to add (max 1000)"),
  organization_ids: z
    .array(z.string().uuid())
    .max(200)
    .optional()
    .describe("Add everyone at these organizations (max 200 orgs; at most 1000 people per call)"),
  stage_keys: z
    .array(z.string().min(1).max(64).regex(/^[a-z0-9][a-z0-9_-]*$/))
    .max(50)
    .optional()
    .describe("Add everyone currently in these pipeline stages (max 50 stages; at most 1000 people per call)"),
});

export const removeCampaignAudienceProspectsSchema = z.object({
  ...withToken,
  id: campaignId(),
  prospect_ids: z.array(z.string().uuid()).min(1).max(1000).describe("Prospect UUIDs to remove (max 1000)"),
});

export const attachCampaignAudienceListSchema = z.object({
  ...withToken,
  id: campaignId(),
  prospect_list_id: z.string().uuid().describe("Prospect list UUID"),
  inclusion_type: z.enum(["included", "excluded"]).optional().describe("Default 'included'"),
  enroll_now: z
    .boolean()
    .optional()
    .describe("Enroll an included list's new members right away (default true); false = attach only"),
});

export const detachCampaignAudienceListSchema = z.object({
  ...withToken,
  id: campaignId(),
  list_id: z.string().uuid().describe("Prospect list UUID to detach"),
});

export const syncCampaignAudienceSchema = z.object({
  ...withToken,
  id: campaignId(),
});

// ── Feeds, preflight, duplicate ─────────────────────────────────────────────

export const listCampaignConversationsSchema = z.object({
  ...withToken,
  id: campaignId(),
});

export const getCampaignFeedSchema = z.object({
  ...withToken,
  id: campaignId(),
  limit: z.number().int().min(1).max(100).optional().describe("Max steps to return (default 20, max 100)"),
});

export const getCampaignLaunchPreflightSchema = z.object({
  ...withToken,
  id: campaignId(),
});

export const duplicateCampaignSchema = z.object({
  ...withToken,
  id: campaignId(),
  name: z.string().trim().min(1).max(255).optional().describe("Name for the copy (default '<source name> (Copy)')"),
});

export const bulkGetCampaignNodeRunCountsSchema = z.object({
  ...withToken,
  ids: z.array(z.string().uuid()).min(1).max(100).describe("Campaign UUIDs (max 100)"),
});

// ── Share link ──────────────────────────────────────────────────────────────

export const campaignShareLinkSchema = z.object({
  ...withToken,
  id: campaignId(),
});

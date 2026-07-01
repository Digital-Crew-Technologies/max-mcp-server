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

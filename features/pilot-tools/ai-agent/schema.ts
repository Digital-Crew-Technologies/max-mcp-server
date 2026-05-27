import { z } from "zod";
import { withToken } from "../shared";

export const generateWorkflowSchema = z.object({
  ...withToken,
  prompt: z.string().max(2000).optional().describe("Freeform prompt describing the campaign sequence"),
  campaign_purpose_goal: z.string().max(500).optional(),
  specific_target_audience: z.string().max(500).optional(),
  main_value_proposition_hook: z.string().max(500).optional(),
  primary_call_to_action: z.string().max(500).optional(),
});

export const generateMessagePreviewSchema = z.object({
  ...withToken,
  channel: z.enum(["email", "linkedin_inmail", "linkedin_message"]).describe("Message channel"),
  prompt: z.string().min(1).max(4000).describe("Instructions for the message"),
  prospect_id: z.string().uuid().describe("Prospect UUID to personalize for"),
  model: z.string().optional(),
  temperature: z.number().min(0).max(1).optional(),
});

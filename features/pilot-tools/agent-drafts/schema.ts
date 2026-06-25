import { z } from "zod";
import { withToken } from "../shared";

// Agent drafts = the agent_action_drafts table in max-agent. Any agent (Hermes,
// the max-mcp chat agent, future agents) can use these tools to stage a write
// that the human approves in the workspace UI before it actually executes.

export const agentDraftActionType = z.enum([
  "notion_publish_weekly_brief",
  "teams_send_nudge",
  "crm_upsert_contact",
  "crm_upsert_company",
  "prospect_csv_export",
]);

export const agentDraftState = z.enum([
  "pending",
  "approved",
  "rejected",
  "executed",
  "failed",
  "canceled",
]);

export const agentDraftCreateSchema = z.object({
  ...withToken,
  action_type: agentDraftActionType.describe(
    "What action this draft will execute once approved. Determines which downstream tool runs the payload.",
  ),
  title: z
    .string()
    .optional()
    .describe(
      "Short human-readable title shown in the agent drafts row (e.g. 'Send nudge: Acme deal, EUR 80k'). Defaults to the action_type if omitted.",
    ),
  summary: z
    .string()
    .optional()
    .describe(
      "1–3 sentence explanation of what will happen on approval — context for the human approver.",
    ),
  payload: z
    .record(z.any())
    .describe(
      "Free-form action arguments — exactly the args the downstream tool will receive on approval. Stored verbatim, no mutation.",
    ),
});

export const agentDraftListSchema = z.object({
  ...withToken,
  state: agentDraftState
    .optional()
    .describe(
      "Filter to drafts in this state. Omit to return all states (pending first).",
    ),
  action_type: z
    .string()
    .optional()
    .describe("Filter to drafts of this action_type."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .describe("Max drafts to return (1–100). Default 20."),
  cursor: z
    .string()
    .optional()
    .describe("Pagination cursor from a prior list call."),
});

export const agentDraftGetSchema = z.object({
  ...withToken,
  draft_id: z
    .string()
    .uuid()
    .describe("UUID of the draft to fetch."),
});

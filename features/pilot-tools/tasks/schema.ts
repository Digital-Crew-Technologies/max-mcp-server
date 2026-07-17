import { z } from "zod";
import { withToken } from "../shared";

// Mirrors the frozen contract in max-agent
// (src/features/tasks/tasks.types.ts). Extend by ADDING optional fields only.

export const TASK_STATUSES = [
  "suggested",
  "approved",
  "in_progress",
  "completed",
  "rejected",
  "superseded",
  "cancelled",
] as const;

export const TASK_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export const TASK_ASSIGNEE_TYPES = ["user", "agent", "team", "unassigned"] as const;
export const TASK_ASSIGNEE_AGENTS = ["max", "claire", "hermes"] as const;
export const TASK_EXECUTION_MODES = ["manual", "approval_required", "autonomous"] as const;
export const TASK_SOURCE_TYPES = ["meeting", "inbox", "agent", "manual"] as const;

/**
 * The statuses `tasks.update` will let a caller ask for.
 *
 * `approved` and `rejected` are ABSENT ON PURPOSE, and this is the single most
 * load-bearing line in this file. An agent proposes; a human disposes. If a
 * tool could set status='approved' then the agent that filed a suggestion could
 * accept its own suggestion and the human review gate would be theater.
 *
 * max-agent already refuses it — tasksService.patchTask returns 403
 * (human_review_required) when a non-user actor moves a task to approved or
 * rejected, and POST /tasks/[id]/approve|reject are JWT-only. Leaving them out
 * of the schema is the second layer: the tool cannot even EXPRESS the request,
 * so it fails at the client with a clear schema error instead of burning a
 * round-trip on a 403. Do not "fix" this by widening the enum.
 *
 * (`suggested` and `superseded` are absent for a different reason: neither is a
 * legal client-driven transition target in max-agent's ALLOWED_TASK_TRANSITIONS
 * — supersession is owned by the summary-regeneration path in the repository.)
 */
export const TASK_AGENT_SETTABLE_STATUSES = [
  "in_progress",
  "completed",
  "cancelled",
] as const;

/**
 * Shared list filters for GET /api/v1/tasks.
 *
 * TENANCY: no workspace_id / tenant_id arg exists here or anywhere else in this
 * group. max-agent derives the workspace from the bearer token; prospect_id and
 * session_id are filters INSIDE it.
 */
const listFilters = {
  session_id: z
    .string()
    .uuid()
    .optional()
    .describe("Only tasks from this meeting session."),
  status: z
    .array(z.enum(TASK_STATUSES))
    .nonempty()
    .optional()
    .describe(
      "Only tasks in these statuses, e.g. [\"suggested\"] for the human review queue.",
    ),
  assignee_user_id: z.string().uuid().optional().describe("Only tasks assigned to this user."),
  assignee_agent: z
    .enum(TASK_ASSIGNEE_AGENTS)
    .optional()
    .describe("Only tasks assigned to this agent."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(200)
    .optional()
    .describe("Page size, 1-200 (default 50)."),
  cursor: z
    .string()
    .datetime({ offset: true })
    .optional()
    .describe(
      "Keyset cursor — echo back the previous page's nextCursor. Omit for the first page; a null nextCursor means the last page.",
    ),
};

export const listTasksSchema = z.object({
  ...withToken,
  prospect_id: z
    .string()
    .uuid()
    .optional()
    .describe(
      "Only tasks about this prospect. A filter within your own workspace — not a tenant selector.",
    ),
  ...listFilters,
});

export const prospectListTasksSchema = z.object({
  ...withToken,
  prospect_id: z.string().uuid().describe("Prospect UUID whose tasks to read."),
  ...listFilters,
});

export const getTaskSchema = z.object({
  ...withToken,
  id: z.string().uuid().describe("Task UUID."),
});

/**
 * Input for `create_suggestion`.
 *
 * There is NO `status` field: this tool always sends status='suggested'. See
 * the handler in tools.ts for why that is sent explicitly rather than left to
 * the server default.
 */
export const createTaskSuggestionSchema = z.object({
  ...withToken,
  title: z.string().trim().min(1).max(500).describe("What needs doing. Required."),
  description: z.string().trim().max(5000).optional().describe("Detail / context."),
  priority: z.enum(TASK_PRIORITIES).optional().describe("Default medium."),
  assignee_type: z.enum(TASK_ASSIGNEE_TYPES).optional(),
  assignee_user_id: z.string().uuid().optional().describe("Suggest a human owner."),
  assignee_agent: z.enum(TASK_ASSIGNEE_AGENTS).optional().describe("Suggest an agent owner."),
  execution_mode: z
    .enum(TASK_EXECUTION_MODES)
    .optional()
    .describe(
      "manual = a human does it; approval_required = an agent may execute only after explicit approval. 'autonomous' is reserved and not enabled in this release.",
    ),
  due_at: z.string().datetime({ offset: true }).optional().describe("ISO8601 due date."),
  source_type: z
    .enum(TASK_SOURCE_TYPES)
    .optional()
    .describe("Where the suggestion came from. Defaults to 'agent' for API-key callers."),
  source_id: z.string().uuid().optional(),
  session_id: z.string().uuid().optional().describe("The meeting this came out of."),
  prospect_id: z.string().uuid().optional().describe("The prospect this concerns."),
  source_summary_id: z.string().uuid().optional().describe("Lineage: the summary that proposed it."),
  source_transcript_version_id: z
    .string()
    .uuid()
    .optional()
    .describe("Lineage: the exact transcript version behind it."),
  dedup_key: z
    .string()
    .trim()
    .min(1)
    .max(1000)
    .optional()
    .describe(
      "Idempotency key that stops regeneration duplicates. Canonical form is `${sessionId}:${normalized-title}:${assignee}` (buildTaskDedupKey in max-agent). Re-sending a known key returns the stored task with deduplicated:true rather than creating a second one.",
    ),
});

/**
 * Input for `update`. `expected_version` is required — see tools.ts.
 *
 * Note there is intentionally no `.refine()` for "at least one field": grouped
 * tools need a plain ZodObject (registerGroupedTool reads `.shape`), and
 * max-agent already answers a field-less PATCH with a 400.
 */
export const updateTaskSchema = z.object({
  ...withToken,
  id: z.string().uuid().describe("Task UUID."),
  expected_version: z
    .string()
    .datetime({ offset: true })
    .describe(
      "REQUIRED optimistic-concurrency token: the `updatedAt` of the task as you last read it. If the task changed underneath you the call returns 409 with the current task — re-read, re-apply your edit, and try again. Do not loop on it blindly.",
    ),
  title: z.string().trim().min(1).max(500).optional(),
  description: z.string().trim().max(5000).nullable().optional().describe("null clears it."),
  priority: z.enum(TASK_PRIORITIES).optional(),
  assignee_type: z.enum(TASK_ASSIGNEE_TYPES).optional(),
  assignee_user_id: z.string().uuid().nullable().optional(),
  assignee_agent: z.enum(TASK_ASSIGNEE_AGENTS).nullable().optional(),
  execution_mode: z.enum(TASK_EXECUTION_MODES).optional(),
  due_at: z.string().datetime({ offset: true }).nullable().optional(),
  status: z
    .enum(TASK_AGENT_SETTABLE_STATUSES)
    .optional()
    .describe(
      "Move the task along its lifecycle. 'approved' and 'rejected' are deliberately not offered — only a signed-in human can review a suggestion, and max-agent answers 403 if an agent tries.",
    ),
});

export const completeTaskSchema = z.object({
  ...withToken,
  id: z.string().uuid().describe("Task UUID."),
  expected_version: z
    .string()
    .datetime({ offset: true })
    .describe(
      "REQUIRED optimistic-concurrency token: the `updatedAt` of the task as you last read it. A mismatch returns 409 with the current task.",
    ),
});

// Task MCP tools — the agent side of "agents propose, humans dispose".
//
// Calls max-agent's /api/v1/tasks routes with the workspace bearer. Never
// Supabase: an agent must never hold the service-role key, and every read and
// write goes through max-agent's workspace auth gate.
//
// ── THERE IS NO approve_task TOOL, AND THERE MUST NOT BE ────────────────────
// Not in this file, not in repository.ts, not anywhere. max-agent returns 403
// for API-key callers on POST /tasks/[id]/approve, POST /tasks/[id]/reject,
// DELETE /tasks/[id], and on any PATCH that moves status to approved|rejected.
// That is not an obstacle to route around — it is the human review gate. An
// agent that could accept its own suggestion would make the gate theater, and
// the whole suggested→approved lifecycle pointless. `create_suggestion` can
// only ever produce status='suggested'; a human approves it in the UI.
//
// If a future task seems to need an approve tool, the answer is a human in the
// UI, not a new tool. tools.test.ts asserts this and should fail loudly.

import {
  callApi,
  registerGroupedTool,
  toolHints,
  type GroupedActionDef,
  type McpServer,
} from "../shared";
import * as repo from "./repository";
import * as S from "./schema";

/**
 * A grouped action plus the capability that governs it.
 *
 * See features/pilot-tools/meetings/tools.ts for the full note on how the
 * capability-403 layer actually works. Short version: max-agent's guard uses a
 * capability the ROUTE declares server-side and never reads the caller-asserted
 * one from the X-Hermes-Caller envelope. These names are the MCP-side mirror —
 * they document what governs each tool and give the Hermes client the right
 * envelope string. They do not themselves enforce anything.
 */
interface TaskAction extends GroupedActionDef {
  capability: string;
}

/** Read tasks. */
const CAP_TASKS_READ = "tasks.read";
/** Propose a task. The only creation capability an agent gets. */
const CAP_TASKS_SUGGEST = "tasks.suggest";
/** Edit a task's fields / drive a legal transition. Never approve or reject. */
const CAP_TASKS_UPDATE = "tasks.update";
/** Mark accepted work done. */
const CAP_TASKS_COMPLETE = "tasks.complete";

// ── list pagination ─────────────────────────────────────────────────────────

// Mirror of max-agent's tasks.repository constants. Kept in sync by
// tools.test.ts asserting the derivation, not by hope.
const TASKS_DEFAULT_LIMIT = 50;
const TASKS_MAX_LIMIT = 200;

/**
 * GET /api/v1/tasks answers `{ data: TaskDto[] }` with NO nextCursor — but the
 * route IS keyset-paginated (it filters `created_at < cursor` and orders
 * created_at DESC). So a full page means "there is probably more", and handing
 * that back as if it were the whole list would silently drop tasks: exactly the
 * failure a review queue cannot afford.
 *
 * We derive the cursor the same way any caller would have to — the createdAt of
 * the last row on a FULL page; a short page is the last page. Two honest
 * caveats:
 *   • A full final page yields one extra request that returns []. Better than
 *     truncating.
 *   • The upstream keyset is strict (`<`) on a non-unique column, so tasks
 *     sharing a created_at across a page boundary can be skipped. That is
 *     upstream's design; deriving the cursor here neither causes nor worsens
 *     it. The real fix is a tiebreak on id, in max-agent.
 *
 * If max-agent ever returns its own nextCursor, we defer to it untouched.
 */
function withDerivedNextCursor(
  result: { content: Array<{ type: "text"; text: string }>; isError?: boolean },
  limit: number | undefined,
): { content: Array<{ type: "text"; text: string }>; isError?: boolean } {
  if (result.isError) return result;

  const text = result.content[0]?.text ?? "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Not JSON — hand it back untouched rather than guess at its shape.
    return result;
  }
  if (typeof parsed !== "object" || parsed === null) return result;

  // Upstream grew a cursor of its own: theirs wins, ours would be a lie.
  if ("nextCursor" in parsed) return result;

  const data = (parsed as { data?: unknown }).data;
  if (!Array.isArray(data)) return result;

  const pageSize = Math.min(
    Math.max(limit ?? TASKS_DEFAULT_LIMIT, 1),
    TASKS_MAX_LIMIT,
  );
  const last = data[data.length - 1] as { createdAt?: unknown } | undefined;
  const nextCursor =
    data.length >= pageSize && typeof last?.createdAt === "string"
      ? last.createdAt
      : null;

  return {
    content: [
      { type: "text" as const, text: JSON.stringify({ ...parsed, nextCursor }) },
    ],
  };
}

function toListParams(input: Record<string, unknown>): repo.ListTasksParams {
  return {
    prospectId: input.prospect_id as string | undefined,
    sessionId: input.session_id as string | undefined,
    status: input.status as readonly string[] | undefined,
    assigneeUserId: input.assignee_user_id as string | undefined,
    assigneeAgent: input.assignee_agent as string | undefined,
    limit: input.limit as number | undefined,
    cursor: input.cursor as string | undefined,
  };
}

async function listTasksHandler(
  input: Record<string, unknown>,
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  const limit = input.limit as number | undefined;
  const result = await callApi(input.bearer_token as string | undefined, (t) =>
    repo.listTasks(t, toListParams(input)),
  );
  return withDerivedNextCursor(result, limit);
}

// ── body mapping ────────────────────────────────────────────────────────────

/**
 * Copy `key` from the snake_case input to `outKey` on the camelCase body, only
 * when the caller actually sent it. `null` is preserved (PATCH uses it to clear
 * a field); `undefined` means "not sent" and is dropped.
 */
function pick(
  input: Record<string, unknown>,
  key: string,
  out: Record<string, unknown>,
  outKey: string,
): void {
  if (key in input && input[key] !== undefined) out[outKey] = input[key];
}

const CREATE_FIELDS: ReadonlyArray<[string, string]> = [
  ["title", "title"],
  ["description", "description"],
  ["priority", "priority"],
  ["assignee_type", "assigneeType"],
  ["assignee_user_id", "assigneeUserId"],
  ["assignee_agent", "assigneeAgent"],
  ["execution_mode", "executionMode"],
  ["due_at", "dueAt"],
  ["source_type", "sourceType"],
  ["source_id", "sourceId"],
  ["session_id", "sessionId"],
  ["prospect_id", "prospectId"],
  ["source_summary_id", "sourceSummaryId"],
  ["source_transcript_version_id", "sourceTranscriptVersionId"],
  ["dedup_key", "dedupKey"],
];

const UPDATE_FIELDS: ReadonlyArray<[string, string]> = [
  ["title", "title"],
  ["description", "description"],
  ["priority", "priority"],
  ["assignee_type", "assigneeType"],
  ["assignee_user_id", "assigneeUserId"],
  ["assignee_agent", "assigneeAgent"],
  ["execution_mode", "executionMode"],
  ["due_at", "dueAt"],
  ["status", "status"],
];

function buildBody(
  input: Record<string, unknown>,
  fields: ReadonlyArray<[string, string]>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const [from, to] of fields) pick(input, from, body, to);
  return body;
}

// ── actions ─────────────────────────────────────────────────────────────────

const TASK_ACTIONS: TaskAction[] = [
  {
    action: "list",
    capability: CAP_TASKS_READ,
    title: "List tasks",
    description:
      "List the workspace's tasks, newest first. Filter by prospect_id, session_id, status, and assignee. Use status:[\"suggested\"] to see what is waiting on human review. Returns {data: TaskDto[], nextCursor}. Paginated — pass nextCursor back as cursor; null means the last page.",
    inputShape: S.listTasksSchema.shape,
    handler: listTasksHandler,
  },
  {
    action: "get",
    capability: CAP_TASKS_READ,
    title: "Get task",
    description:
      "Get one task by UUID. Returns {data: TaskDto} — including `updatedAt`, which is the expected_version token you must pass to update or complete. 404 if the task is not in your workspace.",
    inputShape: S.getTaskSchema.shape,
    handler: (input) =>
      callApi(input.bearer_token as string | undefined, (t) =>
        repo.getTask(t, input.id as string),
      ),
  },
  {
    action: "create_suggestion",
    capability: CAP_TASKS_SUGGEST,
    title: "Suggest a task",
    description:
      "Propose a task for human review. Always creates it with status='suggested' — you cannot create an approved task, and there is no tool to approve one; a human does that in the UI. Pass dedup_key to make retries idempotent (a known key returns the stored task with deduplicated:true instead of creating a duplicate). Returns {data: TaskDto}.",
    inputShape: S.createTaskSuggestionSchema.shape,
    handler: (input) =>
      callApi(input.bearer_token as string | undefined, (t) =>
        repo.createTask(t, {
          ...buildBody(input, CREATE_FIELDS),
          // Sent EXPLICITLY, not left to the server default, and last so no
          // caller field can shadow it. max-agent forces 'suggested' for
          // API-key callers, but POST /tasks defaults a *JWT* caller's task to
          // 'approved' — and this server's bearer may be a user JWT. Without
          // this line, create_suggestion on a JWT bearer would mint an approved
          // task and walk straight through the review gate.
          status: "suggested",
        }),
      ),
  },
  {
    action: "update",
    capability: CAP_TASKS_UPDATE,
    title: "Update a task",
    description:
      "Edit a task's fields, or move it to in_progress / completed / cancelled. Requires expected_version — the `updatedAt` you last read (get it from tasks/get). If someone changed the task since you read it the call returns 409 with the current task: re-read it, re-apply your edit, then retry. You cannot set status to approved or rejected — only a signed-in human can review a suggestion. Returns {data: TaskDto}.",
    inputShape: S.updateTaskSchema.shape,
    handler: (input) =>
      callApi(input.bearer_token as string | undefined, (t) =>
        repo.patchTask(t, input.id as string, {
          ...buildBody(input, UPDATE_FIELDS),
          expectedVersion: input.expected_version as string,
        }),
      ),
  },
  {
    action: "complete",
    capability: CAP_TASKS_COMPLETE,
    title: "Complete a task",
    description:
      "Mark an approved or in-progress task completed. Requires expected_version — the `updatedAt` you last read; a mismatch returns 409 with the current task. An unreviewed suggestion cannot be completed (409 invalid_transition): a human approves it first. Returns {data: TaskDto}.",
    inputShape: S.completeTaskSchema.shape,
    handler: (input) =>
      callApi(input.bearer_token as string | undefined, (t) =>
        repo.patchTask(t, input.id as string, {
          status: "completed",
          expectedVersion: input.expected_version as string,
        }),
      ),
  },
];

/** Tool/action → the capability that governs it, for the capability-403 layer. */
export const TASKS_CAPABILITIES: Readonly<Record<string, string>> = {
  ...Object.fromEntries(TASK_ACTIONS.map((a) => [`tasks.${a.action}`, a.capability])),
  prospect_list_tasks: CAP_TASKS_READ,
};

export function registerTaskTools(server: McpServer): void {
  registerGroupedTool(
    server,
    "tasks",
    "Read tasks and propose new ones. Agents propose, humans dispose: you can create suggestions and drive accepted work forward, but only a human can approve or reject a suggestion. The workspace comes from your bearer token.",
    TASK_ACTIONS,
  );

  // Flat convenience tool for a prospect's task list — the counterpart to
  // prospect_list_meetings. prospect_id is required so it cannot quietly
  // degrade into a whole-workspace read.
  server.registerTool(
    "prospect_list_tasks",
    {
      title: "List a prospect's tasks",
      description:
        "List the tasks about one prospect, newest first. Same filters and shape as the `tasks` group's list action, with prospect_id required. Returns {data: TaskDto[], nextCursor}. Paginated: echo nextCursor back as cursor; null means the last page. prospect_id filters within your authenticated workspace.",
      inputSchema: S.prospectListTasksSchema,
      ...toolHints.readOnly,
    },
    listTasksHandler,
  );
}

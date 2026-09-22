import { callApi, strip, toolHints, type McpServer } from "../shared";
import * as repo from "./repository";
import * as S from "./schema";

// General automation workflows: a trigger (record event, schedule, manual,
// inbound webhook) followed by up to 20 action / filter / delay steps. Edits
// go to a draft version; activation publishes the draft and arms the trigger.
// Workflows execute as their recorded author — for an API key, the member who
// owns the key — and that author's rights are re-checked on every run.

type ToolResult = Awaited<ReturnType<typeof callApi>>;

const WEBHOOK_TOKEN_NOTE = JSON.stringify(
  "[redacted: one-time webhook bearer token. Rotate it in the Max automation editor to obtain a usable value.]",
);
/** Any string-valued webhook_token (null stays null). */
const WEBHOOK_TOKEN_FIELD = /"webhook_token"\s*:\s*"(?:[^"\\]|\\.)*"/g;

/**
 * First activation of a webhook-triggered workflow returns its inbound bearer
 * token in plaintext, exactly once. A credential must not land in a model
 * transcript, so it is replaced before the result leaves this server. Done on
 * the raw text (not a JSON round-trip) so an unparseable body still fails
 * closed.
 */
export function redactWebhookToken(result: ToolResult): ToolResult {
  return {
    ...result,
    content: result.content.map((c) => ({
      ...c,
      text: c.text.replace(WEBHOOK_TOKEN_FIELD, `"webhook_token":${WEBHOOK_TOKEN_NOTE}`),
    })),
  };
}

export function registerAutomationTools(server: McpServer): void {
  server.registerTool("automation_list", {
    title: "List automations",
    description: "List the workspace's automation workflows with status, trigger, run counters and a summary of the draft/active version. Returns {data: Workflow[]}.",
    inputSchema: S.tokenOnlySchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) => repo.listAutomations(t)));

  server.registerTool("automation_get", {
    title: "Get automation",
    description: "Get one workflow with its draft_version and active_version documents and webhook_url. Returns {data: WorkflowDetail}.",
    inputSchema: S.automationIdSchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) => repo.getAutomation(t, input.automation_id)));

  server.registerTool("automation_create", {
    title: "Create automation",
    description: "Create a workflow (unique name) with a first draft version; nothing fires until automation_activate. Returns {data: WorkflowDetail}.",
    inputSchema: S.createAutomationSchema,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.createAutomation(t, strip(input, "bearer_token"))));

  server.registerTool("automation_update", {
    title: "Rename automation",
    description: "Rename or redescribe a workflow (definition changes go through automation_save_draft). Returns {data: Workflow}.",
    inputSchema: S.updateAutomationSchema,
    ...toolHints.idempotent,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.updateAutomation(t, input.automation_id, strip(input, "bearer_token", "automation_id"))));

  server.registerTool("automation_delete", {
    title: "Delete automation",
    description: "Permanently delete a workflow with all its versions and run history. Returns {data: {deleted: true}}.",
    inputSchema: S.automationIdSchema,
    ...toolHints.destructive,
  }, async (input) => callApi(input.bearer_token, (t) => repo.deleteAutomation(t, input.automation_id)));

  server.registerTool("automation_save_draft", {
    title: "Save automation draft",
    description: "Replace the workflow's draft definition (creates a new draft if the latest version is active; the live version is untouched until automation_activate). Returns {data: Version}.",
    inputSchema: S.saveDraftSchema,
    ...toolHints.idempotent,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.saveDraft(t, input.automation_id, { definition: input.definition })));

  server.registerTool("automation_discard_draft", {
    title: "Discard automation draft",
    description: "Archive the pending draft, keeping the active version (409 if there is no draft; 404 where the draft lifecycle is not enabled). Returns {data: Version}.",
    inputSchema: S.automationIdSchema,
    ...toolHints.destructive,
  }, async (input) => callApi(input.bearer_token, (t) => repo.discardDraft(t, input.automation_id)));

  server.registerTool("automation_activate", {
    title: "Activate automation",
    description: "Publish the pending draft and arm its trigger — from now on it fires automatically on real records (422 with {details:[{step_id,message}]} if not runnable). A new webhook's one-time token is redacted. Returns {data: WorkflowDetail}.",
    inputSchema: S.automationIdSchema,
  }, async (input) => redactWebhookToken(await callApi(input.bearer_token, (t) =>
    repo.activateAutomation(t, input.automation_id))));

  server.registerTool("automation_deactivate", {
    title: "Pause automation",
    description: "Pause an active workflow: disarms its trigger; versions, runs and counters stay. Returns {data: WorkflowDetail}.",
    inputSchema: S.automationIdSchema,
    ...toolHints.destructive,
  }, async (input) => callApi(input.bearer_token, (t) => repo.deactivateAutomation(t, input.automation_id)));

  server.registerTool("automation_resume", {
    title: "Resume automation",
    description: "Re-arm a paused workflow's existing active version (never publishes a pending draft). Returns {data: WorkflowDetail}.",
    inputSchema: S.automationIdSchema,
  }, async (input) => redactWebhookToken(await callApi(input.bearer_token, (t) =>
    repo.resumeAutomation(t, input.automation_id))));

  server.registerTool("automation_run", {
    title: "Run automation now",
    description: "Fire the workflow once, now, inline — runs the draft if one exists, else the active version — and REALLY executes its actions (tasks, campaign enrolls, webhooks, signature requests). Pass prospect_id for person-scoped manual triggers. Returns {data: Run}.",
    inputSchema: S.runAutomationSchema,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.runAutomation(t, input.automation_id, strip(input, "bearer_token", "automation_id"))));

  server.registerTool("automation_list_runs", {
    title: "List automation runs",
    description: "A workflow's run log, newest first, 25 per page. 403 if the page includes document-triggered runs (member session required). Returns {data: Run[], count}.",
    inputSchema: S.listRunsSchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.listRuns(t, input.automation_id, { page: input.page })));

  server.registerTool("automation_list_versions", {
    title: "List automation versions",
    description: "Every version of a workflow (draft, active, archived), newest first. Returns {data: Version[]}.",
    inputSchema: S.automationIdSchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) => repo.listVersions(t, input.automation_id)));

  server.registerTool("automation_get_run", {
    title: "Get automation run",
    description: "One run with per-step states, outputs and errors (403 for document-triggered runs without a member session). Returns {data: Run}.",
    inputSchema: S.runIdSchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) => repo.getRun(t, input.run_id)));

  server.registerTool("automation_cancel_run", {
    title: "Cancel automation run",
    description: "Cancel a queued or waiting (delayed) run; 409 if it already ran or is running. Returns {data: Run}.",
    inputSchema: S.runIdSchema,
    ...toolHints.destructive,
  }, async (input) => callApi(input.bearer_token, (t) => repo.cancelRun(t, input.run_id)));
}

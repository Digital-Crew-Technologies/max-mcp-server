import { callApi, strip, type McpServer } from "../shared";
import * as repo from "./repository";
import * as S from "./schema";

// Inbox Autopilot: Max can classify inbound email replies and either auto-send
// a safe reply, draft one for human review, or suppress it — gated by a
// per-workspace setting (master kill switch + mode + daily cap). These tools
// let the agent configure that setting, review and act on drafted replies
// (approve sends in-thread via Unipile; reject discards), and manually run a
// single inbound message through the pipeline. All tools proxy max-agent's
// /api/v1/inbox/* routes with the user's standard bearer token (workspace-
// scoped by the auth gate).

export function registerInboxTools(server: McpServer): void {
  server.registerTool(
    "set_inbox_autopilot",
    {
      title: "Configure inbox autopilot",
      description:
        "Set the workspace's inbox autopilot configuration. enabled is the master kill switch (false = do nothing). mode is 'auto_safe' (auto-send safe high-confidence replies under the daily cap, draft the rest), 'draft_all' (always draft), or 'off' (suppress). Optionally set daily_cap (max auto-sends per UTC day, mode 'auto_safe' only; omit to leave unchanged, default 50). Returns the saved {data: inboxAutopilot}. Auto-send happens only when enabled=true AND mode='auto_safe' AND intent is safe (interested/meeting_request) AND confidence>=0.75 AND under the cap.",
      inputSchema: S.setInboxAutopilotSchema,
    },
    async (input) =>
      callApi(input.bearer_token, (t) =>
        repo.setAutopilot(t, strip(input, "bearer_token")),
      ),
  );

  server.registerTool(
    "get_inbox_autopilot_status",
    {
      title: "Get inbox autopilot status",
      description:
        "Return the workspace's current inbox autopilot setting: {enabled, mode ('auto_safe'|'draft_all'|'off'), daily_cap}. Use this to confirm whether autopilot is active and how it is configured before changing it or reviewing drafts.",
      inputSchema: S.getInboxAutopilotStatusSchema,
    },
    async (input) =>
      callApi(input.bearer_token, (t) => repo.getAutopilotStatus(t)),
  );

  server.registerTool(
    "list_inbox_drafts",
    {
      title: "List inbox autopilot drafts",
      description:
        "List the autopilot-generated reply drafts awaiting review (status='draft') for the workspace, newest first. Returns {data: InboxAutopilotAction[]}, each row including intent, sentiment, confidence, and the proposed reply_body. Review these before calling approve_inbox_draft or reject_inbox_draft.",
      inputSchema: S.listInboxDraftsSchema,
    },
    async (input) => callApi(input.bearer_token, (t) => repo.listDrafts(t)),
  );

  server.registerTool(
    "approve_inbox_draft",
    {
      title: "Approve and send an inbox draft",
      description:
        "Approve a drafted reply and send it in-thread via Unipile, setting the action's status to 'approved'. Optionally pass body to send an edited reply instead of the stored draft. Returns the updated {data: InboxAutopilotAction}. Fails with 404 (draft not found), 409 (action not in 'draft' status), or 400 SendReplyError (code CHAT_NOT_FOUND | ACCOUNT_NOT_FOUND | ACCOUNT_NOT_CONNECTED | NO_PROSPECT_EMAIL | SEND_FAILED).",
      inputSchema: S.approveInboxDraftSchema,
    },
    async (input) =>
      callApi(input.bearer_token, (t) =>
        repo.approveDraft(
          t,
          input.action_id,
          strip(input, "bearer_token", "action_id"),
        ),
      ),
  );

  server.registerTool(
    "reject_inbox_draft",
    {
      title: "Reject an inbox draft",
      description:
        "Reject a drafted reply so it will not be sent, setting the action's status to 'rejected'. No message is sent. Returns the updated {data: InboxAutopilotAction}. Fails with 404 (draft not found) or 409 (action not in 'draft' status).",
      inputSchema: S.rejectInboxDraftSchema,
    },
    async (input) =>
      callApi(input.bearer_token, (t) => repo.rejectDraft(t, input.action_id)),
  );

  server.registerTool(
    "process_inbox_message",
    {
      title: "Process an inbox message now",
      description:
        "Manually run a single inbound email through the autopilot pipeline now (instead of waiting for the cron): classify it and, per the workspace setting, auto-send a safe reply, store a draft, or suppress it. Provide the provider message_id. Returns the resulting {data: InboxAutopilotAction} with its status (e.g. 'sent', 'draft', 'suppressed', 'failed'). Honors the current autopilot setting and daily cap.",
      inputSchema: S.processInboxMessageSchema,
    },
    async (input) =>
      callApi(input.bearer_token, (t) =>
        repo.processMessage(t, strip(input, "bearer_token")),
      ),
  );
}

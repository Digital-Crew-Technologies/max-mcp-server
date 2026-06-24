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
        "Set the workspace's inbox autopilot configuration. enabled is the master kill switch (false = do nothing). When enabled, the autopilot reads each inbound email reply, drafts a suggested reply in the rep's voice, and NOTIFIES the user to review/approve it — it NEVER auto-sends; a human approves every reply (via list_inbox_drafts + approve_inbox_draft). mode: 'off' suppresses entirely; 'auto_safe' and 'draft_all' both draft-and-notify (auto-send is disabled in v1). daily_cap is reserved for a future auto-send mode. Returns the saved {data: inboxAutopilot}.",
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

}

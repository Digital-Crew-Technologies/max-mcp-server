import { callApi, strip, type McpServer } from "../shared";
import * as repo from "./repository";
import * as S from "./schema";

// Inbox tools — generic across agents (Hermes, max-mcp chat agent, future
// agents). Any agent can stage a write to be approved by the human via the
// workspace UI, then approve / reject the result. The agent_action_drafts
// table + REST endpoints live in max-agent.
//
// Flow:
//   1. agent calls inbox_create_draft({ action_type, payload, summary? })
//   2. max-agent persists a row, returns { draft_id, state:'pending', review_url }
//   3. agent posts the review_url to the user's chat channel
//   4. user clicks → /inbox in the UI → approves/rejects
//   5. max-agent executes (or doesn't) the underlying action.

export function registerInboxTools(server: McpServer): void {
  server.registerTool(
    "inbox_create_draft",
    {
      title: "Create an action draft in the inbox",
      description:
        "Stage an action (e.g. send a nudge, upsert a CRM contact, export a CSV) as a PENDING draft in the workspace inbox for the human to approve. The draft is persisted in max-agent's agent_action_drafts table; nothing runs until the human approves. Returns { draft_id, state:'pending', review_url }. AFTER CREATING, POST THE RETURNED review_url (or a link to /inbox in the workspace UI) TO THE USER'S CHAT CHANNEL SO THEY CAN APPROVE. Use this whenever an agent wants to take a write action on the user's behalf but the user hasn't pre-authorized the specific instance.",
      inputSchema: S.inboxCreateDraftSchema,
    },
    async (input) =>
      callApi(input.bearer_token, (t) =>
        repo.inboxCreateDraft(t, strip(input, "bearer_token")),
      ),
  );

  server.registerTool(
    "inbox_list_drafts",
    {
      title: "List action drafts in the inbox",
      description:
        "List action drafts in the workspace inbox, optionally filtered by state (pending/approved/rejected/executed/failed/canceled) and/or action_type. Paginated via { limit, cursor }. Returns { data: [...], next_cursor? }. Use to show the user what's awaiting their approval or to audit recently-executed actions.",
      inputSchema: S.inboxListDraftsSchema,
    },
    async (input) =>
      callApi(input.bearer_token, (t) =>
        repo.inboxListDrafts(t, strip(input, "bearer_token")),
      ),
  );

  server.registerTool(
    "inbox_get_draft",
    {
      title: "Get one action draft from the inbox",
      description:
        "Fetch one action draft by id, including its full payload, current state, audit trail, and any execution result. Use to inspect a specific draft before recommending approve/reject to the user.",
      inputSchema: S.inboxGetDraftSchema,
    },
    async (input) =>
      callApi(input.bearer_token, (t) =>
        repo.inboxGetDraft(t, String(input.draft_id)),
      ),
  );
}

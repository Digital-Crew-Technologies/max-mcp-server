import { callApi, strip, type McpServer } from "../shared";
import * as repo from "./repository";
import * as S from "./schema";

// Agent draft tools — generic across agents (Hermes, max-mcp chat agent, future
// agents). Any agent can stage a write to be approved by the human via the
// workspace UI, then approve / reject the result. The agent_action_drafts
// table + REST endpoints live in max-agent.
//
// Flow:
//   1. agent calls agent_draft_create({ action_type, payload, summary? })
//   2. max-agent persists a row, returns { draft_id, state:'pending', review_url }
//   3. agent posts the review_url to the user's chat channel
//   4. user clicks → reviews in the UI → approves/rejects
//   5. max-agent executes (or doesn't) the underlying action.

export function registerAgentDraftTools(server: McpServer): void {
  server.registerTool(
    "agent_draft_create",
    {
      title: "Create an agent action draft",
      description:
        "Stage an action (e.g. send a nudge, upsert a CRM contact, export a CSV) as a PENDING draft in the workspace for the human to approve. The draft is persisted in max-agent's agent_action_drafts table; nothing runs until the human approves. Returns { draft_id, state:'pending', review_url }. AFTER CREATING, POST THE RETURNED review_url (or a link to the agent drafts view in the workspace UI) TO THE USER'S CHAT CHANNEL SO THEY CAN APPROVE. Use this whenever an agent wants to take a write action on the user's behalf but the user hasn't pre-authorized the specific instance.",
      inputSchema: S.agentDraftCreateSchema,
    },
    async (input) =>
      callApi(input.bearer_token, (t) =>
        repo.agentDraftCreate(t, strip(input, "bearer_token")),
      ),
  );

  server.registerTool(
    "agent_draft_list",
    {
      title: "List agent action drafts",
      description:
        "List agent action drafts in the workspace, optionally filtered by state (pending/approved/rejected/executed/failed/canceled) and/or action_type. Paginated via { limit, cursor }. Returns { data: [...], next_cursor? }. Use to show the user what's awaiting their approval or to audit recently-executed actions.",
      inputSchema: S.agentDraftListSchema,
    },
    async (input) =>
      callApi(input.bearer_token, (t) =>
        repo.agentDraftList(t, strip(input, "bearer_token")),
      ),
  );

  server.registerTool(
    "agent_draft_get",
    {
      title: "Get one agent action draft",
      description:
        "Fetch one agent action draft by id, including its full payload, current state, audit trail, and any execution result. Use to inspect a specific draft before recommending approve/reject to the user.",
      inputSchema: S.agentDraftGetSchema,
    },
    async (input) =>
      callApi(input.bearer_token, (t) =>
        repo.agentDraftGet(t, String(input.draft_id)),
      ),
  );
}

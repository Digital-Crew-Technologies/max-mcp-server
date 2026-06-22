import { callApi, strip, type McpServer } from "../shared";
import * as repo from "./repository";
import * as S from "./schema";

// Intent Signals (feature #7): set up triggers that watch a target URL for a
// buying signal, then review and act on the AI proposals they generate. The
// flow is recommend -> approve/reject/modify; approving launches a draft
// campaign. All tools proxy max-agent's /api/v1/intent/* routes with the
// user's standard bearer token (workspace-scoped by the auth gate).

export function registerIntentTools(server: McpServer): void {
  server.registerTool(
    "create_intent_trigger",
    {
      title: "Create an intent trigger",
      description:
        "Set up a trigger that watches a target URL for a buying signal (funding, hiring, tech_stack, news, job_change, or custom). Optionally scope it to an organization or prospect and set how often it re-polls. Returns the created {data: IntentTrigger}. Used to start monitoring for intent before any signals exist.",
      inputSchema: S.createIntentTriggerSchema,
    },
    async (input) =>
      callApi(input.bearer_token, (t) =>
        repo.createTrigger(t, strip(input, "bearer_token")),
      ),
  );

  server.registerTool(
    "list_intent_signals",
    {
      title: "List intent triggers and recent signals",
      description:
        "List the workspace's intent triggers (optionally filtered by active state) so you can see what is being monitored and review recent signal activity. Returns {data: IntentTrigger[]}, each row including last_run_at and last_error. Use get_signal_history to drill into the detected events for a specific trigger.",
      inputSchema: S.listIntentSignalsSchema,
    },
    async (input) =>
      callApi(input.bearer_token, (t) =>
        repo.listTriggers(t, strip(input, "bearer_token")),
      ),
  );

  server.registerTool(
    "get_signal_history",
    {
      title: "Get signal history for a trigger",
      description:
        "Return the detected SignalEvent rows for a single trigger — each event records whether the poll found changes, a summary, and the raw scrape. Returns {data: SignalEvent[]}.",
      inputSchema: S.getSignalHistorySchema,
    },
    async (input) =>
      callApi(input.bearer_token, (t) => repo.listSignals(t, input.trigger_id)),
  );

  server.registerTool(
    "disable_trigger",
    {
      title: "Disable an intent trigger",
      description:
        "Disable an intent trigger (sets active=false) so it stops re-polling. Returns the updated {data: IntentTrigger}, or a 404 error if the trigger is not in this workspace.",
      inputSchema: S.disableTriggerSchema,
    },
    async (input) =>
      callApi(input.bearer_token, (t) =>
        repo.disableTrigger(t, input.trigger_id),
      ),
  );

  server.registerTool(
    "list_signal_proposals",
    {
      title: "List signal proposals",
      description:
        "List the AI-generated campaign proposals produced from detected signals, optionally filtered by status (pending, approved, rejected, modified, launched, expired). An unknown status is ignored and all proposals are returned. Returns {data: SignalProposal[]}. Review pending proposals before approving them.",
      inputSchema: S.listSignalProposalsSchema,
    },
    async (input) =>
      callApi(input.bearer_token, (t) =>
        repo.listProposals(t, strip(input, "bearer_token")),
      ),
  );

  server.registerTool(
    "get_signal_proposal",
    {
      title: "Get a signal proposal",
      description:
        "Fetch a single signal proposal by id, including its full recommendation (campaign name/description, workflow_config, target_prospect_ids, estimated contacts/credits, matched ICP, and entity). Returns {data: SignalProposal}, or a 404 error if not found.",
      inputSchema: S.getSignalProposalSchema,
    },
    async (input) =>
      callApi(input.bearer_token, (t) => repo.getProposal(t, input.proposal_id)),
  );

  server.registerTool(
    "approve_proposal",
    {
      title: "Approve and launch a signal proposal",
      description:
        "Approve a pending proposal and launch its draft campaign. SYNCHRONOUS — max-agent builds the prospect list, creates the campaign, and launches it (may take a while). Optionally pass modifications (titles, target_prospect_ids, campaign_name, campaign_description) to override the recommendation before launch; omit them to approve as-is. On success returns {data: SignalProposal (status 'launched', draft_campaign_id set), campaign_id}. Can fail with 402 (enrichment quota exceeded — proposal reverts to pending), 409 (not pending / already decided / expired), or 422 (no target prospects / no connected account).",
      inputSchema: S.approveProposalSchema,
    },
    async (input) =>
      callApi(input.bearer_token, (t) =>
        repo.approveProposal(t, input.proposal_id, input.modifications ?? {}),
      ),
  );

  server.registerTool(
    "reject_proposal",
    {
      title: "Reject a signal proposal",
      description:
        "Reject a pending proposal so it will not be launched. Returns the updated {data: SignalProposal (status 'rejected')}. Fails with 409 if the proposal is not pending.",
      inputSchema: S.rejectProposalSchema,
    },
    async (input) =>
      callApi(input.bearer_token, (t) =>
        repo.rejectProposal(t, input.proposal_id),
      ),
  );

  server.registerTool(
    "modify_proposal",
    {
      title: "Modify a pending signal proposal",
      description:
        "Adjust a pending proposal WITHOUT launching it: pass modifications (titles, target_prospect_ids, campaign_name, campaign_description) to re-select prospects and regenerate the campaign workflow. The proposal stays pending so it can be reviewed and approved later. Returns the updated {data: SignalProposal}. Fails with 409 if the proposal is not pending, or 404 if not found.",
      inputSchema: S.modifyProposalSchema,
    },
    async (input) =>
      callApi(input.bearer_token, (t) =>
        repo.modifyProposal(t, input.proposal_id, input.modifications),
      ),
  );
}

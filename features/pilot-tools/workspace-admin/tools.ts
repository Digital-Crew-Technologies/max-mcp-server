import { callApi, strip, toolHints, type McpServer } from "../shared";
import * as repo from "./repository";
import * as S from "./schema";

// Workspace settings & admin reads reachable with a scoped workspace API key:
// custom-field definitions, BYO data suppliers, duplicate detection, agent
// config, team roster, wallet, and Max chat history. Admin-only writes
// (custom fields, roles, members, crew rates, budgets, agent config) reject
// API keys upstream and are intentionally not exposed.

export function registerWorkspaceAdminTools(server: McpServer): void {
  server.registerTool(
    "list_custom_fields",
    {
      title: "List custom fields",
      description:
        "List the workspace's custom field definitions, optionally for one entity_type (prospect, organization, deal). Returns {data: [{id, entity_type, key, label, field_type, options, is_required, default_value, position, is_archived}]}.",
      inputSchema: S.listCustomFieldsSchema,
      ...toolHints.readOnly,
    },
    async (input) =>
      callApi(input.bearer_token, (t) => repo.listCustomFields(t, strip(input, "bearer_token"))),
  );

  server.registerTool(
    "list_data_suppliers",
    {
      title: "List data suppliers",
      description:
        "List the bring-your-own-key data suppliers (getleads, explorium, apollo) with enabled flag, status (active/revoked/error) and saved default config. Never returns keys. A disconnected supplier can still show connected=true — trust status. Returns {data: DataSupplier[]}.",
      inputSchema: S.noArgsSchema,
      ...toolHints.readOnly,
    },
    async (input) => callApi(input.bearer_token, (t) => repo.listDataSuppliers(t)),
  );

  server.registerTool(
    "update_data_supplier",
    {
      title: "Update data supplier settings",
      description:
        "Enable/disable a connected data supplier or replace its saved default search config. 404 if the provider is not connected. Returns {data: DataSupplier}.",
      inputSchema: S.updateDataSupplierSchema,
      ...toolHints.idempotent,
    },
    async (input) =>
      callApi(input.bearer_token, (t) =>
        repo.updateDataSupplierConfig(t, input.provider, strip(input, "bearer_token", "provider")),
      ),
  );

  server.registerTool(
    "disconnect_data_supplier",
    {
      title: "Disconnect data supplier",
      description:
        "Revoke the workspace's stored key for a data supplier; searches stop using it until a human reconnects it. Returns {data: {provider, connected: false}}.",
      inputSchema: S.disconnectDataSupplierSchema,
      ...toolHints.destructive,
    },
    async (input) =>
      callApi(input.bearer_token, (t) => repo.disconnectDataSupplier(t, input.provider)),
  );

  server.registerTool(
    "list_duplicate_records",
    {
      title: "List duplicate records",
      description:
        "List pending duplicate pairs for prospects (default) or organizations, each with match_type, confidence and a summary of both records. Returns {data: Pair[], counts} (pending counts per match type). Merging is a human action in the app.",
      inputSchema: S.listDuplicatesSchema,
      ...toolHints.readOnly,
    },
    async (input) =>
      callApi(input.bearer_token, (t) => repo.listDuplicates(t, strip(input, "bearer_token"))),
  );

  server.registerTool(
    "scan_duplicate_records",
    {
      title: "Scan for duplicate records",
      description:
        "Rescan all workspace prospects and organizations for duplicates now (can be slow). Returns {data: {prospects_scanned, organizations_scanned, new_candidates}}; read pairs with list_duplicate_records.",
      inputSchema: S.noArgsSchema,
    },
    async (input) => callApi(input.bearer_token, (t) => repo.scanDuplicates(t)),
  );

  server.registerTool(
    "dismiss_duplicate_pair",
    {
      title: "Dismiss duplicate pair",
      description:
        "Mark a duplicate pair as not-a-duplicate so it leaves the pending queue. Records are untouched. Returns {success: true}.",
      inputSchema: S.dismissDuplicateSchema,
      ...toolHints.idempotent,
    },
    async (input) => callApi(input.bearer_token, (t) => repo.dismissDuplicate(t, input.pair_id)),
  );

  server.registerTool(
    "get_data_quality_settings",
    {
      title: "Get data-quality settings",
      description:
        "Read the workspace's duplicate auto-merge policy. Returns {data: {auto_merge_enabled, auto_merge_threshold_percent}}.",
      inputSchema: S.noArgsSchema,
      ...toolHints.readOnly,
    },
    async (input) => callApi(input.bearer_token, (t) => repo.getDataQualitySettings(t)),
  );

  server.registerTool(
    "get_workspace_agents",
    {
      title: "Get workspace agent config",
      description:
        "Read the workspace's agent configuration (soul, system prompt overrides, knowledge, skill switches per agent) plus shipped baselines and the caller's access. Read-only via API key. Returns {data: {config, access, baselines}}.",
      inputSchema: S.noArgsSchema,
      ...toolHints.readOnly,
    },
    async (input) => callApi(input.bearer_token, (t) => repo.getWorkspaceAgents(t)),
  );

  server.registerTool(
    "generate_workspace_intel",
    {
      title: "Generate workspace intel",
      description:
        "Have Max scan the workspace's People and Organization cards and write a workspace intel report, OVERWRITING the saved one. CHARGES workspace credits; slow (up to ~2 min). 422 if there are no cards. Returns {data: WorkspaceIntel}.",
      inputSchema: S.noArgsSchema,
    },
    async (input) => callApi(input.bearer_token, (t) => repo.generateWorkspaceIntel(t)),
  );

  server.registerTool(
    "list_workspace_members",
    {
      title: "List workspace members",
      description:
        "List human members and pending invites. Returns {data: [{id, user_id, name, email, role, custom_role, status, access_mode, is_admin, permissions, invited_at, joined_at}]}.",
      inputSchema: S.noArgsSchema,
      ...toolHints.readOnly,
    },
    async (input) => callApi(input.bearer_token, (t) => repo.listMembers(t)),
  );

  server.registerTool(
    "list_workspace_roles",
    {
      title: "List workspace roles",
      description:
        "List custom roles with their object/field permissions and assignment counts. Returns {data: CustomRole[]}.",
      inputSchema: S.noArgsSchema,
      ...toolHints.readOnly,
    },
    async (input) => callApi(input.bearer_token, (t) => repo.listRoles(t)),
  );

  server.registerTool(
    "list_crew_rates",
    {
      title: "List crew rates",
      description:
        "List hourly rates and commission for the workspace default, members and digital workers. Returns {data: [{subject_type, subject_id, label, currency, hourly_rate, commission_pct, default_action_minutes, weekly_capacity_hours}]}.",
      inputSchema: S.noArgsSchema,
      ...toolHints.readOnly,
    },
    async (input) => callApi(input.bearer_token, (t) => repo.listCrewRates(t)),
  );

  server.registerTool(
    "list_digital_workers",
    {
      title: "List digital workers",
      description:
        "List the workspace's digital workers (AI crew members) with status, role, access mode and permissions. Returns {data: DigitalWorker[]}.",
      inputSchema: S.noArgsSchema,
      ...toolHints.readOnly,
    },
    async (input) => callApi(input.bearer_token, (t) => repo.listDigitalWorkers(t)),
  );

  server.registerTool(
    "get_workspace_wallet",
    {
      title: "Get workspace wallet",
      description:
        "Read the workspace's token balances: pooled wallet, owner balance, spendable total and caller contribution. Returns {data: {wallet_balance, owner_balance, spendable, …}, billingEnabled}.",
      inputSchema: S.noArgsSchema,
      ...toolHints.readOnly,
    },
    async (input) => callApi(input.bearer_token, (t) => repo.getWallet(t)),
  );

  server.registerTool(
    "list_wallet_budgets",
    {
      title: "List member wallet budgets",
      description: "List per-member spending allowances on the workspace wallet. Returns {data: MemberBudget[]}.",
      inputSchema: S.noArgsSchema,
      ...toolHints.readOnly,
    },
    async (input) => callApi(input.bearer_token, (t) => repo.listWalletBudgets(t)),
  );

  server.registerTool(
    "list_wallet_consumption",
    {
      title: "List wallet consumption",
      description:
        "Who spent how many workspace tokens, with their allowance, optionally since a timestamp. Returns {data: MemberConsumption[]}.",
      inputSchema: S.listWalletConsumptionSchema,
      ...toolHints.readOnly,
    },
    async (input) =>
      callApi(input.bearer_token, (t) => repo.listWalletConsumption(t, strip(input, "bearer_token"))),
  );

  server.registerTool(
    "list_wallet_gifts",
    {
      title: "List wallet gifts",
      description:
        "List token gifts this workspace gives to other workspaces (one-off and recurring). Returns {data: WorkspaceGrant[]}.",
      inputSchema: S.noArgsSchema,
      ...toolHints.readOnly,
    },
    async (input) => callApi(input.bearer_token, (t) => repo.listWalletGifts(t)),
  );

  server.registerTool(
    "list_agent_sessions",
    {
      title: "List Max chat threads",
      description:
        "List the caller's own Max chat threads (API key: its owner's), most recent first, for one surface (default max_chat). Returns {data: AgentSession[]}.",
      inputSchema: S.listAgentSessionsSchema,
      ...toolHints.readOnly,
    },
    async (input) =>
      callApi(input.bearer_token, (t) => repo.listAgentSessions(t, strip(input, "bearer_token"))),
  );

  server.registerTool(
    "get_agent_session_messages",
    {
      title: "Get Max chat thread",
      description:
        "Read one of the caller's Max chat threads, oldest message first (first 500). Returns {data: {session, messages}}.",
      inputSchema: S.getAgentSessionMessagesSchema,
      ...toolHints.readOnly,
    },
    async (input) =>
      callApi(input.bearer_token, (t) => repo.getAgentSessionMessages(t, input.session_id)),
  );
}

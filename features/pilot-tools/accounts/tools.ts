import { callApi, strip, type McpServer } from "../shared";
import * as repo from "./repository";
import * as S from "./schema";

export function registerAccountTools(server: McpServer): void {
  server.registerTool("list_accounts", {
    title: "List accounts",
    description: "List all connected LinkedIn and email accounts — name, email, status, daily limits.",
    inputSchema: S.listAccountsSchema,
  }, async (input) => callApi(input.bearer_token, (t) => repo.listAccounts(t)));

  server.registerTool("get_account", {
    title: "Get account",
    description: "Get full details of a connected account — provider, channel, config, sync status.",
    inputSchema: S.getAccountSchema,
  }, async (input) => callApi(input.bearer_token, (t) => repo.getAccount(t, input.id)));

  server.registerTool("update_account", {
    title: "Update account config",
    description: "Update account sender name, timezone, and working hours.",
    inputSchema: S.updateAccountSchema,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.updateAccount(t, input.id, { config: input.config })));

  server.registerTool("disconnect_account", {
    title: "Disconnect account",
    description: "Disconnect a LinkedIn or email account from the workspace. Use hosted_auth_link to reconnect.",
    inputSchema: S.disconnectAccountSchema,
  }, async (input) => callApi(input.bearer_token, (t) => repo.disconnectAccount(t, input.account_id)));

  server.registerTool("get_account_rate_limits", {
    title: "Get account rate limits",
    description: "Get daily/weekly sending limits and current usage for a specific account.",
    inputSchema: S.getAccountRateLimitsSchema,
  }, async (input) => callApi(input.bearer_token, (t) => repo.getAccountRateLimits(t, input.id)));

  server.registerTool("update_account_rate_limit", {
    title: "Update account rate limit",
    description: "Update daily or weekly sending cap for a specific rate-limit row.",
    inputSchema: S.updateAccountRateLimitSchema,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.updateAccountRateLimit(t, input.id, strip(input, "bearer_token", "id"))));

  server.registerTool("hosted_auth_link", {
    title: "Generate hosted auth link",
    description: "Generate a short-lived URL for the user to connect a LinkedIn or email account via Unipile hosted auth.",
    inputSchema: S.hostedAuthLinkSchema,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.hostedAuthLink(t, strip(input, "bearer_token"))));
}

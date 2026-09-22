import { callApi, omitKey, strip, toolHints, type McpServer } from "../shared";
import * as repo from "./repository";
import * as S from "./schema";

export function registerUniboxTools(server: McpServer): void {
  server.registerTool("list_chats", {
    title: "List chats (Unibox)",
    description: "List LinkedIn and email conversations — filter by channel, prospect, account, or archived status.",
    inputSchema: S.listChatsSchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.listChats(t, omitKey(input, "bearer_token"))));

  server.registerTool("get_chat", {
    title: "Get chat",
    description: "Get full details of a single Unibox chat/conversation thread.",
    inputSchema: S.getChatSchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) => repo.getChat(t, input.id)));

  server.registerTool("update_chat", {
    title: "Update chat",
    description: "Update chat metadata — title, read state, archived status, prospect link.",
    inputSchema: S.updateChatSchema,
    ...toolHints.idempotent,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.updateChat(t, input.id, strip(input, "bearer_token", "id"))));

  server.registerTool("archive_chat", {
    title: "Archive chat",
    description: "Archive a chat (soft delete). Messages remain, use archived=true filter to see them.",
    inputSchema: S.archiveChatSchema,
    ...toolHints.destructive,
  }, async (input) => callApi(input.bearer_token, (t) => repo.archiveChat(t, input.id)));

  server.registerTool("list_chat_messages", {
    title: "List chat messages",
    description: "Get all messages in a conversation — body, direction (in/out), timestamp, status.",
    inputSchema: S.listChatMessagesSchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.listChatMessages(t, input.chat_id, { page: input.page, pageSize: input.pageSize })));

  server.registerTool("send_chat_message", {
    title: "Send chat message",
    description: "Send a manual reply in an existing Unibox chat. Channel (email/LinkedIn) is inferred from the chat.",
    inputSchema: S.sendChatMessageSchema,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.sendChatMessage(t, input.chat_id, input.text)));

  server.registerTool("send_new_email", {
    title: "Send new email",
    description: "Compose and send a brand-new email to any recipient, outside any chat or campaign. Sends from the workspace's connected email account. Use send_chat_message instead to reply within an existing conversation.",
    inputSchema: S.sendNewEmailSchema,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.sendNewEmail(t, strip(input, "bearer_token"))));

  server.registerTool("list_unibox_channels", {
    title: "List Unibox channels",
    description: "List the accounts the Unibox imports (own + shared-in email, LinkedIn, WhatsApp) with message/contact stats, the last history-import job and each account's sync rules.",
    inputSchema: S.listChannelsSchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) => repo.listChannels(t)));

  server.registerTool("get_channel_sync_rules", {
    title: "Get channel sync rules",
    description: "Get one account's Unibox history-import rules. No rules = import everything.",
    inputSchema: S.getChannelSyncRulesSchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) => repo.getChannelSyncRules(t, input.account_id)));

  server.registerTool("set_channel_sync_rules", {
    title: "Replace channel sync rules",
    description: "Replace an account's Unibox history-import rules with the given full set (max 20). A message is imported when any enabled rule matches; [] imports everything. Returns the saved rules.",
    inputSchema: S.setChannelSyncRulesSchema,
    ...toolHints.idempotent,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.setChannelSyncRules(t, input.account_id, { rules: input.rules })));

  server.registerTool("suggest_chat_replies", {
    title: "Suggest chat replies",
    description: "Generate up to 3 ready-to-send reply drafts for a Unibox chat (nothing is sent). Charges 1 automation credit per call (402 when the balance is short). Returns {suggestions: [{label, intent, deal_target, rationale, text}], usedProspectCard}.",
    inputSchema: S.suggestChatRepliesSchema,
  }, async (input) => callApi(input.bearer_token, (t) => repo.suggestChatReplies(t, input.chat_id)));

  server.registerTool("get_unibox_message", {
    title: "Get Unibox message",
    description: "Get one Unibox message's full body as plain text: {id, chat_id, subject, text}. Private messages return 404.",
    inputSchema: S.getMessageSchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) => repo.getMessage(t, input.message_id)));

  server.registerTool("sync_unibox", {
    title: "Sync Unibox history",
    description: "Import message history from every connected account (or one account_id) into the Unibox. Long-running (up to ~5 min) and idempotent; returns partial:true when the time budget ran out — call again to continue. Track it with get_unibox_sync_progress.",
    inputSchema: S.syncUniboxSchema,
    ...toolHints.idempotent,
  }, async (input) => callApi(input.bearer_token, (t) => repo.syncUnibox(t, input.account_id)));

  server.registerTool("get_unibox_sync_progress", {
    title: "Get Unibox sync progress",
    description: "Live state of the Unibox history import: per-account phase and counters plus a summary. Cheap; poll while sync_unibox runs.",
    inputSchema: S.getSyncProgressSchema,
    ...toolHints.readOnly,
  }, async (input) => callApi(input.bearer_token, (t) => repo.getSyncProgress(t)));
}

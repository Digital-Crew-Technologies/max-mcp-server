import { callApi, strip, type McpServer } from "../shared";
import * as repo from "./repository";
import * as S from "./schema";

export function registerUniboxTools(server: McpServer): void {
  server.registerTool("list_chats", {
    title: "List chats (Unibox)",
    description: "List LinkedIn and email conversations — filter by channel, prospect, account, or archived status.",
    inputSchema: S.listChatsSchema,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.listChats(t, strip(input, "bearer_token") as any)));

  server.registerTool("get_chat", {
    title: "Get chat",
    description: "Get full details of a single Unibox chat/conversation thread.",
    inputSchema: S.getChatSchema,
  }, async (input) => callApi(input.bearer_token, (t) => repo.getChat(t, input.id)));

  server.registerTool("update_chat", {
    title: "Update chat",
    description: "Update chat metadata — title, read state, archived status, prospect link.",
    inputSchema: S.updateChatSchema,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.updateChat(t, input.id, strip(input, "bearer_token", "id"))));

  server.registerTool("archive_chat", {
    title: "Archive chat",
    description: "Archive a chat (soft delete). Messages remain, use archived=true filter to see them.",
    inputSchema: S.archiveChatSchema,
  }, async (input) => callApi(input.bearer_token, (t) => repo.archiveChat(t, input.id)));

  server.registerTool("list_chat_messages", {
    title: "List chat messages",
    description: "Get all messages in a conversation — body, direction (in/out), timestamp, status.",
    inputSchema: S.listChatMessagesSchema,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.listChatMessages(t, input.chat_id, { page: input.page, pageSize: input.pageSize })));

  server.registerTool("send_chat_message", {
    title: "Send chat message",
    description: "Send a manual reply in an existing Unibox chat. Channel (email/LinkedIn) is inferred from the chat.",
    inputSchema: S.sendChatMessageSchema,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.sendChatMessage(t, input.chat_id, input.text)));
}

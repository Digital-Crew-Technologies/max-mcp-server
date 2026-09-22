import { z } from "zod";
import { withToken } from "../shared";

export const listChatsSchema = z.object({
  ...withToken,
  page: z.number().int().min(1).optional().describe("Page number (default 1)"),
  pageSize: z.number().int().min(1).max(100).optional().describe("Results per page (default 20, max 100)"),
  channel: z.enum(["email", "linkedin"]).optional().describe("Filter by channel"),
  prospect_id: z.string().uuid().optional().describe("Filter by prospect"),
  account_id: z.string().uuid().optional().describe("Filter by account"),
  archived: z.boolean().optional().describe("Show archived chats (default false)"),
});

export const getChatSchema = z.object({
  ...withToken,
  id: z.string().uuid().describe("Chat UUID"),
});

export const updateChatSchema = z.object({
  ...withToken,
  id: z.string().uuid().describe("Chat UUID"),
  title: z.string().optional(),
  unread_count: z.number().int().min(0).optional(),
  is_archived: z.boolean().optional(),
  prospect_id: z.string().uuid().nullable().optional(),
});

export const archiveChatSchema = z.object({
  ...withToken,
  id: z.string().uuid().describe("Chat UUID"),
});

export const listChatMessagesSchema = z.object({
  ...withToken,
  chat_id: z.string().uuid().describe("Chat/conversation UUID"),
  page: z.number().int().min(1).optional().describe("Page number (default 1)"),
  pageSize: z.number().int().min(1).max(100).optional().describe("Results per page (default 20, max 100)"),
});

export const sendChatMessageSchema = z.object({
  ...withToken,
  chat_id: z.string().uuid().describe("Chat UUID to reply in"),
  text: z.string().min(1).describe("Message text to send"),
});

export const sendNewEmailSchema = z.object({
  ...withToken,
  to: z.string().email().describe("Recipient email address"),
  subject: z.string().min(1).describe("Email subject"),
  body: z.string().min(1).describe("Email body (plain text; newlines become <br>)"),
  to_name: z.string().optional().describe("Recipient display name"),
  cc: z.array(z.string().email()).optional().describe("CC email addresses"),
  account_id: z
    .string()
    .uuid()
    .optional()
    .describe("Which connected email account to send from; defaults to the first connected one"),
});

export const listChannelsSchema = z.object({ ...withToken });

export const getChannelSyncRulesSchema = z.object({
  ...withToken,
  account_id: z.string().uuid().describe("Account UUID (from list_unibox_channels)"),
});

const syncRuleSchema = z.object({
  name: z.string().trim().min(1).max(80).describe("Rule label"),
  enabled: z.boolean().optional().describe("Default true; disabled rules are ignored"),
  direction: z.enum(["all", "inbound", "outbound"]).optional().describe("Default 'all'"),
  sync_from: z.string().datetime({ offset: true }).nullable().optional()
    .describe("ISO instant; older messages don't match"),
  max_age_days: z.number().int().min(1).max(3650).nullable().optional()
    .describe("Only messages newer than N days match"),
  folders: z.array(z.string().trim().min(1)).max(20).optional()
    .describe("Only messages in these provider folders/labels match; empty = any folder"),
  skip_empty: z.boolean().optional().describe("Skip messages with no text (default false)"),
  include_attachments: z.boolean().optional().describe("Capture attachments of matched messages (default true)"),
});

export const setChannelSyncRulesSchema = z.object({
  ...withToken,
  account_id: z.string().uuid().describe("Account UUID (from list_unibox_channels)"),
  rules: z.array(syncRuleSchema).max(20)
    .describe("The complete new rule set (replaces all existing rules). [] = import everything"),
});

export const suggestChatRepliesSchema = z.object({
  ...withToken,
  chat_id: z.string().uuid().describe("Chat UUID"),
});

export const getMessageSchema = z.object({
  ...withToken,
  message_id: z.string().uuid().describe("Message UUID (from list_chat_messages)"),
});

export const syncUniboxSchema = z.object({
  ...withToken,
  account_id: z.string().uuid().optional().describe("Sync only this account; omit for every connected account"),
});

export const getSyncProgressSchema = z.object({ ...withToken });

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

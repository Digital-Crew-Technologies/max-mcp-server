import { z } from "zod";
import { withToken } from "../shared";

// ── Profiles ────────────────────────────────────────────────────────────────
export const findProfileSchema = z.object({
  ...withToken,
  first_name: z.string().describe("Person's first name"),
  last_name: z.string().describe("Person's last name"),
  company: z.string().optional().describe("Current company — strongly recommended, narrows results"),
  title: z.string().optional().describe("Job title (e.g. 'CEO', 'VP Sales') — helps when name is common"),
});

export const getProfileSchema = z.object({
  ...withToken,
  identifier: z.string().describe("LinkedIn public identifier / slug (e.g. 'john-smith')"),
});

export const ownProfileSchema = z.object({ ...withToken });

export const companyProfileSchema = z.object({
  ...withToken,
  identifier: z.string().describe("Company identifier / slug (e.g. 'google')"),
});

export const connectionsSchema = z.object({ ...withToken });

export const searchPeopleSchema = z.object({
  ...withToken,
  keywords: z.string().describe("Search query (name, title, company, etc.)"),
  limit: z.number().int().min(1).max(50).optional().describe("Max results (default 10)"),
});

// ── Invitations ───────────────────────────────────────────────────────────────
export const sendInvitationSchema = z.object({
  ...withToken,
  provider_id: z.string().describe("Unipile provider_id from find_profile (NOT the LinkedIn URL)"),
  message: z.string().max(300).optional().describe("Optional personal note (max 300 chars)"),
});

export const invitationsReceivedSchema = z.object({
  ...withToken,
  limit: z.number().int().min(1).max(100).optional().describe("Max results (default 20)"),
});

export const invitationsSentSchema = z.object({
  ...withToken,
  limit: z.number().int().min(1).max(100).optional().describe("Max results (default 20)"),
});

export const cancelInvitationSchema = z.object({
  ...withToken,
  provider_id: z.string().describe("Provider_id of the person you invited"),
});

// ── Messaging ───────────────────────────────────────────────────────────────
export const sendMessageSchema = z.object({
  ...withToken,
  provider_id: z.string().describe("Unipile provider_id of the recipient"),
  text: z.string().describe("Message text"),
});

export const replyInChatSchema = z.object({
  ...withToken,
  chat_id: z.string().describe("Chat ID from linkedin_conversations"),
  text: z.string().describe("Reply text"),
});

export const conversationsSchema = z.object({
  ...withToken,
  limit: z.number().int().min(1).max(100).optional().describe("Max conversations (default 20)"),
});

export const conversationMessagesSchema = z.object({
  ...withToken,
  chat_id: z.string().describe("Chat ID from linkedin_conversations"),
  limit: z.number().int().min(1).max(200).optional().describe("Max messages (default 50)"),
});

export const allMessagesSchema = z.object({
  ...withToken,
  limit: z.number().int().min(1).max(200).optional().describe("Max messages (default 50)"),
});

// ── Posts ───────────────────────────────────────────────────────────────────
export const createPostSchema = z.object({
  ...withToken,
  text: z.string().describe("Post content"),
});

export const userPostsSchema = z.object({
  ...withToken,
  provider_id: z.string().describe("Unipile provider_id of the user"),
  limit: z.number().int().min(1).max(50).optional().describe("Max posts (default 10)"),
});

export const reactToPostSchema = z.object({
  ...withToken,
  post_id: z.string().describe("Post ID"),
  reaction: z
    .enum(["LIKE", "CELEBRATE", "SUPPORT", "FUNNY", "LOVE", "INSIGHTFUL"])
    .describe("Reaction type"),
});

export const commentOnPostSchema = z.object({
  ...withToken,
  post_id: z.string().describe("Post ID"),
  text: z.string().describe("Comment text"),
});

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
  api: z
    .enum(["classic", "sales_navigator", "recruiter"])
    .optional()
    .describe(
      "LinkedIn product to search. Omit for auto: Sales Navigator when the account has it, classic otherwise. 'recruiter' only works on Recruiter accounts and hides names/profile URLs — use solely for explicit candidate-search asks.",
    ),
  keywords: z
    .string()
    .optional()
    .describe(
      "Free-text query (title, name, company…). Optional when filters or cursor are set.",
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe("Results per page (default 10, max 50)"),
  cursor: z
    .string()
    .optional()
    .describe(
      "Pagination cursor from a previous result. Each page costs 1 daily search — only paginate when the user asks for more.",
    ),
  location: z
    .array(z.string())
    .optional()
    .describe(
      "LinkedIn location parameter IDs — resolve with search_parameters (type LOCATION) first; never pass raw text",
    ),
  industry: z
    .array(z.string())
    .optional()
    .describe("Industry parameter IDs (search_parameters type INDUSTRY)"),
  company: z
    .array(z.string())
    .optional()
    .describe("Current-company parameter IDs (search_parameters type COMPANY)"),
  network_distance: z
    .array(z.number().int().min(1).max(3))
    .optional()
    .describe("Network distance filter: 1 = 1st, 2 = 2nd, 3 = 3rd+ degree"),
});

export const searchParametersSchema = z.object({
  ...withToken,
  type: z
    .enum(["LOCATION", "INDUSTRY", "COMPANY", "SCHOOL"])
    .describe("Parameter family to resolve"),
  keywords: z
    .string()
    .describe("Text to resolve into IDs, e.g. 'Paris' or 'fintech'"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .describe("Max suggestions (default 10)"),
});

export const searchQuotaSchema = z.object({ ...withToken });

export const saveSearchListSchema = z.object({
  ...withToken,
  list_name: z.string().min(1).describe("Name for the new prospect list"),
  search_criteria: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("The search filters used, stored on the list for provenance"),
  items: z
    .array(
      z.object({
        id: z.string().optional().describe("Provider id from search_people"),
        public_identifier: z.string().optional(),
        name: z.string().optional(),
        headline: z.string().optional(),
        location: z.string().optional(),
        profile_url: z.string().optional(),
      }),
    )
    .min(1)
    .max(500)
    .describe("search_people result items to save"),
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
  invitation_id: z
    .string()
    .describe("Invitation ID to withdraw (from linkedin_list_invitations_sent)"),
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

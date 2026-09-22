import { z } from "zod";
import { withToken } from "../shared";

// Mirrors max-agent src/features/social/social.schema.ts (each operation is
// `.strict()` there, so only the fields below may be sent).

// max-agent rejects control characters and the "." / ".." dot segments.
const identifier = z.string().trim().min(1).max(512)
  .refine((v) => !/[\u0000-\u001f\u007f]/.test(v) && v !== "." && v !== "..", "Invalid identifier");

const account = {
  account_id: z.string().uuid()
    .describe("Max account UUID of a connected LinkedIn or Instagram account (list_accounts)"),
};
const providerId = identifier.describe("Provider id of the person or company (linkedin find_profile/get_profile)");
const pagination = {
  cursor: z.string().trim().min(1).max(4096).optional().describe("Page cursor from the previous response"),
  limit: z.number().int().min(1).max(100).optional().describe("Page size (1-100, default 20)"),
};
const postId = identifier.describe("Provider post id (from social_list_posts)");
const commentId = identifier.optional().describe("Target this comment instead of the post");
const invitationId = identifier.describe("Invitation id from the matching social_list_invitations_* call");
const invitationCursor = pagination.cursor
  .describe("Cursor of the list page the invitation appeared on (omit for the first page)");

// ── Connections + invitations ───────────────────────────────────────────────
export const inviteSchema = z.object({
  ...withToken, ...account,
  provider_id: providerId,
  message: z.string().trim().min(1).max(300).optional()
    .describe("Personal note (max 300 chars; LinkedIn only)"),
});

export const listInvitationsSentSchema = z.object({ ...withToken, ...account, ...pagination });

export const listInvitationsReceivedSchema = z.object({ ...withToken, ...account, ...pagination });

export const cancelInvitationSchema = z.object({
  ...withToken, ...account,
  invitation_id: invitationId,
  cursor: invitationCursor,
});

export const handleInvitationSchema = z.object({
  ...withToken, ...account,
  invitation_id: invitationId,
  // Named `decision`, not `action`: grouped mode uses `action` as the
  // discriminator, and a field of that name would replace it. The repository
  // sends it upstream as `action`.
  decision: z.enum(["accept", "decline"]).describe("Accept or decline the received invitation"),
  cursor: invitationCursor,
});

export const relationshipSchema = z.object({ ...withToken, ...account, provider_id: providerId });

export const followSchema = z.object({
  ...withToken, ...account,
  provider_id: z.string().trim().min(1).max(256).regex(/^[A-Za-z0-9_.-]+$/)
    .refine((v) => v !== "." && v !== "..", "Invalid identifier")
    .describe("Provider id of the person or company to follow"),
});

export const endorseSkillSchema = z.object({
  ...withToken, ...account,
  provider_id: providerId,
  skill_endorsement_id: z.number().int().nonnegative()
    .describe("Endorsement id of the skill, from the person's profile skills section"),
});

// ── InMail ──────────────────────────────────────────────────────────────────
export const sendInmailSchema = z.object({
  ...withToken, ...account,
  provider_id: providerId,
  subject: z.string().trim().min(1).max(200).describe("InMail subject"),
  text: z.string().trim().min(1).max(1900).describe("InMail body (max 1900 chars)"),
  api: z.enum(["classic", "sales_navigator", "recruiter"])
    .describe("LinkedIn product whose InMail credits are spent"),
});

export const inmailBalanceSchema = z.object({ ...withToken, ...account });

// ── Posts ───────────────────────────────────────────────────────────────────
export const listPostsSchema = z.object({
  ...withToken, ...account,
  provider_id: providerId,
  is_company: z.boolean().optional().describe("True when provider_id is a company (LinkedIn only)"),
  ...pagination,
});

export const getPostSchema = z.object({ ...withToken, ...account, post_id: postId });

export const reactSchema = z.object({
  ...withToken, ...account,
  post_id: postId,
  comment_id: commentId,
  reaction_type: z.enum(["like", "celebrate", "support", "love", "insightful", "funny"]).optional()
    .describe("Default 'like' (the only one Instagram supports)"),
});

export const commentSchema = z.object({
  ...withToken, ...account,
  post_id: postId,
  comment_id: identifier.optional().describe("Reply to this comment instead of the post"),
  text: z.string().trim().min(1).max(1250).describe("Comment text (max 1250 chars)"),
});

export const listCommentsSchema = z.object({
  ...withToken, ...account,
  post_id: postId,
  comment_id: identifier.optional().describe("List replies to this comment instead"),
  ...pagination,
});

export const listReactionsSchema = z.object({
  ...withToken, ...account,
  post_id: postId,
  comment_id: identifier.optional().describe("List reactions on this comment instead"),
  ...pagination,
});

// Image attachments (base64 upload) are deliberately not exposed.
export const createPostSchema = z.object({
  ...withToken, ...account,
  text: z.string().trim().min(1).max(3000).describe("Post text (max 3000 chars)"),
});

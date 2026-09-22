// Social MCP tools: one tool per max-agent /api/v1/social/[action] operation.
//
// Same shape as linkedin/tools.ts (a table of actions, then a registrar that
// loops it), but each call names the exact LinkedIn or Instagram account to
// act as (`account_id`) instead of the workspace's default LinkedIn account.
// Writes act publicly on the provider as that account.

import type { z } from "zod";
import { callApi, strip, toolHints, type McpServer } from "../shared";
import * as repo from "./repository";
import * as S from "./schema";

type Hints = (typeof toolHints)[keyof typeof toolHints];

interface SocialAction {
  name: string;
  title: string;
  description: string;
  inputSchema: z.AnyZodObject;
  hints?: Hints;
  call: (token: string, args: Record<string, unknown>) => Promise<Response>;
}

const SOCIAL_ACTIONS: SocialAction[] = [
  // ── Connections + invitations ─────────────────────────────────────────────
  {
    name: "social_invite",
    title: "Send social invitation",
    description: "Send a connection invitation (LinkedIn) or follow request (Instagram) as the given account — goes out to the person. Returns {invitation_id}.",
    inputSchema: S.inviteSchema,
    call: repo.invite,
  },
  {
    name: "social_list_invitations_sent",
    title: "List sent invitations",
    description: "List pending invitations sent by the account. Paginated: {items, cursor}.",
    inputSchema: S.listInvitationsSentSchema,
    hints: toolHints.readOnly,
    call: repo.listInvitationsSent,
  },
  {
    name: "social_list_invitations_received",
    title: "List received invitations",
    description: "List invitations received by the account. Paginated: {items, cursor}.",
    inputSchema: S.listInvitationsReceivedSchema,
    hints: toolHints.readOnly,
    call: repo.listInvitationsReceived,
  },
  {
    name: "social_cancel_invitation",
    title: "Withdraw sent invitation",
    description: "Withdraw a pending invitation sent by the account (LinkedIn only).",
    inputSchema: S.cancelInvitationSchema,
    hints: toolHints.destructive,
    call: repo.cancelInvitation,
  },
  {
    name: "social_handle_invitation",
    title: "Accept or decline invitation",
    description: "Accept or decline an invitation received by the account. Returns {status: ACCEPTED|DECLINED}.",
    inputSchema: S.handleInvitationSchema,
    call: repo.handleInvitation,
  },
  {
    name: "social_relationship",
    title: "Check connection status",
    description: "Check whether the account is connected to a person (LinkedIn only): {status: connected|not_connected|unknown, network_distance}.",
    inputSchema: S.relationshipSchema,
    hints: toolHints.readOnly,
    call: repo.relationship,
  },
  {
    name: "social_follow",
    title: "Follow profile",
    description: "Follow a person or company as the account (publicly visible). LinkedIn returns {requested: true}; the follow itself is not confirmed.",
    inputSchema: S.followSchema,
    call: repo.follow,
  },
  {
    name: "social_endorse_skill",
    title: "Endorse skill",
    description: "Endorse one of a person's LinkedIn skills as the account (publicly visible). Returns {endorsed}.",
    inputSchema: S.endorseSkillSchema,
    call: repo.endorseSkill,
  },

  // ── InMail ────────────────────────────────────────────────────────────────
  {
    name: "social_send_inmail",
    title: "Send LinkedIn InMail",
    description: "Send a LinkedIn InMail as the account — sends a message and spends one InMail credit of the chosen product (see social_inmail_balance). Returns {chat_id, message_id}; nulls mean accepted but delivery unconfirmed.",
    inputSchema: S.sendInmailSchema,
    call: repo.sendInmail,
  },
  {
    name: "social_inmail_balance",
    title: "Get InMail balance",
    description: "Remaining LinkedIn InMail credits of the account per product: {premium, recruiter, sales_navigator}.",
    inputSchema: S.inmailBalanceSchema,
    hints: toolHints.readOnly,
    call: repo.inmailBalance,
  },

  // ── Posts ─────────────────────────────────────────────────────────────────
  {
    name: "social_list_posts",
    title: "List profile posts",
    description: "List recent posts by a person or company: text, date, counters, share_url. Paginated: {items, cursor}.",
    inputSchema: S.listPostsSchema,
    hints: toolHints.readOnly,
    call: repo.listPosts,
  },
  {
    name: "social_get_post",
    title: "Get post",
    description: "Get one post: text, author, date and reaction/comment/repost counters.",
    inputSchema: S.getPostSchema,
    hints: toolHints.readOnly,
    call: repo.getPost,
  },
  {
    name: "social_react",
    title: "React to post",
    description: "React to a post, or one of its comments, as the account (publicly visible).",
    inputSchema: S.reactSchema,
    call: repo.react,
  },
  {
    name: "social_comment",
    title: "Comment on post",
    description: "Publish a comment on a post, or a reply to one of its comments, as the account (public). Returns {comment_id}.",
    inputSchema: S.commentSchema,
    call: repo.comment,
  },
  {
    name: "social_list_comments",
    title: "List post comments",
    description: "List comments on a post, or replies to one comment. Paginated: {items, cursor}.",
    inputSchema: S.listCommentsSchema,
    hints: toolHints.readOnly,
    call: repo.listComments,
  },
  {
    name: "social_list_reactions",
    title: "List post reactions",
    description: "List reactions on a post or comment, with who reacted. Paginated: {items, cursor}.",
    inputSchema: S.listReactionsSchema,
    hints: toolHints.readOnly,
    call: repo.listReactions,
  },
  {
    name: "social_create_post",
    title: "Publish post",
    description: "Publish a text post as the account (public). LinkedIn only here: Instagram posts need an image, which this tool can't upload. Returns {post_id}.",
    inputSchema: S.createPostSchema,
    call: repo.createPost,
  },
];

export function registerSocialTools(server: McpServer): void {
  for (const a of SOCIAL_ACTIONS) {
    server.registerTool(
      a.name,
      {
        title: a.title,
        description: a.description,
        inputSchema: a.inputSchema,
        ...(a.hints ?? {}),
      },
      async (input) => callApi(input.bearer_token, (t) => a.call(t, strip(input, "bearer_token"))),
    );
  }
}

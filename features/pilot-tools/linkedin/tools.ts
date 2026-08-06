// LinkedIn MCP tools.
//
// Defines every LinkedIn action as a single GroupedActionDef entry, then
// exports BOTH a flat registrar (legacy — one tool per action) and a
// grouped registrar (new — one `linkedin` tool with discriminated union).
// `register.ts` picks between them via the GROUPED_TOOLS env flag.

import {
  callApi,
  strip,
  registerGroupedTool,
  type McpServer,
  type GroupedActionDef,
} from "../shared";
import * as repo from "./repository";
import * as S from "./schema";

// ── Action definitions ──────────────────────────────────────────────────────
// One entry per LinkedIn capability. `action` is the short name used inside
// the grouped tool ({"action": "find_profile", ...}). `flatName` is the
// classic `linkedin_*` name kept for backward compatibility in flat mode.

interface LinkedinAction extends GroupedActionDef {
  flatName: string;
}

const LINKEDIN_ACTIONS: LinkedinAction[] = [
  // ── Profiles ──────────────────────────────────────────────────────────────
  {
    action: "find_profile",
    flatName: "linkedin_find_profile",
    title: "Find LinkedIn profile",
    description:
      "Find a LinkedIn profile by name, company and/or title. Searches LinkedIn directly — always use this before any invitation or message. If multiple people share the name, returns candidates with ambiguous:true; show them to the user and ask which one. Never guess a slug or proceed when ambiguous.",
    inputShape: S.findProfileSchema.shape,
    handler: (input) =>
      callApi(input.bearer_token as string | undefined, (t) =>
        repo.findProfile(t, strip(input, "bearer_token")),
      ),
  },
  {
    action: "get_profile",
    flatName: "linkedin_get_profile",
    title: "Get LinkedIn profile",
    description:
      "Get a full LinkedIn profile by slug (public identifier). Returns provider_id and profile data.",
    inputShape: S.getProfileSchema.shape,
    handler: (input) =>
      callApi(input.bearer_token as string | undefined, (t) =>
        repo.getProfile(t, input.identifier as string),
      ),
  },
  {
    action: "get_own_profile",
    flatName: "linkedin_get_own_profile",
    title: "Get own LinkedIn profile",
    description:
      "Get the profile of the connected LinkedIn account. Useful to confirm the account is active.",
    inputShape: S.ownProfileSchema.shape,
    handler: (input) =>
      callApi(input.bearer_token as string | undefined, (t) => repo.ownProfile(t)),
  },
  {
    action: "get_company_profile",
    flatName: "linkedin_get_company_profile",
    title: "Get LinkedIn company profile",
    description: "Get a LinkedIn company profile by its identifier or slug.",
    inputShape: S.companyProfileSchema.shape,
    handler: (input) =>
      callApi(input.bearer_token as string | undefined, (t) =>
        repo.companyProfile(t, input.identifier as string),
      ),
  },
  {
    action: "list_connections",
    flatName: "linkedin_list_connections",
    title: "List LinkedIn connections",
    description: "List first-degree LinkedIn connections of the connected account.",
    inputShape: S.connectionsSchema.shape,
    handler: (input) =>
      callApi(input.bearer_token as string | undefined, (t) => repo.connections(t)),
  },
  {
    action: "search_people",
    flatName: "linkedin_search_people",
    title: "Search LinkedIn people",
    description:
      "Search LinkedIn people via the user's connected account. Filters (location/industry/company) take parameter IDs from search_parameters, never raw text. Every call — including cursor pages — uses 1 of the account's daily search budget (default 50/day); results embed a quota snapshot. Returns 429 SEARCH_QUOTA_EXCEEDED when exhausted.",
    inputShape: S.searchPeopleSchema.shape,
    handler: (input) =>
      callApi(input.bearer_token as string | undefined, (t) =>
        repo.searchPeople(t, strip(input, "bearer_token")),
      ),
  },
  {
    action: "search_parameters",
    flatName: "linkedin_search_parameters",
    title: "Resolve LinkedIn search filter IDs",
    description:
      "Resolve free text into LinkedIn parameter IDs (location/industry/company/school) for search_people filters. Typeahead lookup — does not consume the search quota.",
    inputShape: S.searchParametersSchema.shape,
    handler: (input) =>
      callApi(input.bearer_token as string | undefined, (t) =>
        repo.searchParameters(t, strip(input, "bearer_token")),
      ),
  },
  {
    action: "get_search_quota",
    flatName: "linkedin_get_search_quota",
    title: "Get LinkedIn search quota",
    description:
      "Remaining LinkedIn people-searches for the connected account: {cap, used_today, remaining, weekly_cap, used_this_week, weekly_remaining, resets_at}.",
    inputShape: S.searchQuotaSchema.shape,
    handler: (input) =>
      callApi(input.bearer_token as string | undefined, (t) =>
        repo.searchQuota(t),
      ),
  },

  // ── Invitations ───────────────────────────────────────────────────────────
  {
    action: "send_invitation",
    flatName: "linkedin_send_invitation",
    title: "Send LinkedIn invitation",
    description:
      "Send a LinkedIn connection request. ALWAYS call find_profile first to get provider_id.",
    inputShape: S.sendInvitationSchema.shape,
    handler: (input) =>
      callApi(input.bearer_token as string | undefined, (t) =>
        repo.sendInvitation(t, strip(input, "bearer_token")),
      ),
  },
  {
    action: "list_invitations_received",
    flatName: "linkedin_list_invitations_received",
    title: "List received LinkedIn invitations",
    description: "List pending LinkedIn invitations received from others.",
    inputShape: S.invitationsReceivedSchema.shape,
    handler: (input) =>
      callApi(input.bearer_token as string | undefined, (t) =>
        repo.invitationsReceived(t, input.limit as number | undefined),
      ),
  },
  {
    action: "list_invitations_sent",
    flatName: "linkedin_list_invitations_sent",
    title: "List sent LinkedIn invitations",
    description: "List pending LinkedIn invitations you have sent.",
    inputShape: S.invitationsSentSchema.shape,
    handler: (input) =>
      callApi(input.bearer_token as string | undefined, (t) =>
        repo.invitationsSent(t, input.limit as number | undefined),
      ),
  },
  {
    action: "cancel_invitation",
    flatName: "linkedin_cancel_invitation",
    title: "Cancel sent LinkedIn invitation",
    description:
      "Cancel/withdraw a sent LinkedIn invitation by its invitation_id (from list_invitations_sent).",
    inputShape: S.cancelInvitationSchema.shape,
    handler: (input) =>
      callApi(input.bearer_token as string | undefined, (t) =>
        repo.cancelInvitation(t, strip(input, "bearer_token")),
      ),
  },

  // ── Messaging ─────────────────────────────────────────────────────────────
  {
    action: "send_message",
    flatName: "linkedin_send_message",
    title: "Send LinkedIn message",
    description:
      "Send a LinkedIn direct message to start a new conversation. Requires existing connection or InMail credits.",
    inputShape: S.sendMessageSchema.shape,
    handler: (input) =>
      callApi(input.bearer_token as string | undefined, (t) =>
        repo.sendMessage(t, strip(input, "bearer_token")),
      ),
  },
  {
    action: "reply_in_chat",
    flatName: "linkedin_reply_in_chat",
    title: "Reply in LinkedIn chat",
    description: "Reply in an existing LinkedIn conversation.",
    inputShape: S.replyInChatSchema.shape,
    handler: (input) =>
      callApi(input.bearer_token as string | undefined, (t) =>
        repo.replyInChat(t, strip(input, "bearer_token")),
      ),
  },
  {
    action: "list_conversations",
    flatName: "linkedin_list_conversations",
    title: "List LinkedIn conversations",
    description: "List LinkedIn conversations (inbox).",
    inputShape: S.conversationsSchema.shape,
    handler: (input) =>
      callApi(input.bearer_token as string | undefined, (t) =>
        repo.conversations(t, input.limit as number | undefined),
      ),
  },
  {
    action: "get_conversation_messages",
    flatName: "linkedin_get_conversation_messages",
    title: "Get LinkedIn conversation messages",
    description: "Get messages in a specific LinkedIn conversation.",
    inputShape: S.conversationMessagesSchema.shape,
    handler: (input) =>
      callApi(input.bearer_token as string | undefined, (t) =>
        repo.conversationMessages(t, strip(input, "bearer_token")),
      ),
  },
  {
    action: "get_all_messages",
    flatName: "linkedin_get_all_messages",
    title: "Get all LinkedIn messages",
    description: "Get all recent LinkedIn messages across all conversations.",
    inputShape: S.allMessagesSchema.shape,
    handler: (input) =>
      callApi(input.bearer_token as string | undefined, (t) =>
        repo.allMessages(t, input.limit as number | undefined),
      ),
  },

  // ── Posts ─────────────────────────────────────────────────────────────────
  {
    action: "create_post",
    flatName: "linkedin_create_post",
    title: "Create LinkedIn post",
    description: "Create a LinkedIn post from the connected account.",
    inputShape: S.createPostSchema.shape,
    handler: (input) =>
      callApi(input.bearer_token as string | undefined, (t) =>
        repo.createPost(t, strip(input, "bearer_token")),
      ),
  },
  {
    action: "get_user_posts",
    flatName: "linkedin_get_user_posts",
    title: "Get LinkedIn user posts",
    description: "Get recent posts by a LinkedIn user.",
    inputShape: S.userPostsSchema.shape,
    handler: (input) =>
      callApi(input.bearer_token as string | undefined, (t) =>
        repo.userPosts(t, strip(input, "bearer_token")),
      ),
  },
  {
    action: "react_to_post",
    flatName: "linkedin_react_to_post",
    title: "React to LinkedIn post",
    description: "React to a LinkedIn post.",
    inputShape: S.reactToPostSchema.shape,
    handler: (input) =>
      callApi(input.bearer_token as string | undefined, (t) =>
        repo.reactToPost(t, strip(input, "bearer_token")),
      ),
  },
  {
    action: "comment_on_post",
    flatName: "linkedin_comment_on_post",
    title: "Comment on LinkedIn post",
    description: "Comment on a LinkedIn post.",
    inputShape: S.commentOnPostSchema.shape,
    handler: (input) =>
      callApi(input.bearer_token as string | undefined, (t) =>
        repo.commentOnPost(t, strip(input, "bearer_token")),
      ),
  },
];

// ── Flat registrar (legacy — one tool per action) ──────────────────────────

export function registerLinkedinTools(server: McpServer): void {
  for (const a of LINKEDIN_ACTIONS) {
    server.registerTool(
      a.flatName,
      {
        title: a.title,
        description: a.description,
        inputSchema: { ...a.inputShape },
      },
      async (input) => a.handler(input),
    );
  }
}

// ── Grouped registrar (new — single `linkedin` tool with oneOf union) ──────

export function registerLinkedinToolsGrouped(server: McpServer): void {
  registerGroupedTool(
    server,
    "linkedin",
    "LinkedIn actions via Unipile: find profiles, search people on the user's own account (quota-limited), send invitations + messages, list connections + conversations, post + react + comment.",
    LINKEDIN_ACTIONS,
  );
}

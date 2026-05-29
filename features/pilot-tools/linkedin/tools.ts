import { callApi, strip, type McpServer } from "../shared";
import * as repo from "./repository";
import * as S from "./schema";

export function registerLinkedinTools(server: McpServer): void {
  // ── Profiles ──────────────────────────────────────────────────────────────
  server.registerTool("linkedin_find_profile", {
    title: "Find LinkedIn profile",
    description:
      "Find a LinkedIn profile by name, company and/or title. Searches LinkedIn directly — always use this before any invitation or message. If multiple people share the name, returns candidates with ambiguous:true; show them to the user and ask which one. Never guess a slug or proceed when ambiguous.",
    inputSchema: S.findProfileSchema,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.findProfile(t, strip(input, "bearer_token"))));

  server.registerTool("linkedin_get_profile", {
    title: "Get LinkedIn profile",
    description: "Get a full LinkedIn profile by slug (public identifier). Returns provider_id and profile data.",
    inputSchema: S.getProfileSchema,
  }, async (input) => callApi(input.bearer_token, (t) => repo.getProfile(t, input.identifier)));

  server.registerTool("linkedin_get_own_profile", {
    title: "Get own LinkedIn profile",
    description: "Get the profile of the connected LinkedIn account. Useful to confirm the account is active.",
    inputSchema: S.ownProfileSchema,
  }, async (input) => callApi(input.bearer_token, (t) => repo.ownProfile(t)));

  server.registerTool("linkedin_get_company_profile", {
    title: "Get LinkedIn company profile",
    description: "Get a LinkedIn company profile by its identifier or slug.",
    inputSchema: S.companyProfileSchema,
  }, async (input) => callApi(input.bearer_token, (t) => repo.companyProfile(t, input.identifier)));

  server.registerTool("linkedin_list_connections", {
    title: "List LinkedIn connections",
    description: "List first-degree LinkedIn connections of the connected account.",
    inputSchema: S.connectionsSchema,
  }, async (input) => callApi(input.bearer_token, (t) => repo.connections(t)));

  server.registerTool("linkedin_search_people", {
    title: "Search LinkedIn people",
    description: "Search LinkedIn for people by keywords.",
    inputSchema: S.searchPeopleSchema,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.searchPeople(t, strip(input, "bearer_token"))));

  // ── Invitations ─────────────────────────────────────────────────────────────
  server.registerTool("linkedin_send_invitation", {
    title: "Send LinkedIn invitation",
    description: "Send a LinkedIn connection request. ALWAYS call linkedin_find_profile first to get provider_id.",
    inputSchema: S.sendInvitationSchema,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.sendInvitation(t, strip(input, "bearer_token"))));

  server.registerTool("linkedin_list_invitations_received", {
    title: "List received LinkedIn invitations",
    description: "List pending LinkedIn invitations received from others.",
    inputSchema: S.invitationsReceivedSchema,
  }, async (input) => callApi(input.bearer_token, (t) => repo.invitationsReceived(t, input.limit)));

  server.registerTool("linkedin_list_invitations_sent", {
    title: "List sent LinkedIn invitations",
    description: "List pending LinkedIn invitations you have sent.",
    inputSchema: S.invitationsSentSchema,
  }, async (input) => callApi(input.bearer_token, (t) => repo.invitationsSent(t, input.limit)));

  server.registerTool("linkedin_cancel_invitation", {
    title: "Cancel sent LinkedIn invitation",
    description: "Cancel/withdraw a sent LinkedIn invitation by its invitation_id (from linkedin_list_invitations_sent).",
    inputSchema: S.cancelInvitationSchema,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.cancelInvitation(t, strip(input, "bearer_token"))));

  // ── Messaging ───────────────────────────────────────────────────────────────
  server.registerTool("linkedin_send_message", {
    title: "Send LinkedIn message",
    description: "Send a LinkedIn direct message to start a new conversation. Requires existing connection or InMail credits.",
    inputSchema: S.sendMessageSchema,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.sendMessage(t, strip(input, "bearer_token"))));

  server.registerTool("linkedin_reply_in_chat", {
    title: "Reply in LinkedIn chat",
    description: "Reply in an existing LinkedIn conversation.",
    inputSchema: S.replyInChatSchema,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.replyInChat(t, strip(input, "bearer_token"))));

  server.registerTool("linkedin_list_conversations", {
    title: "List LinkedIn conversations",
    description: "List LinkedIn conversations (inbox).",
    inputSchema: S.conversationsSchema,
  }, async (input) => callApi(input.bearer_token, (t) => repo.conversations(t, input.limit)));

  server.registerTool("linkedin_get_conversation_messages", {
    title: "Get LinkedIn conversation messages",
    description: "Get messages in a specific LinkedIn conversation.",
    inputSchema: S.conversationMessagesSchema,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.conversationMessages(t, strip(input, "bearer_token"))));

  server.registerTool("linkedin_get_all_messages", {
    title: "Get all LinkedIn messages",
    description: "Get all recent LinkedIn messages across all conversations.",
    inputSchema: S.allMessagesSchema,
  }, async (input) => callApi(input.bearer_token, (t) => repo.allMessages(t, input.limit)));

  // ── Posts ───────────────────────────────────────────────────────────────────
  server.registerTool("linkedin_create_post", {
    title: "Create LinkedIn post",
    description: "Create a LinkedIn post from the connected account.",
    inputSchema: S.createPostSchema,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.createPost(t, strip(input, "bearer_token"))));

  server.registerTool("linkedin_get_user_posts", {
    title: "Get LinkedIn user posts",
    description: "Get recent posts by a LinkedIn user.",
    inputSchema: S.userPostsSchema,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.userPosts(t, strip(input, "bearer_token"))));

  server.registerTool("linkedin_react_to_post", {
    title: "React to LinkedIn post",
    description: "React to a LinkedIn post.",
    inputSchema: S.reactToPostSchema,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.reactToPost(t, strip(input, "bearer_token"))));

  server.registerTool("linkedin_comment_on_post", {
    title: "Comment on LinkedIn post",
    description: "Comment on a LinkedIn post.",
    inputSchema: S.commentOnPostSchema,
  }, async (input) => callApi(input.bearer_token, (t) =>
    repo.commentOnPost(t, strip(input, "bearer_token"))));
}

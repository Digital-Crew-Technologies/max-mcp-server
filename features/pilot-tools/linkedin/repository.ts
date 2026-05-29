import { apiUrl, authHeaders, buildQuery, fetchWithRetry } from "../shared";

const base = "/api/v1/linkedin";

function get(
  token: string,
  action: string,
  query: Record<string, unknown> = {},
): Promise<Response> {
  return fetchWithRetry(apiUrl(`${base}/${action}${buildQuery(query)}`), {
    headers: authHeaders(token),
  });
}

function post(
  token: string,
  action: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(apiUrl(`${base}/${action}`), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

// ── Profiles ──────────────────────────────────────────────────────────────
export const findProfile = (token: string, q: Record<string, unknown>) =>
  get(token, "find-profile", q);
export const getProfile = (token: string, identifier: string) =>
  get(token, "get-profile", { identifier });
export const ownProfile = (token: string) => get(token, "own-profile");
export const companyProfile = (token: string, identifier: string) =>
  get(token, "company-profile", { identifier });
export const connections = (token: string) => get(token, "connections");
export const searchPeople = (token: string, q: Record<string, unknown>) =>
  get(token, "search-people", q);

// ── Invitations ─────────────────────────────────────────────────────────────
export const sendInvitation = (token: string, body: Record<string, unknown>) =>
  post(token, "send-invitation", body);
export const invitationsReceived = (token: string, limit?: number) =>
  get(token, "invitations-received", { limit });
export const invitationsSent = (token: string, limit?: number) =>
  get(token, "invitations-sent", { limit });
export const handleInvitation = (token: string, body: Record<string, unknown>) =>
  post(token, "handle-invitation", body);
export const cancelInvitation = (token: string, body: Record<string, unknown>) =>
  post(token, "cancel-invitation", body);

// ── Messaging ───────────────────────────────────────────────────────────────
export const sendMessage = (token: string, body: Record<string, unknown>) =>
  post(token, "send-message", body);
export const replyInChat = (token: string, body: Record<string, unknown>) =>
  post(token, "reply-in-chat", body);
export const conversations = (token: string, limit?: number) =>
  get(token, "conversations", { limit });
export const conversationMessages = (token: string, q: Record<string, unknown>) =>
  get(token, "conversation-messages", q);
export const allMessages = (token: string, limit?: number) =>
  get(token, "all-messages", { limit });

// ── Posts ───────────────────────────────────────────────────────────────────
export const createPost = (token: string, body: Record<string, unknown>) =>
  post(token, "create-post", body);
export const userPosts = (token: string, q: Record<string, unknown>) =>
  get(token, "user-posts", q);
export const reactToPost = (token: string, body: Record<string, unknown>) =>
  post(token, "react-to-post", body);
export const commentOnPost = (token: string, body: Record<string, unknown>) =>
  post(token, "comment-on-post", body);

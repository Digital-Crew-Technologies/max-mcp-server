import { apiUrl, authHeaders, buildQuery, fetchWithRetry } from "../shared";

// max-agent's /api/v1/social/[action] runs one Unipile operation for an
// explicit LinkedIn or Instagram account (account_id). Reads are GET with
// query args, writes are POST with a JSON body; the route rejects the other
// method with 405. Action path segments use dashes (the handler maps them to
// the underscore operation names).
const base = "/api/v1/social";

// Writes act publicly on the provider. max-agent makes a single provider
// attempt and reports `outcome_unknown` when delivery can't be confirmed, so
// a client-side retry could post/comment/invite twice: never retry them.
const WRITE_CONFIG = { timeoutMs: 60_000, maxRetries: 0 };

function get(token: string, action: string, query: Record<string, unknown>): Promise<Response> {
  return fetchWithRetry(apiUrl(`${base}/${action}${buildQuery(query)}`), {
    headers: authHeaders(token),
  });
}

function post(token: string, action: string, body: Record<string, unknown>): Promise<Response> {
  return fetchWithRetry(
    apiUrl(`${base}/${action}`),
    { method: "POST", headers: authHeaders(token), body: JSON.stringify(body) },
    WRITE_CONFIG,
  );
}

type Args = Record<string, unknown>;

// ── Connections + invitations ───────────────────────────────────────────────
export const invite = (token: string, body: Args) => post(token, "invite", body);
export const listInvitationsSent = (token: string, q: Args) => get(token, "list-invitations-sent", q);
export const listInvitationsReceived = (token: string, q: Args) =>
  get(token, "list-invitations-received", q);
export const cancelInvitation = (token: string, body: Args) => post(token, "cancel-invitation", body);
export const handleInvitation = (token: string, { decision, ...body }: Args) =>
  post(token, "handle-invitation", { ...body, action: decision });
export const relationship = (token: string, q: Args) => get(token, "relationship", q);
export const follow = (token: string, body: Args) => post(token, "follow", body);
export const endorseSkill = (token: string, body: Args) => post(token, "endorse-skill", body);

// ── InMail ──────────────────────────────────────────────────────────────────
export const sendInmail = (token: string, body: Args) => post(token, "send-inmail", body);
export const inmailBalance = (token: string, q: Args) => get(token, "inmail-balance", q);

// ── Posts ───────────────────────────────────────────────────────────────────
export const listPosts = (token: string, q: Args) => get(token, "list-posts", q);
export const getPost = (token: string, q: Args) => get(token, "get-post", q);
export const react = (token: string, body: Args) => post(token, "react", body);
export const comment = (token: string, body: Args) => post(token, "comment", body);
export const listComments = (token: string, q: Args) => get(token, "list-comments", q);
export const listReactions = (token: string, q: Args) => get(token, "list-reactions", q);
export const createPost = (token: string, body: Args) => post(token, "create-post", body);

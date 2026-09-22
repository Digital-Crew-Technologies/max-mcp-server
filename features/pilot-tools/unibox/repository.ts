import { apiUrl, authHeaders, buildQuery, fetchWithRetry } from "../shared";

export async function listChats(
  token: string,
  params: Record<string, unknown> = {},
): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/unibox/chats${buildQuery(params)}`), {
    headers: authHeaders(token),
  });
}

export async function getChat(token: string, id: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/unibox/chats/${id}`), { headers: authHeaders(token) });
}

export async function updateChat(token: string, id: string, body: Record<string, unknown>): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/unibox/chats/${id}`), {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

export async function archiveChat(token: string, id: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/unibox/chats/${id}`), {
    method: "DELETE",
    headers: authHeaders(token),
  });
}

export async function listChatMessages(
  token: string,
  chatId: string,
  params: { page?: number; pageSize?: number } = {},
): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/unibox/chats/${chatId}/messages${buildQuery(params)}`), {
    headers: authHeaders(token),
  });
}

export async function sendChatMessage(token: string, chatId: string, text: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/unibox/chats/${chatId}/messages`), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ text }),
  });
}

export async function sendNewEmail(token: string, body: Record<string, unknown>): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/unibox/send-email`), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

// ── Channels + sync rules ─────────────────────────────────────────────────────
export async function listChannels(token: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/unibox/channels`), { headers: authHeaders(token) });
}

export async function getChannelSyncRules(token: string, accountId: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/unibox/channels/${accountId}/rules`), {
    headers: authHeaders(token),
  });
}

export async function setChannelSyncRules(
  token: string,
  accountId: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/unibox/channels/${accountId}/rules`), {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

// ── AI reply suggestions ──────────────────────────────────────────────────────
// A model call that charges an automation credit on success, with no
// idempotency key: never retry (a retry would bill twice).
export async function suggestChatReplies(token: string, chatId: string): Promise<Response> {
  return fetchWithRetry(
    apiUrl(`/api/v1/unibox/chats/${chatId}/reply-suggestions`),
    { method: "POST", headers: authHeaders(token) },
    { timeoutMs: 90_000, maxRetries: 0 },
  );
}

// ── Messages ──────────────────────────────────────────────────────────────────
export async function getMessage(token: string, messageId: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/unibox/messages/${messageId}`), {
    headers: authHeaders(token),
  });
}

// ── History import ────────────────────────────────────────────────────────────
// The route runs up to its 300s maxDuration (soft deadline 280s). Idempotent,
// but a client-side retry after a timeout would just start a second long pass
// racing the first, so don't retry: the caller re-invokes on partial:true.
export async function syncUnibox(token: string, accountId?: string): Promise<Response> {
  return fetchWithRetry(
    apiUrl(`/api/v1/unibox/sync`),
    {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(accountId ? { accountId } : {}),
    },
    { timeoutMs: 295_000, maxRetries: 0 },
  );
}

export async function getSyncProgress(token: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/unibox/sync/progress`), { headers: authHeaders(token) });
}

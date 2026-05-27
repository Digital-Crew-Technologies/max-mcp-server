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

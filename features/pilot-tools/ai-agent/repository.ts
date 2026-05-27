import { apiUrl, authHeaders, fetchWithRetry } from "../shared";

export async function generateWorkflow(token: string, body: Record<string, unknown>): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/ai-agent/generate-workflow`), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

export async function generateMessagePreview(token: string, body: Record<string, unknown>): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/ai-agent/generate-message-preview`), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

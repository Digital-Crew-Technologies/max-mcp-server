import { apiUrl, authHeaders, fetchWithRetry } from "../shared";

// One billed LLM completion that max-agent allows up to 120 s ("its model call
// alone may take 90 seconds"): a single attempt that waits for it.
const GENERATE_WORKFLOW_CONFIG = { timeoutMs: 130_000, maxRetries: 0 };

export async function generateWorkflow(token: string, body: Record<string, unknown>): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/ai-agent/generate-workflow`), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  }, GENERATE_WORKFLOW_CONFIG);
}

export async function generateMessagePreview(token: string, body: Record<string, unknown>): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/ai-agent/generate-message-preview`), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

// One billed LLM completion: a retry would bill twice, so no retries.
const SUGGEST_IDEAS_CONFIG = { timeoutMs: 60_000, maxRetries: 0 };

export async function suggestCampaignIdeas(token: string, body: Record<string, unknown>): Promise<Response> {
  return fetchWithRetry(
    apiUrl(`/api/v1/ai-agent/suggest-campaign-ideas`),
    {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(body),
    },
    SUGGEST_IDEAS_CONFIG,
  );
}

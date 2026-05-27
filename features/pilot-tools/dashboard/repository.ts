import { apiUrl, authHeaders, fetchWithRetry } from "../shared";

export async function getDashboardKpis(token: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/dashboard/kpis`), { headers: authHeaders(token) });
}

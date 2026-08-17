import { apiUrl, authHeaders, buildQuery, fetchWithRetry } from "../shared";

/**
 * GET /api/v1/data-quality/duplicates?entity_type=prospect|organization —
 * the workspace's PENDING duplicate pairs, each with a summary of both
 * records (name, email/domain, title/industry) so a caller can judge the
 * pair without extra reads.
 *
 * 200 → { data: DuplicateCandidate[], counts: { prospect, organization } }
 */
export async function listDuplicates(
  token: string,
  entityType?: string,
): Promise<Response> {
  const qs = buildQuery({ entity_type: entityType });
  return fetchWithRetry(apiUrl(`/api/v1/data-quality/duplicates${qs}`), {
    headers: authHeaders(token),
  });
}

/**
 * POST /api/v1/data-quality/duplicates/scan — on-demand exact-key rescan of
 * the whole workspace (provider ids → LinkedIn URL → email for prospects;
 * domain for organizations). Idempotent: a known pair is refreshed, not
 * duplicated; a pair already dismissed or merged stays that way.
 *
 * 200 → { data: { …per-entity found/inserted counts } }
 */
export async function scanDuplicates(token: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/data-quality/duplicates/scan`), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({}),
  });
}

/**
 * PATCH /api/v1/data-quality/duplicates/:id — mark one pair "not a
 * duplicate". A dismissed pair stays dismissed across rescans.
 *
 * 200 → { success: true } | 404 pair not found.
 */
export async function dismissDuplicate(
  token: string,
  id: string,
): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/data-quality/duplicates/${id}`), {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify({ status: "dismissed" }),
  });
}

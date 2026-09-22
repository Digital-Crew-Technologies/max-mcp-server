import { apiUrl, authHeaders, buildQuery, fetchWithRetry } from "../shared";

// All enrichment calls go through max-agent's /api/v1/enrichment/* routes. That
// layer holds the Claire X-Service-Secret + X-On-Behalf-Of pair and enforces
// the per-workspace daily quota, so the MCP server only needs the user's
// standard bearer token — same auth model as prospects, Claire, Explorium, etc.
//
// enrich_prospect / enrich_organization are SYNCHRONOUS on max-agent (it submits
// the Claire job and polls up to ~180s before responding), so fetchWithRetry's
// timeout window must accommodate that — bulk/status/credits are fast.

const ENRICH_TIMEOUT_MS = 290_000;

// Single-enrich is a synchronous, billable Claire call. Disable retries so a
// transient blip never triggers a second deep-research run (and double spend);
// max-agent's claimForRun CAS would return 'busy' anyway, but not retrying is
// the cleaner guarantee. The long timeout covers Claire's polling window.
const ENRICH_CONFIG = { timeoutMs: ENRICH_TIMEOUT_MS, maxRetries: 0 };

export async function enrichProspect(
  token: string,
  id: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(
    apiUrl(`/api/v1/enrichment/prospect/${id}`),
    {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(body),
    },
    ENRICH_CONFIG,
  );
}

export async function enrichOrganization(
  token: string,
  id: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(
    apiUrl(`/api/v1/enrichment/organization/${id}`),
    {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(body),
    },
    ENRICH_CONFIG,
  );
}

export async function bulkEnrich(
  token: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/enrichment/bulk`), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

export async function getEnrichmentStatus(
  token: string,
  params: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(
    apiUrl(`/api/v1/enrichment/status${buildQuery(params)}`),
    { headers: authHeaders(token) },
  );
}

export async function getEnrichmentCredits(token: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/enrichment/credits`), {
    headers: authHeaders(token),
  });
}

// ── Contact enrichment + email verification (supplier waterfall) ────────────
// POST /contact-enrichment/enrich and /email-verification/verify page through
// whole lists and submit several provider batches (maxDuration=300 upstream),
// and both charge credits — long timeout, NO retries (a retry could double-bill).

const CONTACT_RUN_CONFIG = { timeoutMs: ENRICH_TIMEOUT_MS, maxRetries: 0 };

// Preview is read-only (spends nothing) but pages through a whole list
// (maxDuration=60 upstream), so it only needs a longer timeout.
const PREVIEW_CONFIG = { timeoutMs: 60_000 };

export async function enrichContactDetails(
  token: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(
    apiUrl(`/api/v1/contact-enrichment/enrich`),
    {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(body),
    },
    CONTACT_RUN_CONFIG,
  );
}

export async function getContactEnrichmentJob(
  token: string,
  jobId: string,
): Promise<Response> {
  return fetchWithRetry(
    apiUrl(`/api/v1/contact-enrichment/jobs/${encodeURIComponent(jobId)}`),
    { headers: authHeaders(token) },
  );
}

export async function verifyEmails(
  token: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(
    apiUrl(`/api/v1/email-verification/verify`),
    {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(body),
    },
    CONTACT_RUN_CONFIG,
  );
}

export async function getEmailVerificationJob(
  token: string,
  jobId: string,
): Promise<Response> {
  return fetchWithRetry(
    apiUrl(`/api/v1/email-verification/jobs/${encodeURIComponent(jobId)}`),
    { headers: authHeaders(token) },
  );
}

export async function previewEnrichment(
  token: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(
    apiUrl(`/api/v1/enrichment/preview`),
    {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(body),
    },
    PREVIEW_CONFIG,
  );
}

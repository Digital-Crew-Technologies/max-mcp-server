import { callApi, strip, toolHints, type McpServer } from "../shared";
import * as repo from "./repository";
import * as S from "./schema";
import { toPublishableShape } from "../mcp/publishable-schema";

// Auto-Enrichment (feature #5): let the agent enrich a prospect or organization
// with Claire deep-research, writing the result back onto the record. A
// per-workspace daily quota gates spend (max-agent returns 429 when exhausted),
// and bulk enrichment is queued for the cron worker rather than run inline.
// All tools proxy max-agent's /api/v1/enrichment/* routes with the user's
// standard bearer token.

export function registerEnrichmentTools(server: McpServer): void {
  server.registerTool(
    "enrich_prospect",
    {
      title: "Enrich a prospect with Claire research",
      description:
        "Run Claire deep-research on a prospect and save the result onto the record. SYNCHRONOUS — waits for Claire (may take 30-180s) and returns {status} ('complete' with the research, 'skipped' if the prospect has no name, or 'busy' if another enrichment is already running). Counts against the workspace's daily enrichment quota; returns a 429 quota error when exhausted. Set force=true to re-enrich an already-complete record. Call this BEFORE crafting personalized outreach.",
      inputSchema: S.enrichProspectSchema,
    },
    async (input) =>
      callApi(input.bearer_token, (t) =>
        repo.enrichProspect(
          t,
          input.prospect_id,
          strip(input, "bearer_token", "prospect_id"),
        ),
      ),
  );

  server.registerTool(
    "enrich_organization",
    {
      title: "Enrich an organization with Claire research",
      description:
        "Run Claire deep-research on an organization and save the result onto the record. SYNCHRONOUS — waits for Claire (may take 30-180s) and returns {status} ('complete' with the research, 'skipped' if the org has no name, or 'busy' if another enrichment is already running). Counts against the workspace's daily enrichment quota; returns a 429 quota error when exhausted. Set force=true to re-enrich an already-complete record.",
      inputSchema: S.enrichOrganizationSchema,
    },
    async (input) =>
      callApi(input.bearer_token, (t) =>
        repo.enrichOrganization(
          t,
          input.organization_id,
          strip(input, "bearer_token", "organization_id"),
        ),
      ),
  );

  server.registerTool(
    "bulk_enrich",
    {
      title: "Queue bulk enrichment",
      description:
        "Queue many prospects and/or organizations for background enrichment by the cron worker (does NOT run inline). Provide prospect_ids and/or organization_ids. Returns {accepted} — how many rows were queued. Use this instead of calling enrich_prospect in a loop when enriching more than a couple of records.",
      inputSchema: toPublishableShape(S.bulkEnrichSchema) ?? {},
    },
    async (input) =>
      callApi(input.bearer_token, (t) =>
        repo.bulkEnrich(t, strip(input, "bearer_token")),
      ),
  );

  server.registerTool(
    "get_enrichment_status",
    {
      title: "Get enrichment status",
      description:
        "Check the enrichment state of a single prospect or organization. Provide exactly one of prospect_id or organization_id. Returns {enrichment_status, enrichment_updated_at, has_research}.",
      inputSchema: toPublishableShape(S.getEnrichmentStatusSchema) ?? {},
    },
    async (input) =>
      callApi(input.bearer_token, (t) =>
        repo.getEnrichmentStatus(t, strip(input, "bearer_token")),
      ),
  );

  server.registerTool(
    "get_enrichment_credits",
    {
      title: "Get daily enrichment quota",
      description:
        "Return the workspace's daily enrichment quota usage: {cap, used_today, remaining}. Check this before a large bulk enrichment to confirm there's headroom.",
      inputSchema: S.getEnrichmentCreditsSchema,
    },
    async (input) =>
      callApi(input.bearer_token, (t) => repo.getEnrichmentCredits(t)),
  );

  // ── Contact details (email/phone/LinkedIn) + email verification ──────────
  // Separate from Claire research above: these run the paid supplier waterfall
  // (FullEnrich / Explorium / Bouncer) asynchronously and write results back
  // onto the prospects. Both runs charge credits; preview_enrichment is free.

  server.registerTool(
    "enrich_contact_details",
    {
      title: "Enrich contact details (email/phone)",
      description:
        "Find emails/phones (optionally LinkedIn URLs) for prospect_ids or a whole list_id via FullEnrich (default) or Explorium; results are written onto the prospects. CHARGES CREDITS (402 if insufficient) — run preview_enrichment first for the cost. Async: returns 202 {job_id, job_ids, status, total}; poll get_contact_enrichment_job.",
      inputSchema: S.enrichContactDetailsSchema,
    },
    async (input) =>
      callApi(input.bearer_token, (t) =>
        repo.enrichContactDetails(t, strip(input, "bearer_token")),
      ),
  );

  server.registerTool(
    "get_contact_enrichment_job",
    {
      title: "Get contact enrichment job",
      description:
        "Status of a contact-enrichment job: {job_id, status (pending|processing|completed|failed), total, enriched_count, error_message}. Poll until completed or failed, then re-read the prospects.",
      inputSchema: S.getContactEnrichmentJobSchema,
      ...toolHints.readOnly,
    },
    async (input) =>
      callApi(input.bearer_token, (t) =>
        repo.getContactEnrichmentJob(t, input.job_id),
      ),
  );

  server.registerTool(
    "verify_emails",
    {
      title: "Verify prospect emails",
      description:
        "Queue email verification (Bouncer) for prospect_ids or a whole list_id. CHARGES CREDITS (402 if insufficient). Async: returns 202 {job_id, job_ids, total}; a cron writes deliverable/risky/undeliverable/unknown onto each prospect's email_verification_status within ~5 min — poll get_email_verification_job.",
      inputSchema: S.verifyEmailsSchema,
    },
    async (input) =>
      callApi(input.bearer_token, (t) =>
        repo.verifyEmails(t, strip(input, "bearer_token")),
      ),
  );

  server.registerTool(
    "get_email_verification_job",
    {
      title: "Get email verification job",
      description:
        "Status of an email-verification job: {job_id, status (pending|processing|completed|failed), total, error_message}. Poll until completed, then read verdicts from the prospects.",
      inputSchema: S.getEmailVerificationJobSchema,
      ...toolHints.readOnly,
    },
    async (input) =>
      callApi(input.bearer_token, (t) =>
        repo.getEmailVerificationJob(t, input.job_id),
      ),
  );

  server.registerTool(
    "preview_enrichment",
    {
      title: "Preview enrichment cost",
      description:
        "Free, read-only estimate for enrich_contact_details / verify_emails over prospect_ids or a list_id. Returns {coverage (with_email, with_phone, missing_contact, unverified_email...), providers [{provider, eligible, skipped, estimated_credits, available}], balance}.",
      inputSchema: S.previewEnrichmentSchema,
      ...toolHints.readOnly,
    },
    async (input) =>
      callApi(input.bearer_token, (t) =>
        repo.previewEnrichment(t, strip(input, "bearer_token")),
      ),
  );
}

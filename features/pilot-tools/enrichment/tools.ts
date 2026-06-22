import { callApi, strip, type McpServer } from "../shared";
import * as repo from "./repository";
import * as S from "./schema";

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
      inputSchema: S.bulkEnrichSchema,
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
      inputSchema: S.getEnrichmentStatusSchema,
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
}

import { callApi, strip, type McpServer } from "../shared";
import * as repo from "./repository";
import * as S from "./schema";

// Claire is Max's research-and-intelligence layer. These tools give the chat
// agent the same Claire access onboarding already has — via max-agent's
// /api/v1/claire/* proxy, which forwards to claire-api with the
// X-Service-Secret + X-On-Behalf-Of pair. No per-user Claire token needed;
// Max vouches for the user. Calls are synchronous from the tool's POV —
// max-agent handles the Claire job submit + poll internally.

export function registerClaireTools(server: McpServer): void {
  server.registerTool(
    "claire_search",
    {
      title: "Run a Claire research search",
      description:
        "Free-text research query against Claire's hub. Use for quick lookups like industry trends, funding news, or any topic where you'd otherwise google. Synchronous — waits for Claire to finish and returns the result. Use mode='lite' for fast first-pass (default), 'full' for deeper multi-source.",
      inputSchema: S.claireSearchSchema,
    },
    async (input) =>
      callApi(input.bearer_token, (t) =>
        repo.claireSearch(t, strip(input, "bearer_token")),
      ),
  );

  server.registerTool(
    "claire_deep_research",
    {
      title: "Deep research on a person or company",
      description:
        "Multi-source background research on a named person or company. Returns recent activity, news, role context, company highlights, and proof points. Synchronous (may take 30-90s). Call this BEFORE crafting personalized outreach so the message reflects who the prospect actually is.",
      inputSchema: S.claireDeepResearchSchema,
    },
    async (input) =>
      callApi(input.bearer_token, (t) =>
        repo.claireDeepResearch(t, strip(input, "bearer_token")),
      ),
  );

  server.registerTool(
    "claire_market_watch",
    {
      title: "Monitor a URL for market signals",
      description:
        "Run a market-watch pass on a URL, optionally filtered by criteria (e.g. 'pricing', 'hiring', 'funding'). Returns a snapshot of detected signals. Use to inform outreach timing (e.g. just-funded companies) or to spot competitive moves.",
      inputSchema: S.claireMarketWatchSchema,
    },
    async (input) =>
      callApi(input.bearer_token, (t) =>
        repo.claireMarketWatch(t, strip(input, "bearer_token")),
      ),
  );

  server.registerTool(
    "claire_find_competitors",
    {
      title: "Find competitors via Claire",
      description:
        "Identify direct competitors of a company by URL. Returns a list of competing companies with descriptions and sources. Synchronous (typically 1-3 min). Use to expand a prospect list with similar companies or to ground competitive positioning in outreach.",
      inputSchema: S.claireCompetitorFinderSchema,
    },
    async (input) =>
      callApi(input.bearer_token, (t) =>
        repo.claireCompetitorFinder(t, strip(input, "bearer_token")),
      ),
  );

  server.registerTool(
    "claire_extract_prospects_from_url",
    {
      title: "Extract prospects from a URL via Claire",
      description:
        "Fetch a public URL (conference attendee list, team / about page, press release, panel announcement, etc.) and extract structured prospects (people / contacts) from it via Claire. Returns { prospects:[{ name, title, company, linkedin_url?, email?, ... }], source_url, extracted_count, claire_request_id? }. Use when the user pastes a URL and asks to 'find leads here' / 'build a list from this page'. Pair with create_prospect or import_prospect_list_csv to persist the result.",
      inputSchema: S.claireExtractProspectsFromUrlSchema,
    },
    async (input) =>
      callApi(input.bearer_token, (t) =>
        repo.claireExtractProspects(t, strip(input, "bearer_token")),
      ),
  );
}

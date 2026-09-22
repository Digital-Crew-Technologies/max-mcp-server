import type { McpServer } from "../shared";
import { registerAsGroup } from "./group-adapter";
import { registerCampaignTools } from "../campaigns/tools";
import { registerProspectTools } from "../prospects/tools";
import { registerProspectListTools } from "../prospect-lists/tools";
import { registerOrganizationTools } from "../organizations/tools";
import { registerAccountTools } from "../accounts/tools";
import { registerUniboxTools } from "../unibox/tools";
import { registerAiAgentTools } from "../ai-agent/tools";
import { registerGetleadsTools } from "../getleads/tools";
import { registerExploriumTools } from "../explorium/tools";
import { registerApolloTools } from "../apollo/tools";
import {
  registerAutoProspectSourcingTools,
  registerOrganizationSearchTools,
} from "../sourcing/tools";
import { registerClaireTools } from "../claire/tools";
import { registerEnrichmentTools } from "../enrichment/tools";
import { registerIntentTools } from "../intent/tools";
import { registerInboxTools } from "../inbox/tools";
import { registerCrmTools } from "../crm/tools";
import { registerCalendarTools } from "../calendar/tools";
import { registerMeetingTools } from "../meetings/tools";
import { registerTaskTools } from "../tasks/tools";
import { registerEmailAnalyticsTools } from "../email-analytics/tools";
import { registerCrmLeadDispatchTools } from "../crm/lead-dispatch";
import { registerCrmComposerTools } from "../crm/composers";
import { registerCrmForecastTools } from "../crm/forecast";
import { registerNotionTools } from "../notion/tools";
import { registerNotionComposerTools } from "../notion/composers";
import { registerAgentDraftTools } from "../agent-drafts/tools";
import {
  registerLinkedinTools,
  registerLinkedinToolsGrouped,
} from "../linkedin/tools";
import { registerDashboardTools } from "../dashboard/tools";
import { registerIcpTools } from "../icp/tools";
import { registerDeliverabilityTools } from "../deliverability/tools";
import { registerSocialTools } from "../social/tools";
import { registerDealTools } from "../deals/tools";
import { registerPipelineTools } from "../pipeline/tools";
import { registerAutomationTools } from "../automations/tools";
import { registerPipelineWebhookTools } from "../pipeline-webhooks/tools";
import { registerViewTools } from "../views/tools";
import { registerWorkspaceAdminTools } from "../workspace-admin/tools";
import { registerAdminTools } from "../admin/tools";
import { registerWebhookTools } from "../webhooks/tools";

/**
 * Tool registration entry point.
 *
 * ── WHY GROUPED IS THE DEFAULT ────────────────────────────────────────────
 * The flat catalog does not fit in the client's request. max-agent caps the
 * merged tool catalog at 128 entries (OpenAI's hard limit, used as the floor
 * every provider accepts — src/features/agent/utils/model-tool-cap.ts) and
 * reserves 6 slots for its own local tools, leaving 122 for MCP. Flat mode
 * registers 154 tools in the default configuration, so **30 are silently
 * dropped on every turn** — and because the cap tiers by name (`_` in the name
 * = flat = droppable) and then by registration order, the tools that go are
 * whatever registers last. That was all 19 `linkedin_*` tools, all 5
 * `notion_*`, all 3 `agent_draft_*`, 2 `crm_*` and `get_dashboard_kpis` —
 * while max-agent's own system prompt still instructed the model to call
 * `get_profile` / `find_profile`, tools that were not in the catalog.
 *
 * Grouping is therefore not an optimization, it is the fix: a grouped domain
 * tool has no underscore in its name, so it sorts to tier 0 and survives the
 * cap. `test/contract/tool-inventory.test.ts` now fails the build if the
 * default catalog would not fit.
 *
 * ── MODES (env `GROUPED_TOOLS`) ───────────────────────────────────────────
 *   unset | "true" | "all"  → group every domain (DEFAULT, fits the cap)
 *   "linkedin"              → legacy: group LinkedIn only, rest flat
 *   "false" | "off"         → fully flat. Does NOT fit the cap; kept as an
 *                             escape hatch and for the contract test that
 *                             proves the cliff is real.
 *
 * ── BREAKING CHANGE FOR MCP CLIENTS ───────────────────────────────────────
 * Under the default, `list_chats` is now `unibox` with `action: "list_chats"`.
 * Real MCP clients re-list tools per session and adapt automatically; only
 * hand-written prompts that name a tool need updating. `GROUPED_TOOLS=false`
 * restores the old names.
 */

type ToolMode = "grouped" | "linkedin-only" | "flat";

export function resolveToolMode(
  raw: string | undefined = process.env.GROUPED_TOOLS,
): ToolMode {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "" || v === "true" || v === "all") return "grouped";
  if (v === "linkedin") return "linkedin-only";
  if (v === "false" || v === "off") return "flat";
  // An unrecognized value must not silently fall back to the mode that
  // overflows the client's cap — default to the safe one and say so.
  console.warn(
    `[mcp] Unrecognized GROUPED_TOOLS="${raw}". Expected one of: ` +
      `all | linkedin | false. Defaulting to "all".`,
  );
  return "grouped";
}

/**
 * One entry per grouped domain. `name` becomes the MCP tool name and MUST NOT
 * contain an underscore (see registerAsGroup). `register` may call several
 * flat registrars — that is how the four CRM registrars and the two Notion
 * registrars collapse into one tool each.
 */
type GroupDef = {
  name: string;
  blurb: string;
  register: (server: McpServer) => void;
};

const GROUPS: GroupDef[] = [
  {
    name: "campaigns",
    blurb:
      "Outreach campaigns: create, configure, duplicate and run multi-step sequences; lifecycle (launch/pause/resume/stop/archive/restore) and launch preflight; audience (lists and people: add/remove/sync); A/B tests; stats, activity feed, conversations and per-campaign memory; reusable sending schedules; public share links.",
    register: registerCampaignTools,
  },
  {
    name: "prospects",
    blurb:
      "Individual people in the workspace: list, read, create, update, delete, bulk import/delete; per-prospect campaigns, activity, qualification, profile hooks, Claire enrichment and intelligence watchers; public share links; and a global workspace search.",
    register: registerProspectTools,
  },
  {
    name: "lists",
    blurb:
      "Prospect lists: find new leads into a list (auto_create_prospect_list: GetLeads first, Explorium fallback; or a LinkedIn search), create and manage lists, add/remove members, list member ids and organizations, search, CSV import, public share links, and wait for an in-progress list build to finish.",
    register: (s) => {
      registerProspectListTools(s);
      registerAutoProspectSourcingTools(s);
    },
  },
  {
    name: "organizations",
    blurb:
      "Companies in the workspace: list, read, create, update, delete, bulk import/delete, geographic stats and map points, public share links, and search for new companies (GetLeads first, Explorium fallback).",
    register: (s) => {
      registerOrganizationTools(s);
      registerOrganizationSearchTools(s);
    },
  },
  // ── Sourcing providers, in the order to try them ────────────────────────
  // GetLeads → Explorium → Apollo. The order is cost-driven (GetLeads is ~100×
  // cheaper than Explorium) and matches max-agent's managed chain
  // (AUTO_PROVIDER_ORDER). Keep these three adjacent and in this order: the
  // catalog order is what the model reads, and it is the tie-breaker when a
  // client caps the catalog.
  {
    name: "getleads",
    blurb:
      "GetLeads data supplier — the FIRST choice for sourcing new people (cheapest; billed per contact returned): build a people list from job titles, seniority, countries, industries or company domains, and add more people to it. Fall back to explorium only for filters GetLeads lacks or when it finds nothing.",
    register: registerGetleadsTools,
  },
  {
    name: "explorium",
    blurb:
      "Explorium data supplier — the SECOND choice, after getleads: richer filters (buyer intent, departments, revenue, tech stack, enrichments) at a much higher cost. Build a people list, add more people to it, and build a company list.",
    register: registerExploriumTools,
  },
  {
    name: "apollo",
    blurb:
      "Apollo data supplier — the LAST resort, after getleads and explorium: create a people list and add more people to an existing one.",
    register: registerApolloTools,
  },
  {
    name: "icp",
    blurb:
      "Ideal Customer Profiles: list, read, create, update, archive/delete ICPs; link them to deals, companies and prospects; reverse lookup; and draft one with Max (costs credits).",
    register: registerIcpTools,
  },
  {
    name: "accounts",
    blurb:
      "Connected sending accounts (email + LinkedIn via Unipile): list, read, update, disconnect, read and set per-account rate limits, mint a hosted auth link to connect a new one, run a Unipile account sync, and list which workspaces an account is shared with.",
    register: registerAccountTools,
  },
  {
    name: "deliverability",
    blurb:
      "Email deliverability and done-for-you mailboxes: inbox placement checks and warm-up health; email warm-up (list, price, settings, cancel, sync); Mailpool domains and orders (search, price, list, sync). Buying warm-up or mailboxes is only exposed when the deployment sets ENABLE_PURCHASE_TOOLS=true.",
    register: registerDeliverabilityTools,
  },
  {
    name: "unibox",
    blurb:
      "Unified inbox: list and read LinkedIn + email conversations, update or archive a chat, read and send messages, send a new email; per-account channels and history-import (sync) rules, run and track a history sync, read one full message, and AI reply suggestions (costs 1 credit).",
    register: registerUniboxTools,
  },
  {
    name: "social",
    blurb:
      "Act as a specific connected LinkedIn or Instagram account (account_id): invitations (send, list, withdraw, accept/decline), connection status, follow, endorse a skill, InMail and InMail balance, posts (list, read, react, comment, publish, list comments/reactions). Writes are public.",
    register: registerSocialTools,
  },
  {
    name: "inbox",
    blurb:
      "Inbox autopilot: read and set the autopilot configuration, list AI-drafted replies, and approve or reject a draft. Autopilot never auto-sends — a human approves every reply.",
    register: registerInboxTools,
  },
  {
    name: "intent",
    blurb:
      "Buying-intent monitoring: create and manage signal triggers (one at a time or in bulk from a list or companies), attach campaigns to triggers, read fired signals, and review, approve, reject or modify the outreach proposals they generate.",
    register: registerIntentTools,
  },
  {
    name: "enrichment",
    blurb:
      "Contact and company enrichment: Claire research on one prospect/organization or in bulk; paid email/phone/LinkedIn lookup and email verification (async jobs — poll status), a free cost preview, status and remaining quota.",
    register: registerEnrichmentTools,
  },
  {
    name: "calendar",
    blurb:
      "Scheduling: Cal.com booking (connect, availability, propose times, book, booking link, list meetings, confirm/decline/reschedule/cancel/cancel-series, no-show attendance) plus synced Google/Outlook calendars (list/disconnect accounts, sync now, create/update/delete events, team free/busy).",
    register: registerCalendarTools,
  },
  {
    name: "crm",
    blurb:
      "HubSpot CRM: contacts and companies (search, read, upsert), deals, pipelines, owners and activities; plus prospect scoring, assignment, CSV export/import, pipeline risk scanning, forecast-change detection and the weekly brief composer.",
    register: (s) => {
      registerCrmTools(s);
      registerCrmLeadDispatchTools(s);
      registerCrmComposerTools(s);
      registerCrmForecastTools(s);
    },
  },
  {
    name: "deals",
    blurb:
      "Max's native sales pipeline (not HubSpot — that is crm): deals CRUD, move/win/lose, contacts, stage history, board totals; pipelines, stages and stage entry-automation rules; deal attachment metadata; products/services catalog, catalog fields and deal line items; read-only sales-workspace map.",
    register: registerDealTools,
  },
  {
    name: "pipeline",
    blurb:
      "Prospect pipelines: funnels and their columns, on-enter stage rules (enroll/assign/notify/move/create deal/set field), pipeline links and auto-move handoffs, campaign outcome routes, the journey canvas and per-prospect journey, and reviewed Production change sets (draft → ready → publish, rollback).",
    register: registerPipelineTools,
  },
  {
    name: "automations",
    blurb:
      "Automation workflows (trigger → action/filter/delay steps): list, read, create, edit the draft, activate/pause/resume, run once now, and inspect or cancel runs. Activation and runs execute real actions.",
    register: registerAutomationTools,
  },
  {
    name: "webhooks",
    blurb:
      "Inbound lead-capture webhooks: create and configure endpoints that turn posted JSON into prospects, route them to pipeline columns by filter, test payloads, read and replay the delivery log, and rotate credentials.",
    register: registerPipelineWebhookTools,
  },
  {
    name: "notion",
    blurb:
      "Notion workspace: search pages, read a page, create a page, append blocks, and publish the weekly brief.",
    register: (s) => {
      registerNotionTools(s);
      registerNotionComposerTools(s);
    },
  },
  {
    name: "claire",
    blurb:
      "Claire market research: web search, deep research, market watch, competitor finding, prospect extraction from a URL, and single-person enrichment. Several of these cost credits per call.",
    register: registerClaireTools,
  },
  {
    name: "analytics",
    blurb:
      "Reporting: email tracking events, per-prospect engagement timeline, link-click detail, campaign engagement summary, workspace overview, conversation intelligence, 360° analytics for one person or organization, and workspace dashboard KPIs.",
    register: (s) => {
      registerEmailAnalyticsTools(s);
      registerDashboardTools(s);
    },
  },
  {
    name: "drafts",
    blurb:
      "Agent action drafts — the propose/approve queue. Create a draft for a human to review, list drafts, and read one.",
    register: registerAgentDraftTools,
  },
  {
    name: "generate",
    blurb:
      "AI generation helpers: generate a campaign workflow from a brief, preview a generated message for a prospect, and suggest campaign ideas for an audience.",
    register: registerAiAgentTools,
  },
  {
    name: "views",
    blurb:
      "Saved list views: named filter/sort/column presets per surface (prospects, organizations, campaigns, accounts, prospect-lists, pipeline, deals) — list, read, create, update, delete.",
    register: registerViewTools,
  },
  {
    name: "workspace",
    blurb:
      "Workspace settings and admin reads: custom-field definitions, BYO data suppliers, duplicate detection, agent config, members/roles/crew rates/digital workers, wallet balances and spend, Max chat history, and generating workspace intel (costs credits).",
    register: registerWorkspaceAdminTools,
  },
];

/** Register every domain flat — the pre-grouping catalog. */
function registerAllFlat(server: McpServer): void {
  for (const g of GROUPS) g.register(server);
  registerLinkedinTools(server);
}

export function registerPilotMcpTools(server: McpServer): void {
  const mode = resolveToolMode();

  if (mode === "flat") {
    registerAllFlat(server);
  } else if (mode === "linkedin-only") {
    for (const g of GROUPS) g.register(server);
    registerLinkedinToolsGrouped(server);
  } else {
    for (const g of GROUPS) {
      registerAsGroup(server, g.name, g.blurb, g.register);
    }
    // LinkedIn keeps its own hand-written grouped registrar rather than going
    // through the adapter: its actions are short names (`get_profile`, not
    // `linkedin_get_profile`) and max-agent's LinkedIn fast path calls
    // `linkedin` with `action: "get_profile"` literally
    // (src/features/agent/utils/linkedin-chat-orchestration.ts). Routing it
    // through the adapter would rename those actions and break that path.
    registerLinkedinToolsGrouped(server);
  }

  // Meeting hub + shared task system are grouped in their own registrars in
  // every mode — they were written that way from the start, so there is no
  // flat back-compat name to preserve.
  registerMeetingTools(server);
  registerTaskTools(server);

  if (process.env.ENABLE_ADMIN_TOOLS === "true") {
    if (mode === "flat") registerAdminTools(server);
    else
      registerAsGroup(
        server,
        "admin",
        "Operational diagnostics (admin gateway key required): list and clear dead-lettered failed requests, and read circuit-breaker status.",
        registerAdminTools,
      );
  }
  if (process.env.ENABLE_WEBHOOK_SIMULATORS === "true") {
    if (mode === "flat") registerWebhookTools(server);
    else
      registerAsGroup(
        server,
        "simulators",
        "Test-only webhook simulators: replay Unipile account, email and LinkedIn events against this workspace.",
        registerWebhookTools,
      );
  }
}

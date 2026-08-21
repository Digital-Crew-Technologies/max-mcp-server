import type { McpServer } from "../shared";
import { registerAsGroup } from "./group-adapter";
import { registerCampaignTools } from "../campaigns/tools";
import { registerProspectTools } from "../prospects/tools";
import { registerProspectListTools } from "../prospect-lists/tools";
import { registerOrganizationTools } from "../organizations/tools";
import { registerAccountTools } from "../accounts/tools";
import { registerUniboxTools } from "../unibox/tools";
import { registerAiAgentTools } from "../ai-agent/tools";
import { registerApolloTools } from "../apollo/tools";
import { registerExploriumTools } from "../explorium/tools";
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
      "Outreach campaigns: create, configure and run multi-step sequences; lifecycle (launch/pause/resume/stop/archive/restore); stats and per-campaign memory; reusable sending schedules.",
    register: registerCampaignTools,
  },
  {
    name: "prospects",
    blurb:
      "Individual people in the workspace: list, read, create, update, delete, bulk import/delete, and per-prospect campaign activity.",
    register: registerProspectTools,
  },
  {
    name: "lists",
    blurb:
      "Prospect lists: create and manage lists, add/remove members, search, CSV import, and wait for an in-progress list build to finish.",
    register: registerProspectListTools,
  },
  {
    name: "organizations",
    blurb:
      "Companies in the workspace: list, read, create, update, delete, and bulk import/delete.",
    register: registerOrganizationTools,
  },
  {
    name: "accounts",
    blurb:
      "Connected sending accounts (email + LinkedIn via Unipile): list, read, update, disconnect, read and set per-account rate limits, and mint a hosted auth link to connect a new one.",
    register: registerAccountTools,
  },
  {
    name: "unibox",
    blurb:
      "Unified inbox: list and read LinkedIn + email conversations, update or archive a chat, read and send messages, and send a new email.",
    register: registerUniboxTools,
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
      "Buying-intent monitoring: create and manage signal triggers, read fired signals, and review, approve, reject or modify the outreach proposals they generate.",
    register: registerIntentTools,
  },
  {
    name: "enrichment",
    blurb:
      "Contact and company enrichment: enrich one prospect or organization, run a bulk enrichment, and check job status and remaining credits.",
    register: registerEnrichmentTools,
  },
  {
    name: "calendar",
    blurb:
      "Meeting booking: connect a calendar, read availability, propose times, book or cancel a meeting, send a booking link, and list upcoming meetings.",
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
      "Reporting: email tracking events, per-prospect engagement timeline, link-click detail, campaign engagement summary, and workspace dashboard KPIs.",
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
      "AI generation helpers: generate a campaign workflow from a brief, and preview a generated message for a prospect.",
    register: registerAiAgentTools,
  },
  {
    name: "explorium",
    blurb:
      "Explorium data supplier: build a people list, add more people to an existing list, and build a company list.",
    register: registerExploriumTools,
  },
  {
    name: "apollo",
    blurb:
      "Apollo data supplier: create a people list and add more people to an existing one.",
    register: registerApolloTools,
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

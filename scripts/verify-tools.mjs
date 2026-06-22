#!/usr/bin/env node
/**
 * Verification script: connect to a running MCP server, list every tool,
 * and call the safe (read-only / listing) tools to confirm they reach the API.
 *
 * Usage:
 *   node scripts/verify-tools.mjs [ORIGIN] [BEARER_TOKEN]
 *
 *   ORIGIN        defaults to http://localhost:3000
 *   BEARER_TOKEN  if omitted, read tools are still listed but live calls are skipped
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const origin = process.argv[2] || process.env.MCP_ORIGIN || "http://localhost:3000";
const bearer = process.argv[3] || process.env.DIGITALCREW_BEARER_TOKEN || "";

const EXPECTED_TOOLS = [
  // workspace-profile
  "get_workspace_profile", "update_workspace_profile",
  // campaigns (14)
  "list_campaigns", "get_campaign", "create_campaign", "update_campaign", "delete_campaign",
  "launch_campaign", "pause_campaign", "resume_campaign", "stop_campaign",
  "archive_campaign", "restore_campaign",
  "get_campaign_stats", "get_campaign_lead_analytics", "get_campaign_node_run_counts",
  // prospects (8)
  "list_prospects", "get_prospect", "create_prospect", "update_prospect", "delete_prospect",
  "bulk_import_prospects", "bulk_delete_prospects", "get_prospect_campaign_activity",
  // prospect-lists (10)
  "list_prospect_lists", "get_prospect_list", "create_prospect_list", "update_prospect_list",
  "delete_prospect_list", "list_prospect_list_members", "add_prospects_to_list",
  "remove_prospects_from_list", "search_prospect_lists", "import_prospect_list_csv",
  "wait_for_prospect_list",
  // organizations (7)
  "list_organizations", "get_organization", "create_organization", "update_organization",
  "delete_organization", "bulk_import_organizations", "bulk_delete_organizations",
  // accounts (7)
  "list_accounts", "get_account", "update_account", "disconnect_account",
  "get_account_rate_limits", "update_account_rate_limit", "hosted_auth_link",
  // unibox (6)
  "list_chats", "get_chat", "update_chat", "archive_chat", "list_chat_messages", "send_chat_message",
  // ai-agent (2)
  "generate_workflow", "generate_message_preview",
  // apollo (2)
  "apollo_create_list", "apollo_add_more",
  // explorium (3)
  "explorium_create_list", "explorium_create_company_list", "explorium_add_more",
  // dashboard (1)
  "get_dashboard_kpis",
  // admin (3)
  "list_failed_requests", "clear_failed_requests", "get_circuit_status",
  // enrichment (5)
  "enrich_prospect", "enrich_organization", "bulk_enrich",
  "get_enrichment_status", "get_enrichment_credits",
  // email-analytics (4)
  "get_email_tracking_events", "get_prospect_engagement_timeline",
  "get_link_click_details", "get_campaign_engagement_summary",
];

// Safe read-only tools to live-call when a token is available
const LIVE_PROBE_TOOLS = [
  { name: "list_campaigns", args: { pageSize: 1 } },
  { name: "list_prospects", args: { pageSize: 1 } },
  { name: "list_prospect_lists", args: { pageSize: 1 } },
  { name: "list_organizations", args: { pageSize: 1 } },
  { name: "list_accounts", args: {} },
  { name: "list_chats", args: { pageSize: 1 } },
  { name: "get_dashboard_kpis", args: {} },
  { name: "get_workspace_profile", args: {} },
];

const c = {
  reset: "\x1b[0m", green: "\x1b[32m", red: "\x1b[31m",
  yellow: "\x1b[33m", cyan: "\x1b[36m", bold: "\x1b[1m",
};
const ok = (s) => `${c.green}✓${c.reset} ${s}`;
const fail = (s) => `${c.red}✗${c.reset} ${s}`;
const warn = (s) => `${c.yellow}!${c.reset} ${s}`;

async function main() {
  console.log(`${c.bold}MCP Verification${c.reset}`);
  console.log(`  origin: ${c.cyan}${origin}${c.reset}`);
  console.log(`  token:  ${bearer ? c.green + "set" : c.yellow + "not set (live calls skipped)"}${c.reset}`);
  console.log();

  const transport = new StreamableHTTPClientTransport(new URL(`${origin}/mcp`));
  const client = new Client(
    { name: "verify-tools", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );

  try {
    await client.connect(transport);
  } catch (e) {
    console.error(fail(`Failed to connect: ${e.message}`));
    console.error(`  Is the server running at ${origin}? Try: npm run dev`);
    process.exit(1);
  }
  console.log(ok("Connected"));

  // ── Tool inventory check ────────────────────────────────────────────────
  const { tools } = await client.listTools();
  const registered = new Set(tools.map((t) => t.name));
  console.log(`${ok(`Server registered ${registered.size} tools`)}`);

  const missing = EXPECTED_TOOLS.filter((t) => !registered.has(t));
  const extra = [...registered].filter((t) => !EXPECTED_TOOLS.includes(t));

  if (missing.length === 0) {
    console.log(ok(`All ${EXPECTED_TOOLS.length} expected tools are registered`));
  } else {
    console.log(fail(`${missing.length} expected tools missing:`));
    for (const t of missing) console.log(`    - ${t}`);
  }
  if (extra.length > 0) {
    console.log(warn(`${extra.length} unexpected tool(s) registered:`));
    for (const t of extra) console.log(`    + ${t}`);
  }

  // ── Schema sanity (every tool must have an inputSchema) ────────────────
  const noSchema = tools.filter((t) => !t.inputSchema);
  if (noSchema.length === 0) {
    console.log(ok("Every tool has an inputSchema"));
  } else {
    console.log(fail(`${noSchema.length} tools missing inputSchema:`));
    for (const t of noSchema) console.log(`    - ${t.name}`);
  }

  // ── Live probe of safe read tools ──────────────────────────────────────
  if (!bearer) {
    console.log(warn("Skipping live API probes (no bearer token)"));
    summarize(missing.length === 0 && noSchema.length === 0);
    return;
  }

  console.log(`\n${c.bold}Live API probes${c.reset}`);
  let pass = 0;
  let probeFail = 0;
  for (const probe of LIVE_PROBE_TOOLS) {
    if (!registered.has(probe.name)) {
      console.log(warn(`${probe.name} not registered, skipping`));
      continue;
    }
    try {
      const res = await client.callTool({
        name: probe.name,
        arguments: { ...probe.args, bearer_token: bearer },
      });
      const text = res.content?.[0]?.text ?? "";
      const isError = text.startsWith("API error") || text.startsWith("Error:");
      if (isError) {
        console.log(fail(`${probe.name}  →  ${text.slice(0, 120)}`));
        probeFail++;
      } else {
        console.log(ok(`${probe.name}  →  ${text.slice(0, 80).replace(/\s+/g, " ")}…`));
        pass++;
      }
    } catch (e) {
      console.log(fail(`${probe.name}  →  threw: ${e.message}`));
      probeFail++;
    }
  }

  console.log();
  console.log(`  ${pass} passed, ${probeFail} failed`);
  summarize(missing.length === 0 && noSchema.length === 0 && probeFail === 0);
}

function summarize(allOk) {
  console.log();
  if (allOk) {
    console.log(`${c.green}${c.bold}All verifications passed.${c.reset}`);
    process.exit(0);
  } else {
    console.log(`${c.red}${c.bold}Verification failed.${c.reset}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(fail(`Unexpected error: ${e.stack || e.message}`));
  process.exit(1);
});

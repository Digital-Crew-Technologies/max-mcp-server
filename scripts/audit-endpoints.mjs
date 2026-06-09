#!/usr/bin/env node
/**
 * Exhaustive per-tool audit. Calls every MCP tool once (or marks it as
 * intentionally skipped) and writes a markdown report at docs/TOOL_AUDIT.md.
 *
 * Skip categories:
 *   destructive — would change real account/workspace config
 *   sending     — would send real messages to real people
 *   billing     — would charge credits
 *   external    — generates real auth URLs / external side effects
 *   lifecycle   — covered by test-endpoints.mjs (create+cleanup pattern)
 *
 * Usage:
 *   node scripts/audit-endpoints.mjs ORIGIN BEARER_TOKEN
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const origin = process.argv[2] || "http://localhost:3000";
const bearer = process.argv[3] || process.env.DIGITALCREW_BEARER_TOKEN;
if (!bearer) {
  console.error("Bearer token required");
  process.exit(2);
}

const c = {
  reset: "\x1b[0m", green: "\x1b[32m", red: "\x1b[31m",
  yellow: "\x1b[33m", cyan: "\x1b[36m", dim: "\x1b[2m", bold: "\x1b[1m",
};

let client;

async function call(name, args = {}) {
  try {
    const res = await client.callTool({ name, arguments: { ...args, bearer_token: bearer } });
    const text = res.content?.[0]?.text ?? "";
    let parsed = null;
    try { parsed = JSON.parse(text); } catch { /* not JSON */ }
    const isError = text.startsWith("API error") || text.startsWith("Error:");
    const status = isError ? Number((text.match(/\((\d+)\)/) || [])[1]) || null : 200;
    return { text, parsed, isError, status };
  } catch (e) {
    return { text: e.message, parsed: null, isError: true, status: null };
  }
}

// ─── Tool catalog ────────────────────────────────────────────────────────────

const tools = [
  // ── Workspace Profile ──────────────────────────────────────────────────
  { name: "get_workspace_profile", category: "Workspace", action: "ctx => call('get_workspace_profile')" },
  { name: "update_workspace_profile", category: "Workspace", skip: "destructive", reason: "would overwrite real workspace settings" },

  // ── Campaigns ──────────────────────────────────────────────────────────
  { name: "list_campaigns", category: "Campaigns", action: "ctx => call('list_campaigns', { pageSize: 1 })", saves: "campaign" },
  { name: "get_campaign", category: "Campaigns", action: "ctx => call('get_campaign', { id: ctx.campaign?.id })", needs: "campaign" },
  { name: "get_campaign_stats", category: "Campaigns", action: "ctx => call('get_campaign_stats', { id: ctx.campaign?.id })", needs: "campaign" },
  { name: "get_campaign_lead_analytics", category: "Campaigns", action: "ctx => call('get_campaign_lead_analytics', { id: ctx.campaign?.id, pageSize: 1 })", needs: "campaign" },
  { name: "get_campaign_node_run_counts", category: "Campaigns", action: "ctx => call('get_campaign_node_run_counts', { id: ctx.campaign?.id })", needs: "campaign" },
  { name: "create_campaign", category: "Campaigns", skip: "lifecycle", reason: "see test-endpoints.mjs --include-launches" },
  { name: "update_campaign", category: "Campaigns", skip: "lifecycle", reason: "tested in test-endpoints.mjs lifecycle" },
  { name: "delete_campaign", category: "Campaigns", skip: "lifecycle", reason: "tested in test-endpoints.mjs lifecycle" },
  { name: "launch_campaign", category: "Campaigns", skip: "sending", reason: "would start real outreach; only run via --include-launches in test-endpoints" },
  { name: "pause_campaign", category: "Campaigns", skip: "lifecycle", reason: "state machine; tested in test-endpoints" },
  { name: "resume_campaign", category: "Campaigns", skip: "lifecycle", reason: "state machine; tested in test-endpoints" },
  { name: "stop_campaign", category: "Campaigns", skip: "lifecycle", reason: "state machine; tested in test-endpoints" },
  { name: "archive_campaign", category: "Campaigns", skip: "lifecycle", reason: "state machine; tested in test-endpoints" },
  { name: "restore_campaign", category: "Campaigns", skip: "lifecycle", reason: "state machine; tested in test-endpoints" },

  // ── Prospects ──────────────────────────────────────────────────────────
  { name: "list_prospects", category: "Prospects", action: "ctx => call('list_prospects', { pageSize: 1 })", saves: "prospect" },
  { name: "get_prospect", category: "Prospects", action: "ctx => call('get_prospect', { id: ctx.prospect?.id })", needs: "prospect" },
  { name: "get_prospect_campaign_activity", category: "Prospects", action: "ctx => call('get_prospect_campaign_activity', { id: ctx.prospect?.id })", needs: "prospect" },
  { name: "create_prospect", category: "Prospects", skip: "lifecycle", reason: "tested in test-endpoints.mjs lifecycle" },
  { name: "update_prospect", category: "Prospects", skip: "lifecycle", reason: "tested in test-endpoints.mjs lifecycle" },
  { name: "delete_prospect", category: "Prospects", skip: "lifecycle", reason: "tested in test-endpoints.mjs lifecycle" },
  { name: "bulk_import_prospects", category: "Prospects", skip: "lifecycle", reason: "tested in test-endpoints.mjs lifecycle" },
  { name: "bulk_delete_prospects", category: "Prospects", skip: "lifecycle", reason: "tested in test-endpoints.mjs lifecycle" },

  // ── Prospect Lists ─────────────────────────────────────────────────────
  { name: "list_prospect_lists", category: "Prospect Lists", action: "ctx => call('list_prospect_lists', { pageSize: 1 })", saves: "list" },
  { name: "get_prospect_list", category: "Prospect Lists", action: "ctx => call('get_prospect_list', { id: ctx.list?.id })", needs: "list" },
  { name: "list_prospect_list_members", category: "Prospect Lists", action: "ctx => call('list_prospect_list_members', { id: ctx.list?.id, pageSize: 1 })", needs: "list" },
  { name: "search_prospect_lists", category: "Prospect Lists", action: "ctx => call('search_prospect_lists', { search_config: {}, pageSize: 1 })" },
  { name: "create_prospect_list", category: "Prospect Lists", skip: "lifecycle", reason: "tested in test-endpoints.mjs lifecycle" },
  { name: "update_prospect_list", category: "Prospect Lists", skip: "lifecycle", reason: "tested in test-endpoints.mjs lifecycle" },
  { name: "delete_prospect_list", category: "Prospect Lists", skip: "lifecycle", reason: "tested in test-endpoints.mjs lifecycle" },
  { name: "add_prospects_to_list", category: "Prospect Lists", skip: "lifecycle", reason: "tested in test-endpoints.mjs lifecycle" },
  { name: "remove_prospects_from_list", category: "Prospect Lists", skip: "lifecycle", reason: "tested in test-endpoints.mjs lifecycle" },
  { name: "import_prospect_list_csv", category: "Prospect Lists", skip: "lifecycle", reason: "would create real list; covered by ad-hoc test" },
  { name: "wait_for_prospect_list", category: "Prospect Lists", skip: "external", reason: "requires an Apollo list in pending state" },

  // ── Organizations ──────────────────────────────────────────────────────
  { name: "list_organizations", category: "Organizations", action: "ctx => call('list_organizations', { pageSize: 1 })", saves: "org" },
  { name: "get_organization", category: "Organizations", action: "ctx => call('get_organization', { id: ctx.org?.id })", needs: "org" },
  { name: "create_organization", category: "Organizations", skip: "lifecycle", reason: "tested in test-endpoints.mjs lifecycle" },
  { name: "update_organization", category: "Organizations", skip: "lifecycle", reason: "tested in test-endpoints.mjs lifecycle" },
  { name: "delete_organization", category: "Organizations", skip: "lifecycle", reason: "tested in test-endpoints.mjs lifecycle" },
  { name: "bulk_import_organizations", category: "Organizations", skip: "lifecycle", reason: "covered by ad-hoc test" },
  { name: "bulk_delete_organizations", category: "Organizations", skip: "lifecycle", reason: "covered by ad-hoc test" },

  // ── Accounts ───────────────────────────────────────────────────────────
  { name: "list_accounts", category: "Accounts", action: "ctx => call('list_accounts')", saves: "account" },
  { name: "get_account", category: "Accounts", action: "ctx => call('get_account', { id: ctx.account?.id })", needs: "account" },
  { name: "get_account_rate_limits", category: "Accounts", action: "ctx => call('get_account_rate_limits', { id: ctx.account?.id })", needs: "account" },
  { name: "update_account", category: "Accounts", skip: "destructive", reason: "would overwrite real account config" },
  { name: "disconnect_account", category: "Accounts", skip: "destructive", reason: "would disconnect a real connected account" },
  { name: "update_account_rate_limit", category: "Accounts", skip: "destructive", reason: "would change real sending caps" },
  { name: "hosted_auth_link", category: "Accounts", action: "ctx => call('hosted_auth_link', { type: 'create' })" },

  // ── Unibox ─────────────────────────────────────────────────────────────
  { name: "list_chats", category: "Unibox", action: "ctx => call('list_chats', { pageSize: 1 })", saves: "chat" },
  { name: "get_chat", category: "Unibox", action: "ctx => call('get_chat', { id: ctx.chat?.id })", needs: "chat" },
  { name: "list_chat_messages", category: "Unibox", action: "ctx => call('list_chat_messages', { chat_id: ctx.chat?.id, pageSize: 1 })", needs: "chat" },
  { name: "update_chat", category: "Unibox", skip: "destructive", reason: "would change real chat metadata" },
  { name: "archive_chat", category: "Unibox", skip: "destructive", reason: "would archive a real chat" },
  { name: "send_chat_message", category: "Unibox", skip: "sending", reason: "would send real message to real recipient" },

  // ── AI Agent ───────────────────────────────────────────────────────────
  { name: "generate_workflow", category: "AI Agent", skip: "billing", reason: "charges credits per invocation" },
  { name: "generate_message_preview", category: "AI Agent", skip: "billing", reason: "charges credits per invocation" },

  // ── Apollo ─────────────────────────────────────────────────────────────
  { name: "apollo_create_list", category: "Apollo", skip: "billing", reason: "charges credits + creates real list" },
  { name: "apollo_add_more", category: "Apollo", skip: "billing", reason: "charges credits per lead" },

  // ── Explorium ──────────────────────────────────────────────────────────
  { name: "explorium_create_list", category: "Explorium", skip: "billing", reason: "charges credits + creates real list" },
  { name: "explorium_add_more", category: "Explorium", skip: "billing", reason: "charges credits per lead" },

  // ── Dashboard ──────────────────────────────────────────────────────────
  { name: "get_dashboard_kpis", category: "Dashboard", action: "ctx => call('get_dashboard_kpis')" },

  // ── Admin ──────────────────────────────────────────────────────────────
  { name: "get_circuit_status", category: "Admin", action: "ctx => call('get_circuit_status')" },
  { name: "list_failed_requests", category: "Admin", action: "ctx => call('list_failed_requests', { limit: 5 })" },
  { name: "clear_failed_requests", category: "Admin", skip: "destructive", reason: "wipes dead-letter queue" },
];

// ─── Runner ─────────────────────────────────────────────────────────────────

async function main() {
  console.log(`${c.bold}MCP Endpoint Audit${c.reset}`);
  console.log(`  origin: ${c.cyan}${origin}${c.reset}`);
  console.log(`  tools:  ${tools.length}\n`);

  const transport = new StreamableHTTPClientTransport(new URL(`${origin}/mcp`));
  client = new Client({ name: "audit", version: "1.0.0" }, { capabilities: { tools: {} } });
  await client.connect(transport);

  const ctx = {};
  const results = [];

  for (const tool of tools) {
    if (tool.skip) {
      console.log(`${c.yellow}-${c.reset} ${tool.name} ${c.dim}(${tool.skip})${c.reset}`);
      results.push({ ...tool, outcome: "skip" });
      continue;
    }

    // Resolve ID dependency if needed
    if (tool.needs && !ctx[tool.needs]) {
      console.log(`${c.yellow}-${c.reset} ${tool.name} ${c.dim}(no ${tool.needs} available)${c.reset}`);
      results.push({ ...tool, outcome: "skip", note: `no ${tool.needs} available in workspace` });
      continue;
    }

    const fn = new Function("ctx", "call", `return (${tool.action})(ctx);`);
    const result = await fn(ctx, call);

    if (result.isError) {
      console.log(`${c.red}✗${c.reset} ${tool.name} ${c.dim}→ ${result.text.slice(0, 80)}${c.reset}`);
      results.push({ ...tool, outcome: "fail", status: result.status, response: result.text });
    } else {
      console.log(`${c.green}✓${c.reset} ${tool.name}`);
      results.push({ ...tool, outcome: "pass", status: result.status, response: result.text });

      if (tool.saves) {
        const first = result.parsed?.data?.[0] ?? result.parsed?.data;
        if (first?.id) ctx[tool.saves] = first;
      }
    }
  }

  // ─── Write markdown report ────────────────────────────────────────────
  await writeReport(results);

  const pass = results.filter((r) => r.outcome === "pass").length;
  const fail = results.filter((r) => r.outcome === "fail").length;
  const skipped = results.filter((r) => r.outcome === "skip").length;
  console.log(`\n${c.bold}Summary${c.reset}`);
  console.log(`  ${c.green}pass: ${pass}${c.reset}`);
  console.log(`  ${c.red}fail: ${fail}${c.reset}`);
  console.log(`  ${c.yellow}skip: ${skipped}${c.reset}`);
  console.log(`\nReport written to: ${c.cyan}docs/TOOL_AUDIT.md${c.reset}`);

  process.exit(fail > 0 ? 1 : 0);
}

async function writeReport(results) {
  const reportPath = "docs/TOOL_AUDIT.md";
  await mkdir(dirname(reportPath), { recursive: true });

  const byCategory = new Map();
  for (const r of results) {
    if (!byCategory.has(r.category)) byCategory.set(r.category, []);
    byCategory.get(r.category).push(r);
  }

  const now = new Date().toISOString();
  const lines = [];
  lines.push(`# MCP Endpoint Audit Report`);
  lines.push("");
  lines.push(`**Generated:** ${now}`);
  lines.push(`**Server:** ${origin}`);
  lines.push(`**Tools audited:** ${results.length}`);
  lines.push("");

  // Summary table
  const pass = results.filter((r) => r.outcome === "pass").length;
  const fail = results.filter((r) => r.outcome === "fail").length;
  const skip = results.filter((r) => r.outcome === "skip").length;
  lines.push(`## Summary`);
  lines.push("");
  lines.push(`| Outcome | Count |`);
  lines.push(`|---|---|`);
  lines.push(`| ✓ Pass | ${pass} |`);
  lines.push(`| ✗ Fail | ${fail} |`);
  lines.push(`| - Skip | ${skip} |`);
  lines.push("");

  // Per-category detail
  for (const [category, items] of byCategory.entries()) {
    lines.push(`## ${category}`);
    lines.push("");
    lines.push(`| Tool | Outcome | Status | Notes |`);
    lines.push(`|---|---|---|---|`);
    for (const r of items) {
      const icon = r.outcome === "pass" ? "✓" : r.outcome === "fail" ? "✗" : "-";
      const status = r.status ? `\`${r.status}\`` : "—";
      let notes = "";
      if (r.outcome === "skip") notes = `${r.skip || "—"}: ${r.reason || r.note || ""}`;
      else if (r.outcome === "fail") notes = `\`\`${(r.response || "").slice(0, 100).replace(/\|/g, "\\|").replace(/\n/g, " ")}\`\``;
      else if (r.response) {
        const preview = r.response.length > 80 ? r.response.slice(0, 77) + "…" : r.response;
        notes = `\`\`${preview.replace(/\|/g, "\\|").replace(/\n/g, " ").replace(/`/g, "")}\`\``;
      }
      lines.push(`| \`${r.name}\` | ${icon} ${r.outcome} | ${status} | ${notes} |`);
    }
    lines.push("");
  }

  // Known issues section
  const issues = [
    {
      title: "`get_campaign` returns 500 instead of 404 for non-existent UUIDs",
      severity: "Low",
      location: "max-agent",
      detail: "Hitting `GET /api/v1/campaigns/{bad-uuid}` returns `500 Cannot coerce the result to a single JSON object` instead of the OpenAPI-documented `404`. The MCP test harness accepts both, but the API itself should be fixed to return a clean 404.",
    },
    {
      title: "`update_organization` PATCH requires `name` field",
      severity: "Low",
      location: "max-agent",
      detail: "PATCH `/api/v1/organizations/{id}` rejects the request with `400 Required: name` if `name` is omitted, even though PATCH should support partial updates. Workaround: always send `name` when updating an organization.",
    },
  ];

  lines.push(`## Known Issues`);
  lines.push("");
  for (const issue of issues) {
    lines.push(`### ${issue.title}`);
    lines.push(`- **Severity:** ${issue.severity}`);
    lines.push(`- **Location:** ${issue.location}`);
    lines.push("");
    lines.push(issue.detail);
    lines.push("");
  }

  // Failures section
  const failed = results.filter((r) => r.outcome === "fail");
  if (failed.length > 0) {
    lines.push(`## Failures`);
    lines.push("");
    for (const r of failed) {
      lines.push(`### \`${r.name}\``);
      lines.push(`- **Category:** ${r.category}`);
      lines.push(`- **Status:** ${r.status ?? "—"}`);
      lines.push("");
      lines.push("```");
      lines.push(r.response || "(no response)");
      lines.push("```");
      lines.push("");
    }
  }

  await writeFile(reportPath, lines.join("\n"), "utf8");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

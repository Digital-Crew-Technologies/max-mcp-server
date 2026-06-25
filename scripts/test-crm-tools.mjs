#!/usr/bin/env node
/**
 * Focused MCP-level smoke test for the new CRM tools.
 *
 *   1) Lists tools and asserts all 15 CRM tools (10 primitives + 3 lead-dispatch
 *      + 2 composers) are registered.
 *   2) crm_status            — prints connected bool.
 *   3) crm_list_owners       — list OR clean HUBSPOT_NOT_CONNECTED envelope.
 *   4) crm_list_pipeline_stages — same.
 *   5) crm_list_deals        — list (limit 3) OR clean error.
 *   6) crm_pipeline_risk_scan — { scanned_count, flagged } OR clean error.
 *   7) crm_weekly_brief_compose — structured brief OR clean error.
 *
 * HUBSPOT_NOT_CONNECTED is NOT a script failure — the script reports it and
 * continues. Schema/inventory mismatches and unexpected errors ARE failures.
 *
 * Usage:
 *   node scripts/test-crm-tools.mjs [ORIGIN] [BEARER_TOKEN]
 *
 *   ORIGIN        defaults to http://localhost:3000
 *   BEARER_TOKEN  defaults to $DIGITALCREW_BEARER_TOKEN
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const origin = process.argv[2] || process.env.MCP_ORIGIN || "http://localhost:3000";
const bearer = process.argv[3] || process.env.DIGITALCREW_BEARER_TOKEN || "";

if (!bearer) {
  console.error(
    "Bearer token required. Usage: node scripts/test-crm-tools.mjs ORIGIN BEARER_TOKEN",
  );
  process.exit(2);
}

const c = {
  reset: "\x1b[0m", green: "\x1b[32m", red: "\x1b[31m",
  yellow: "\x1b[33m", cyan: "\x1b[36m", bold: "\x1b[1m", dim: "\x1b[2m",
};

const stats = { pass: 0, fail: 0, skip: 0 };

function pass(msg, body) {
  console.log(`  ${c.green}PASS${c.reset} ${msg}`);
  if (body) console.log(`    ${c.dim}${body.slice(0, 200)}${c.reset}`);
  stats.pass++;
}
function fail(msg, body) {
  console.log(`  ${c.red}FAIL${c.reset} ${msg}`);
  if (body) console.log(`    ${c.dim}${body.slice(0, 300)}${c.reset}`);
  stats.fail++;
}
function skip(msg) {
  console.log(`  ${c.yellow}SKIP${c.reset} ${msg}`);
  stats.skip++;
}
function section(name) {
  console.log(`\n${c.bold}${name}${c.reset}`);
}

// 15 CRM tools total (10 primitives + 3 lead-dispatch + 2 composers).
const EXPECTED = [
  // contacts & companies
  "crm_search_contacts",
  "crm_get_contact",
  "crm_upsert_contact",
  "crm_upsert_company",
  "crm_status",
  // deals / activities / owners / stages
  "crm_list_deals",
  "crm_get_deal",
  "crm_list_activities",
  "crm_list_owners",
  "crm_list_pipeline_stages",
  // lead dispatch
  "crm_score_prospects",
  "crm_assign_prospects",
  "crm_export_import_csv",
  // composers
  "crm_pipeline_risk_scan",
  "crm_weekly_brief_compose",
];

const NOT_CONNECTED_HINTS = [
  "HUBSPOT_NOT_CONNECTED",
  "HubSpot is not connected",
];

let client;

async function callTool(name, args = {}) {
  const res = await client.callTool({
    name,
    arguments: { ...args, bearer_token: bearer },
  });
  const text = res.content?.[0]?.text ?? "";
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { /* not JSON */ }
  const notConnected = NOT_CONNECTED_HINTS.some((h) => text.includes(h));
  return { res, text, parsed, isError: res.isError === true, notConnected };
}

/** Report a probe whose only failure mode worth flagging is an UNEXPECTED error. */
function reportProbe(label, r, validate) {
  if (r.notConnected) {
    pass(`${label} — clean NOT_CONNECTED envelope`, r.text);
    return;
  }
  if (r.isError) {
    fail(`${label} — error envelope`, r.text);
    return;
  }
  try {
    const ok = validate(r);
    if (ok === false) {
      fail(`${label} — validation failed`, r.text);
    } else {
      pass(`${label}`, typeof ok === "string" ? ok : r.text);
    }
  } catch (e) {
    fail(`${label} — threw during validation: ${e.message}`, r.text);
  }
}

async function main() {
  console.log(`${c.bold}CRM MCP smoke tests${c.reset}`);
  console.log(`  origin: ${c.cyan}${origin}${c.reset}`);

  const transport = new StreamableHTTPClientTransport(new URL(`${origin}/mcp`));
  client = new Client(
    { name: "test-crm-tools", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );

  try {
    await client.connect(transport);
  } catch (e) {
    console.error(`${c.red}Failed to connect: ${e.message}${c.reset}`);
    process.exit(1);
  }

  // ── Step 1: inventory ──────────────────────────────────────────────────────
  section("1) Tool inventory");
  const { tools } = await client.listTools();
  const registered = new Set(tools.map((t) => t.name));
  const missing = EXPECTED.filter((t) => !registered.has(t));
  if (missing.length === 0) {
    pass(`all ${EXPECTED.length} CRM tools registered`);
  } else {
    fail(`missing CRM tools: ${missing.join(", ")}`);
  }

  // ── Step 2: crm_status ─────────────────────────────────────────────────────
  section("2) crm_status");
  try {
    const r = await callTool("crm_status", {});
    if (r.isError) {
      fail(`crm_status returned error`, r.text);
    } else {
      const connected = r.parsed && r.parsed.connected;
      pass(`crm_status connected=${connected}`, r.text);
    }
  } catch (e) {
    fail(`crm_status threw: ${e.message}`);
  }

  // ── Step 3: crm_list_owners ────────────────────────────────────────────────
  section("3) crm_list_owners");
  try {
    const r = await callTool("crm_list_owners", {});
    reportProbe("crm_list_owners", r, (rr) => {
      if (!Array.isArray(rr.parsed)) return false;
      return `${rr.parsed.length} owner(s)`;
    });
  } catch (e) {
    fail(`crm_list_owners threw: ${e.message}`);
  }

  // ── Step 4: crm_list_pipeline_stages ───────────────────────────────────────
  section("4) crm_list_pipeline_stages");
  try {
    const r = await callTool("crm_list_pipeline_stages", {});
    reportProbe("crm_list_pipeline_stages", r, (rr) => {
      if (!Array.isArray(rr.parsed)) return false;
      return `${rr.parsed.length} stage(s)`;
    });
  } catch (e) {
    fail(`crm_list_pipeline_stages threw: ${e.message}`);
  }

  // ── Step 5: crm_list_deals (limit 3) ──────────────────────────────────────
  section("5) crm_list_deals");
  try {
    const r = await callTool("crm_list_deals", { limit: 3 });
    reportProbe("crm_list_deals", r, (rr) => {
      if (!Array.isArray(rr.parsed)) return false;
      return `${rr.parsed.length} deal(s) (limit=3)`;
    });
  } catch (e) {
    fail(`crm_list_deals threw: ${e.message}`);
  }

  // ── Step 6: crm_pipeline_risk_scan (window 30) ────────────────────────────
  section("6) crm_pipeline_risk_scan");
  try {
    const r = await callTool("crm_pipeline_risk_scan", { window_days: 30 });
    reportProbe("crm_pipeline_risk_scan", r, (rr) => {
      if (!rr.parsed || typeof rr.parsed.scanned_count !== "number") return false;
      const flagged = Array.isArray(rr.parsed.flagged) ? rr.parsed.flagged.length : "n/a";
      return `scanned=${rr.parsed.scanned_count}, flagged=${flagged}`;
    });
  } catch (e) {
    fail(`crm_pipeline_risk_scan threw: ${e.message}`);
  }

  // ── Step 7: crm_weekly_brief_compose ──────────────────────────────────────
  section("7) crm_weekly_brief_compose");
  try {
    const r = await callTool("crm_weekly_brief_compose", {});
    reportProbe("crm_weekly_brief_compose", r, (rr) => {
      if (!rr.parsed || typeof rr.parsed.week_ending !== "string") return false;
      const summary = rr.parsed.last_week_summary || {};
      return `week_ending=${rr.parsed.week_ending}, open_deals=${summary.open_deals ?? "?"}`;
    });
  } catch (e) {
    fail(`crm_weekly_brief_compose threw: ${e.message}`);
  }

  console.log(`\n${c.bold}Summary${c.reset}`);
  console.log(`  ${c.green}pass: ${stats.pass}${c.reset}`);
  console.log(`  ${c.red}fail: ${stats.fail}${c.reset}`);
  console.log(`  ${c.yellow}skip: ${stats.skip}${c.reset}`);

  process.exit(stats.fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(`${c.red}Unexpected: ${e.stack || e.message}${c.reset}`);
  process.exit(1);
});

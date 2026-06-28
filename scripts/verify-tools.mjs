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

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const origin = process.argv[2] || process.env.MCP_ORIGIN || "http://localhost:3000";
const bearer = process.argv[3] || process.env.DIGITALCREW_BEARER_TOKEN || "";
const gatewayKey = process.env.MCP_GATEWAY_SECRET?.trim() || "";

const toolsJsonPath = join(__dirname, "../docs/tools.json");
const EXPECTED_TOOLS = JSON.parse(readFileSync(toolsJsonPath, "utf8")).map((t) => t.name);

// Safe read-only tools to live-call when a token is available.
//
// Tools that depend on an external integration (HubSpot, Notion) may legitimately
// return a "NOT_CONNECTED" envelope when the workspace hasn't completed the
// OAuth flow yet — that is NOT a script failure, it's reported as
// "connection needed". The connectionNeededHints below are substrings the script
// matches against the response text to classify the outcome.
const LIVE_PROBE_TOOLS = [
  { name: "list_campaigns", args: { pageSize: 1 } },
  { name: "list_prospects", args: { pageSize: 1 } },
  { name: "list_prospect_lists", args: { pageSize: 1 } },
  { name: "list_organizations", args: { pageSize: 1 } },
  { name: "list_accounts", args: {} },
  { name: "list_chats", args: { pageSize: 1 } },
  { name: "get_dashboard_kpis", args: {} },
  { name: "get_workspace_profile", args: {} },
  // CRM — cheap, read-only HubSpot probes (returns NOT_CONNECTED if HubSpot
  // is not yet wired up for the workspace).
  { name: "crm_list_owners", args: {}, connectionNeededHints: ["HUBSPOT_NOT_CONNECTED", "HubSpot is not connected"] },
  { name: "crm_list_pipeline_stages", args: {}, connectionNeededHints: ["HUBSPOT_NOT_CONNECTED", "HubSpot is not connected"] },
  // Notion — cheap read-only probe. The schema requires query.min(1); we send a
  // single space (rejected) — fall back to "test" to satisfy schema while
  // staying cheap. Returns NOT_CONNECTED if Notion is not wired up.
  { name: "notion_search_pages", args: { query: "test" }, connectionNeededHints: ["NOTION_NOT_CONNECTED", "Notion is not connected"] },
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

  const transportHeaders = {};
  if (gatewayKey) transportHeaders["X-MCP-Gateway-Key"] = gatewayKey;

  const transport = new StreamableHTTPClientTransport(new URL(`${origin}/mcp`), {
    requestInit: { headers: transportHeaders },
  });
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

  if (missing.length === 0 && extra.length === 0) {
    console.log(ok(`All ${EXPECTED_TOOLS.length} expected tools are registered`));
  } else {
    if (missing.length > 0) {
      console.log(fail(`${missing.length} expected tools missing:`));
      for (const t of missing) console.log(`    - ${t}`);
    }
    if (extra.length > 0) {
      console.log(fail(`${extra.length} unexpected tool(s) registered:`));
      for (const t of extra) console.log(`    + ${t}`);
    }
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
    summarize(missing.length === 0 && extra.length === 0 && noSchema.length === 0);
    return;
  }

  console.log(`\n${c.bold}Live API probes${c.reset}`);
  let pass = 0;
  let probeFail = 0;
  let needConnect = 0;
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
      const isErrorEnvelope = res.isError === true;
      const looksLikeError =
        isErrorEnvelope ||
        text.startsWith("API error") ||
        text.startsWith("Error:");
      const hints = probe.connectionNeededHints ?? [];
      const needsConnect = hints.some((h) => text.includes(h));
      if (needsConnect) {
        console.log(warn(`${probe.name}  →  connection needed: ${text.slice(0, 120).replace(/\s+/g, " ")}`));
        needConnect++;
      } else if (looksLikeError) {
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
  console.log(`  ${pass} passed, ${probeFail} failed, ${needConnect} need integration connect`);
  summarize(missing.length === 0 && extra.length === 0 && noSchema.length === 0 && probeFail === 0);
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

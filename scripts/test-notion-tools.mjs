#!/usr/bin/env node
/**
 * Focused MCP-level smoke test for the new Notion tools.
 *
 *   1) Lists tools and asserts all 4 notion_* primitives plus
 *      notion_publish_weekly_brief are registered.
 *   2) Calls notion_search_pages with a cheap query — expects either real
 *      results or a clean NOTION_NOT_CONNECTED message.
 *   3) If PARENT_PAGE_ID is supplied, creates a tiny test page via
 *      notion_create_page and prints the URL.
 *   4) If step 3 succeeded, fetches the page back via notion_get_page.
 *
 * NOTION_NOT_CONNECTED is NOT a script failure — the script exits 0 and prints
 * a clear "connect Notion first" message.
 *
 * Usage:
 *   node scripts/test-notion-tools.mjs [ORIGIN] [BEARER_TOKEN] [PARENT_PAGE_ID]
 *
 *   ORIGIN          defaults to http://localhost:3000
 *   BEARER_TOKEN    defaults to $DIGITALCREW_BEARER_TOKEN
 *   PARENT_PAGE_ID  optional; if omitted, write steps are skipped
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const origin = process.argv[2] || process.env.MCP_ORIGIN || "http://localhost:3000";
const bearer = process.argv[3] || process.env.DIGITALCREW_BEARER_TOKEN || "";
const parentPageId =
  process.argv[4] || process.env.NOTION_PARENT_PAGE_ID || "";

if (!bearer) {
  console.error(
    "Bearer token required. Usage: node scripts/test-notion-tools.mjs ORIGIN BEARER_TOKEN [PARENT_PAGE_ID]",
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

const EXPECTED = [
  "notion_create_page",
  "notion_append_blocks",
  "notion_get_page",
  "notion_search_pages",
  "notion_publish_weekly_brief",
];

const NOT_CONNECTED_HINTS = [
  "NOTION_NOT_CONNECTED",
  "Notion is not connected",
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

async function main() {
  console.log(`${c.bold}Notion MCP smoke tests${c.reset}`);
  console.log(`  origin: ${c.cyan}${origin}${c.reset}`);
  console.log(`  parent: ${parentPageId ? c.cyan + parentPageId : c.dim + "(none — write steps skipped)"}${c.reset}`);

  const transport = new StreamableHTTPClientTransport(new URL(`${origin}/mcp`));
  client = new Client(
    { name: "test-notion-tools", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );

  try {
    await client.connect(transport);
  } catch (e) {
    console.error(`${c.red}Failed to connect: ${e.message}${c.reset}`);
    process.exit(1);
  }

  // ── Step 1: tool inventory ──────────────────────────────────────────────────
  section("1) Tool inventory");
  const { tools } = await client.listTools();
  const registered = new Set(tools.map((t) => t.name));
  const missing = EXPECTED.filter((t) => !registered.has(t));
  if (missing.length === 0) {
    pass(`all ${EXPECTED.length} Notion tools registered`);
  } else {
    fail(`missing Notion tools: ${missing.join(", ")}`);
  }

  // ── Step 2: notion_search_pages ────────────────────────────────────────────
  section("2) notion_search_pages");
  // Schema requires query.min(1); using a cheap probe term.
  let notionConnected = true;
  try {
    const r = await callTool("notion_search_pages", { query: "test" });
    if (r.notConnected) {
      pass(`notion_search_pages clean NOT_CONNECTED envelope`, r.text);
      notionConnected = false;
    } else if (r.isError) {
      fail(`notion_search_pages returned error`, r.text);
    } else {
      const count = Array.isArray(r.parsed) ? r.parsed.length : "n/a";
      pass(`notion_search_pages returned (count=${count})`, r.text);
    }
  } catch (e) {
    fail(`notion_search_pages threw: ${e.message}`);
  }

  if (!notionConnected) {
    console.log(
      `\n${c.yellow}Notion is not connected for this workspace. Complete the connect flow first; create/get steps skipped.${c.reset}`,
    );
    summarize();
    process.exit(0);
  }

  // ── Step 3: notion_create_page (only with PARENT_PAGE_ID) ───────────────────
  section("3) notion_create_page");
  if (!parentPageId) {
    skip("no PARENT_PAGE_ID provided — pass as 3rd CLI arg to run create/get");
    summarize();
    process.exit(stats.fail === 0 ? 0 : 1);
  }

  let createdId = null;
  try {
    const iso = new Date().toISOString();
    const r = await callTool("notion_create_page", {
      parent_page_id: parentPageId,
      title: `agent-drafts smoke test ${iso}`,
      blocks: [
        {
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: [
              { type: "text", text: { content: "created by test-notion-tools.mjs" } },
            ],
          },
        },
      ],
    });
    if (r.notConnected) {
      pass(`notion_create_page clean NOT_CONNECTED envelope (skipping get_page)`, r.text);
      summarize();
      process.exit(0);
    }
    if (r.isError) {
      fail(`notion_create_page returned error`, r.text);
    } else if (r.parsed && r.parsed.id) {
      createdId = String(r.parsed.id);
      pass(`notion_create_page → id=${createdId}`);
      if (r.parsed.url) console.log(`    url: ${c.cyan}${r.parsed.url}${c.reset}`);
    } else {
      fail(`notion_create_page response missing id`, r.text);
    }
  } catch (e) {
    fail(`notion_create_page threw: ${e.message}`);
  }

  // ── Step 4: notion_get_page on the created page ─────────────────────────────
  section("4) notion_get_page");
  if (!createdId) {
    skip("nothing to fetch (create did not yield an id)");
  } else {
    try {
      const r = await callTool("notion_get_page", { page_id: createdId });
      if (r.isError) {
        fail(`notion_get_page returned error`, r.text);
      } else if (r.parsed && r.parsed.page && Array.isArray(r.parsed.blocks)) {
        pass(`notion_get_page → page + ${r.parsed.blocks.length} block(s)`);
      } else {
        fail(`notion_get_page response missing page/blocks`, r.text);
      }
    } catch (e) {
      fail(`notion_get_page threw: ${e.message}`);
    }
  }

  summarize();
  process.exit(stats.fail === 0 ? 0 : 1);
}

function summarize() {
  console.log(`\n${c.bold}Summary${c.reset}`);
  console.log(`  ${c.green}pass: ${stats.pass}${c.reset}`);
  console.log(`  ${c.red}fail: ${stats.fail}${c.reset}`);
  console.log(`  ${c.yellow}skip: ${stats.skip}${c.reset}`);
}

main().catch((e) => {
  console.error(`${c.red}Unexpected: ${e.stack || e.message}${c.reset}`);
  process.exit(1);
});

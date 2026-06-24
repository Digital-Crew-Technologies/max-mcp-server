// Notion tools (Super-BJ Task D1): create_page / append_blocks / get_page /
// search_pages. Talk DIRECTLY to the Notion REST API via NotionClient (no SDK
// dep). The per-workspace Notion OAuth token is resolved from max-agent via
// GET /api/v1/notion/access-token, cached per-bearer (token-resolver.ts).
//
// Error mapping → standard MCP envelope:
//   NOTION_NOT_CONNECTED → friendly "connect Notion" message
//   NotionApiError / others → { isError: true, content: [{ text: "<Cls>: <msg>" }] }
//
// WRITE-GATE: notion_create_page and notion_append_blocks check
// super_bj.allow_notion_writes (default TRUE; only an explicit false blocks).
// ⚠️ Server-only.

import { resolveBearerToken, type McpServer } from "../shared";
import * as S from "./schema";
import { NotionClient, type NotionBlock } from "./notion-client";
import { getNotionAccessToken, invalidateNotionToken } from "./token-resolver";
import { areNotionWritesAllowed } from "../crm/super-bj-profile";

type McpEnvelope = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

const WRITES_DISABLED_MSG =
  "Notion writes are disabled for this workspace (super_bj.allow_notion_writes is false). Enable in workspace settings.";

function ok(payload: unknown): McpEnvelope {
  const text = typeof payload === "string" ? payload : JSON.stringify(payload);
  return { content: [{ type: "text", text }] };
}

function err(text: string): McpEnvelope {
  return { isError: true, content: [{ type: "text", text }] };
}

function isAuthError(msg: string): boolean {
  return /\b401\b|unauthorized|invalid[_ ]?token|token expired/i.test(msg);
}

/** Map a thrown error from a Notion call to the MCP error envelope. */
function mapError(e: unknown): McpEnvelope {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg === "NOTION_NOT_CONNECTED") {
    return err(
      "Notion is not connected for this workspace. Connect Notion in workspace settings, then retry.",
    );
  }
  if (msg.startsWith("NOTION_TOKEN_FETCH_FAILED")) {
    return err(msg);
  }
  const cls = e instanceof Error ? e.name : "Error";
  return err(`${cls}: ${msg}`);
}

/**
 * Resolve bearer → Notion token → NotionClient, run fn, map result/errors.
 * On a Notion 401 we invalidate the cached token once and retry so a token
 * that rotated mid-cache refetches transparently.
 */
async function withClient(
  bearerOverride: string | undefined,
  fn: (client: NotionClient) => Promise<unknown>,
): Promise<McpEnvelope> {
  let bearer: string;
  try {
    bearer = resolveBearerToken(bearerOverride);
  } catch (e) {
    return mapError(e);
  }

  try {
    const token = await getNotionAccessToken(bearer);
    try {
      return ok(await fn(new NotionClient(token)));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (isAuthError(msg)) {
        invalidateNotionToken(bearer);
        const fresh = await getNotionAccessToken(bearer);
        return ok(await fn(new NotionClient(fresh)));
      }
      throw e;
    }
  } catch (e) {
    return mapError(e);
  }
}

export function registerNotionTools(server: McpServer): void {
  server.registerTool(
    "notion_create_page",
    {
      title: "Create a Notion page",
      description:
        "Create a new Notion page under a parent page, with an optional body of Notion block JSON. Requires super_bj.allow_notion_writes (default true). Returns { id, url }.",
      inputSchema: S.notionCreatePageSchema,
    },
    async (input) => {
      let bearer: string;
      try {
        bearer = resolveBearerToken(input.bearer_token);
      } catch (e) {
        return mapError(e);
      }
      // Write-gate: do NOT touch Notion when writes are disabled.
      try {
        if (!(await areNotionWritesAllowed(bearer))) return err(WRITES_DISABLED_MSG);
      } catch (e) {
        return mapError(e);
      }
      return withClient(bearer, (c) =>
        c.createPage({
          parentPageId: String(input.parent_page_id),
          title: String(input.title),
          blocks: (input.blocks ?? []) as NotionBlock[],
        }),
      );
    },
  );

  server.registerTool(
    "notion_append_blocks",
    {
      title: "Append blocks to a Notion page",
      description:
        "Append an array of Notion block JSON objects to an existing page (chunked into ≤100-block requests). Requires super_bj.allow_notion_writes (default true). Returns { appended }.",
      inputSchema: S.notionAppendBlocksSchema,
    },
    async (input) => {
      let bearer: string;
      try {
        bearer = resolveBearerToken(input.bearer_token);
      } catch (e) {
        return mapError(e);
      }
      try {
        if (!(await areNotionWritesAllowed(bearer))) return err(WRITES_DISABLED_MSG);
      } catch (e) {
        return mapError(e);
      }
      return withClient(bearer, (c) =>
        c.appendBlocks(String(input.page_id), (input.blocks ?? []) as NotionBlock[]),
      );
    },
  );

  server.registerTool(
    "notion_get_page",
    {
      title: "Get a Notion page",
      description:
        "Fetch a Notion page object plus all of its child blocks (paginated). Returns { page, blocks }.",
      inputSchema: S.notionGetPageSchema,
    },
    async (input) =>
      withClient(input.bearer_token, (c) => c.getPage(String(input.page_id))),
  );

  server.registerTool(
    "notion_search_pages",
    {
      title: "Search Notion pages",
      description:
        "Search the connected Notion workspace for pages matching a free-text query. Returns [{ id, title, url }].",
      inputSchema: S.notionSearchPagesSchema,
    },
    async (input) =>
      withClient(input.bearer_token, (c) => c.searchPages(String(input.query))),
  );
}

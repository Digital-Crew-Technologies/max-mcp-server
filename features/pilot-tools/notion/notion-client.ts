// Notion client — talks DIRECTLY to the Notion REST API (api.notion.com/v1).
//
// No @notionhq/client SDK dependency: plain fetch via the shared fetchWithRetry
// helper (features/pilot-tools/http.ts), which gives us retry/backoff and a
// per-host circuit breaker for free. The constructor takes the workspace's
// Notion access token (resolved via token-resolver.ts).
//
// Notion API version is pinned via the Notion-Version header (2022-06-28).
// ⚠️ Server-only.

import { fetchWithRetry, responseBodyText } from "../shared";

const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";
// Notion caps block-children writes at 100 per request.
const MAX_CHILDREN_PER_CALL = 100;

/** Arbitrary Notion block JSON (the shape the caller passes through verbatim). */
export type NotionBlock = Record<string, unknown>;

export interface CreatePageInput {
  parentPageId: string;
  title: string;
  blocks?: NotionBlock[];
}

export interface NotionPageSummary {
  id: string;
  title: string;
  url: string;
}

/**
 * Thrown when a Notion API call returns a non-2xx. Carries the HTTP status and
 * the Notion error body so callers can surface an actionable MCP error.
 */
export class NotionApiError extends Error {
  readonly status: number;
  readonly body: string;
  constructor(status: number, body: string) {
    super(`Notion API error ${status}: ${body || "(empty body)"}`);
    this.name = "NotionApiError";
    this.status = status;
    this.body = body;
  }
}

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  };
}

/** Extract a plain-text title from a Notion page's properties bag (shape-tolerant). */
function titleFromPage(page: unknown): string {
  if (!page || typeof page !== "object") return "";
  const props = (page as Record<string, unknown>).properties;
  if (!props || typeof props !== "object") return "";
  for (const value of Object.values(props as Record<string, unknown>)) {
    if (value && typeof value === "object" && (value as Record<string, unknown>).type === "title") {
      const arr = (value as Record<string, unknown>).title;
      if (Array.isArray(arr)) {
        return arr
          .map((t) =>
            t && typeof t === "object" ? String((t as Record<string, unknown>).plain_text ?? "") : "",
          )
          .join("");
      }
    }
  }
  return "";
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export class NotionClient {
  constructor(private readonly accessToken: string) {}

  /** Issue a Notion API request, parse JSON, throw NotionApiError on non-2xx. */
  private async request(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<Record<string, unknown>> {
    const init: RequestInit = { method, headers: headers(this.accessToken) };
    if (body !== undefined) init.body = JSON.stringify(body);

    const res = await fetchWithRetry(`${NOTION_API_BASE}${path}`, init);
    const text = await responseBodyText(res);
    if (!res.ok) {
      throw new NotionApiError(res.status, text);
    }
    if (!text) return {};
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      // Notion always returns JSON on success; a non-JSON 2xx is unexpected.
      return {};
    }
  }

  /**
   * Create a page under a parent page. Notion caps `children` at 100 per call,
   * so we send the first ≤100 blocks with the create and append the rest.
   */
  async createPage(input: CreatePageInput): Promise<{ id: string; url: string }> {
    const blocks = input.blocks ?? [];
    const firstBatch = blocks.slice(0, MAX_CHILDREN_PER_CALL);
    const rest = blocks.slice(MAX_CHILDREN_PER_CALL);

    const created = await this.request("POST", "/pages", {
      parent: { type: "page_id", page_id: input.parentPageId },
      properties: {
        title: { title: [{ text: { content: input.title } }] },
      },
      children: firstBatch,
    });

    const id = typeof created.id === "string" ? created.id : "";
    const url = typeof created.url === "string" ? created.url : "";
    if (!id) {
      throw new NotionApiError(500, "create page succeeded but no id was returned");
    }

    if (rest.length > 0) {
      await this.appendBlocks(id, rest);
    }
    return { id, url };
  }

  /**
   * Append blocks to a page (or block). Chunks into ≤100-block PATCHes since
   * Notion caps children at 100 per call. Returns total appended.
   */
  async appendBlocks(pageId: string, blocks: NotionBlock[]): Promise<{ appended: number }> {
    let appended = 0;
    for (const batch of chunk(blocks, MAX_CHILDREN_PER_CALL)) {
      if (batch.length === 0) continue;
      await this.request("PATCH", `/blocks/${pageId}/children`, { children: batch });
      appended += batch.length;
    }
    return { appended };
  }

  /** Fetch a page object plus all of its child blocks (paginated). */
  async getPage(
    pageId: string,
  ): Promise<{ page: Record<string, unknown>; blocks: Record<string, unknown>[] }> {
    const page = await this.request("GET", `/pages/${pageId}`);

    const blocks: Record<string, unknown>[] = [];
    let cursor: string | null = null;
    do {
      const qs = cursor ? `?start_cursor=${encodeURIComponent(cursor)}&page_size=100` : "?page_size=100";
      const res: Record<string, unknown> = await this.request(
        "GET",
        `/blocks/${pageId}/children${qs}`,
      );
      const results = Array.isArray(res.results) ? (res.results as Record<string, unknown>[]) : [];
      blocks.push(...results);
      const hasMore = res.has_more === true;
      cursor = hasMore && typeof res.next_cursor === "string" ? res.next_cursor : null;
    } while (cursor);

    return { page, blocks };
  }

  /** Search the workspace for pages matching a query string. */
  async searchPages(query: string): Promise<NotionPageSummary[]> {
    const res = await this.request("POST", "/search", {
      query,
      filter: { property: "object", value: "page" },
    });
    const results = Array.isArray(res.results) ? (res.results as Record<string, unknown>[]) : [];
    return results.map((r) => ({
      id: typeof r.id === "string" ? r.id : "",
      title: titleFromPage(r),
      url: typeof r.url === "string" ? (r.url as string) : "",
    }));
  }
}

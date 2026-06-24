// Notion composite workflow tool (Super-BJ Task D2):
//   • notion_publish_weekly_brief — render a crm_weekly_brief_compose output as
//     a Notion DRAFT page under the workspace's Drafts/Super-BJ parent.
//
// Write-gated by super_bj.allow_notion_writes (default TRUE). The Notion token
// is resolved from max-agent (token-resolver.ts) and pages are created via the
// direct-API NotionClient. Large briefs are created with the first ≤100 blocks
// then appended in ≤100-block chunks; a failed chunk yields partial_success.
// ⚠️ Server-only.

import { resolveBearerToken, type McpServer } from "../shared";
import * as S from "./schema";
import { NotionClient, type NotionBlock } from "./notion-client";
import { getNotionAccessToken, invalidateNotionToken } from "./token-resolver";
import { getSuperBjResolved, areNotionWritesAllowed } from "../crm/super-bj-profile";

type McpEnvelope = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

const WRITES_DISABLED_MSG =
  "Notion writes are disabled for this workspace (super_bj.allow_notion_writes is false). Enable in workspace settings.";

function ok(payload: unknown): McpEnvelope {
  return { content: [{ type: "text", text: JSON.stringify(payload) }] };
}

function err(text: string): McpEnvelope {
  return { isError: true, content: [{ type: "text", text }] };
}

function isAuthError(msg: string): boolean {
  return /\b401\b|unauthorized|invalid[_ ]?token|token expired/i.test(msg);
}

function mapError(e: unknown): McpEnvelope {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg === "NOTION_NOT_CONNECTED") {
    return err(
      "Notion is not connected for this workspace. Connect Notion in workspace settings, then retry.",
    );
  }
  if (msg.startsWith("NOTION_TOKEN_FETCH_FAILED")) return err(msg);
  const cls = e instanceof Error ? e.name : "Error";
  return err(`${cls}: ${msg}`);
}

// ── Notion block builders ────────────────────────────────────────────────────

function richText(content: string): Array<Record<string, unknown>> {
  // Notion caps a single rich_text content string at 2000 chars.
  return [{ type: "text", text: { content: content.slice(0, 2000) } }];
}

function heading1(text: string): NotionBlock {
  return { object: "block", type: "heading_1", heading_1: { rich_text: richText(text) } };
}

function heading2(text: string): NotionBlock {
  return { object: "block", type: "heading_2", heading_2: { rich_text: richText(text) } };
}

function paragraph(text: string): NotionBlock {
  return { object: "block", type: "paragraph", paragraph: { rich_text: richText(text) } };
}

function bullet(text: string): NotionBlock {
  return {
    object: "block",
    type: "bulleted_list_item",
    bulleted_list_item: { rich_text: richText(text) },
  };
}

function todo(text: string): NotionBlock {
  return {
    object: "block",
    type: "to_do",
    to_do: { rich_text: richText(text), checked: false },
  };
}

function str(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** Append a section (H2 + body blocks) only when it has content. */
function section(blocks: NotionBlock[], title: string, body: NotionBlock[]): void {
  if (body.length === 0) return;
  blocks.push(heading2(title));
  blocks.push(...body);
}

/**
 * Render the brief object (shape-tolerant: it's pass-through JSON) into Notion
 * blocks. Unknown/missing sections are skipped gracefully.
 */
function buildBriefBlocks(brief: Record<string, unknown>): NotionBlock[] {
  const blocks: NotionBlock[] = [];
  const weekEnding = str(brief.week_ending) || "this week";
  blocks.push(heading1(`Weekly Sales Brief — ${weekEnding}`));

  // Last week summary.
  const summary = asRecord(brief.last_week_summary);
  const summaryBody: NotionBlock[] = [];
  if (summary.activities_logged != null) {
    summaryBody.push(bullet(`Activities logged: ${str(summary.activities_logged)}`));
  }
  if (summary.open_deals != null) {
    summaryBody.push(bullet(`Open deals: ${str(summary.open_deals)}`));
  }
  if (summary.open_pipeline_value_eur != null) {
    summaryBody.push(
      bullet(`Open pipeline value: €${str(summary.open_pipeline_value_eur)}`),
    );
  }
  const byType = asRecord(summary.by_type);
  for (const [type, count] of Object.entries(byType)) {
    summaryBody.push(bullet(`${type}: ${str(count)}`));
  }
  section(blocks, "Last Week Summary", summaryBody);

  // This week priorities.
  section(
    blocks,
    "This Week Priorities",
    asArray(brief.this_week_priorities).map((p) => bullet(str(p))),
  );

  // Stale deals.
  section(
    blocks,
    "Stale Deals",
    asArray(brief.stale_deals).map((d) => {
      const r = asRecord(d);
      const name = str(r.dealname) || str(r.deal_id);
      const days = r.days_inactive != null ? ` — ${str(r.days_inactive)} days inactive` : "";
      return bullet(`${name}${days}`);
    }),
  );

  // Deals without next step.
  section(
    blocks,
    "Deals Without Next Step",
    asArray(brief.deals_without_next_step).map((d) => {
      const r = asRecord(d);
      return bullet(str(r.dealname) || str(r.deal_id));
    }),
  );

  // Top risks.
  section(
    blocks,
    "Top Risks",
    asArray(brief.top_risks).map((d) => {
      const r = asRecord(d);
      const name = str(r.dealname) || str(r.deal_id);
      const score = r.risk_score != null ? ` (risk ${str(r.risk_score)})` : "";
      return bullet(`${name}${score}`);
    }),
  );

  // Questions per rep.
  const perRep = asRecord(brief.per_rep_questions);
  const perRepBody: NotionBlock[] = [];
  for (const [ownerId, questions] of Object.entries(perRep)) {
    const qs = asArray(questions);
    if (qs.length === 0) continue;
    perRepBody.push(paragraph(`Owner ${ownerId}:`));
    for (const q of qs) perRepBody.push(bullet(str(q)));
  }
  section(blocks, "Questions per Rep", perRepBody);

  // BJ notes.
  section(
    blocks,
    "BJ Notes",
    asArray(brief.suggested_bj_notes).map((n) => bullet(str(n))),
  );

  // Action items (as to-dos).
  section(
    blocks,
    "Action Items",
    asArray(brief.action_items).map((a) => {
      const r = asRecord(a);
      const who = str(r.owner_name) || str(r.owner_id) || "unassigned";
      const due = r.due ? ` (due ${str(r.due)})` : "";
      return todo(`[${who}]${due} ${str(r.task)}`);
    }),
  );

  return blocks;
}

const MAX_CHILDREN_PER_CALL = 100;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// ── Tool registration ────────────────────────────────────────────────────────

export function registerNotionComposerTools(server: McpServer): void {
  server.registerTool(
    "notion_publish_weekly_brief",
    {
      title: "Publish weekly brief to Notion (draft)",
      description:
        "Render a crm_weekly_brief_compose output as a DRAFT Notion page (H1 title + H2 section per part) under the workspace's Drafts/Super-BJ parent. Write-gated by super_bj.allow_notion_writes. Defaults parent to super_bj.notion_drafts_parent_id and template to super_bj.notion_weekly_template_id. Returns { page_id, url, status:'draft', partial_success? }.",
      inputSchema: S.notionPublishWeeklyBriefSchema,
    },
    async (input) => {
      let bearer: string;
      try {
        bearer = resolveBearerToken(input.bearer_token);
      } catch (e) {
        return mapError(e);
      }

      // Write-gate first — never touch Notion when writes are disabled.
      try {
        if (!(await areNotionWritesAllowed(bearer))) return err(WRITES_DISABLED_MSG);
      } catch (e) {
        return mapError(e);
      }

      let resolved;
      try {
        resolved = await getSuperBjResolved(bearer);
      } catch (e) {
        return mapError(e);
      }

      const parentPageId =
        (typeof input.parent_page_id === "string" && input.parent_page_id) ||
        resolved.notion_drafts_parent_id;
      if (!parentPageId) {
        return err(
          "No Notion drafts parent configured (super_bj.notion_drafts_parent_id). Set it in workspace settings or pass parent_page_id.",
        );
      }
      const templatePageId =
        (typeof input.template_page_id === "string" && input.template_page_id) ||
        resolved.notion_weekly_template_id;

      const brief = asRecord(input.brief);
      const weekEnding = str(brief.week_ending) || "this week";

      // Resolve Notion client (with one 401 retry).
      let client: NotionClient;
      try {
        const token = await getNotionAccessToken(bearer);
        client = new NotionClient(token);
      } catch (e) {
        return mapError(e);
      }

      // Best-effort: peek at the template to confirm it's reachable. We don't
      // hard-fail the publish if the template can't be read.
      if (templatePageId) {
        try {
          await client.getPage(templatePageId);
        } catch {
          // Template inspection is advisory only; ignore failures.
        }
      }

      const blocks = buildBriefBlocks(brief);
      const firstBatch = blocks.slice(0, MAX_CHILDREN_PER_CALL);
      const rest = blocks.slice(MAX_CHILDREN_PER_CALL);

      // Create the page with the first ≤100 blocks.
      let pageId: string;
      let url: string;
      try {
        const created = await client.createPage({
          parentPageId,
          title: `Weekly Sales Brief — ${weekEnding}`,
          blocks: firstBatch,
        });
        pageId = created.id;
        url = created.url;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (isAuthError(msg)) {
          // Token rotated mid-call — refetch once and retry the create.
          try {
            invalidateNotionToken(bearer);
            const fresh = await getNotionAccessToken(bearer);
            client = new NotionClient(fresh);
            const created = await client.createPage({
              parentPageId,
              title: `Weekly Sales Brief — ${weekEnding}`,
              blocks: firstBatch,
            });
            pageId = created.id;
            url = created.url;
          } catch (e2) {
            return mapError(e2);
          }
        } else {
          return mapError(e);
        }
      }

      // Append the remaining blocks in ≤100 chunks. A failed chunk → partial.
      let partialSuccess = false;
      if (rest.length > 0) {
        for (const batch of chunk(rest, MAX_CHILDREN_PER_CALL)) {
          try {
            await client.appendBlocks(pageId, batch);
          } catch {
            // The page exists with its earlier sections; flag the gap rather
            // than failing the whole publish.
            partialSuccess = true;
            break;
          }
        }
      }

      const result: Record<string, unknown> = {
        page_id: pageId,
        url,
        status: "draft",
      };
      if (partialSuccess) result.partial_success = true;
      return ok(result);
    },
  );
}

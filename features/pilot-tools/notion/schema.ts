import { z } from "zod";
import { withToken } from "../shared";

// A single Notion block is arbitrary JSON (e.g. { object:"block",
// type:"paragraph", paragraph:{ rich_text:[...] } }). We accept it as a
// pass-through record so callers can author any supported block type.
const notionBlockSchema = z
  .record(z.string(), z.unknown())
  .describe(
    "A Notion block JSON object (e.g. { object:'block', type:'heading_2', heading_2:{ rich_text:[{ text:{ content:'Hi' } }] } }). Passed through to the Notion API verbatim.",
  );

export const notionCreatePageSchema = z.object({
  ...withToken,
  parent_page_id: z
    .string()
    .min(1)
    .describe("Notion page id to create the new page under (its parent page)."),
  title: z.string().min(1).describe("Title of the new page."),
  blocks: z
    .array(notionBlockSchema)
    .optional()
    .describe(
      "Optional array of Notion block JSON objects to add as the page body. Notion caps children at 100 per call; extra blocks are appended automatically.",
    ),
});

export const notionAppendBlocksSchema = z.object({
  ...withToken,
  page_id: z
    .string()
    .min(1)
    .describe("Notion page (or block) id to append blocks to."),
  blocks: z
    .array(notionBlockSchema)
    .min(1)
    .describe(
      "Array of Notion block JSON objects to append. Chunked into ≤100-block requests automatically.",
    ),
});

export const notionGetPageSchema = z.object({
  ...withToken,
  page_id: z
    .string()
    .min(1)
    .describe("Notion page id to fetch (returns the page object plus all child blocks)."),
});

export const notionSearchPagesSchema = z.object({
  ...withToken,
  query: z
    .string()
    .min(1)
    .describe("Free-text query to search the workspace's pages by title/content."),
});

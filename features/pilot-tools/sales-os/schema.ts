import { z } from "zod";
import { withToken } from "../shared";

// Mirrors max-agent src/features/sales-os/core/crew-presence.ts
// (crewCheckInSchema, CREW_LIMITS), src/features/sales-os/server/sales-os-items.handler.ts
// (addBodySchema) and core/desktop-state.ts (SALES_OS_LIMITS, NOTE_COLORS,
// FOLDER_COLORS). No schema names a workspace or a member: the bearer decides
// both, and max-agent answers a workspace/user selector with 400.

// ── Crew ────────────────────────────────────────────────────────────────────

/** CREW_LIMITS.agentNameChars / activityChars: what the Crew widget shows. */
export const CREW_NAME_MAX = 40;
export const CREW_ACTIVITY_MAX = 120;

export const listSalesOsCrewSchema = z.object({
  ...withToken,
  include_ai: z
    .boolean()
    .optional()
    .describe("false lists people only. Default true: also Max, digital workers and connected agents."),
});

export const salesOsCrewCheckInSchema = z.object({
  ...withToken,
  name: z
    .string()
    .trim()
    .min(1)
    .max(CREW_NAME_MAX)
    .describe(
      "This agent's display name in the Crew widget (e.g. 'Research agent'). Keep it the same on every call: one entry per API key and name. Ignored with worker_id (the worker's own name shows).",
    ),
  state: z
    .enum(["active", "idle", "busy", "offline"])
    .optional()
    .describe("busy = working on something now; active (default) = around; idle = waiting; offline = done, remove the entry."),
  activity: z
    .string()
    .max(CREW_ACTIVITY_MAX)
    .optional()
    .describe("What it is doing, shown to the team (e.g. 'Researching Acme Corp'). Replaces the previous activity; omit to clear it."),
  worker_id: z
    .string()
    .uuid()
    .optional()
    .describe("Check in as this workspace's digital worker (UUID from list_digital_workers or list_sales_os_crew) instead of as a named agent."),
});

// ── Desktop ─────────────────────────────────────────────────────────────────

/** A desktop node id, or `root` for the desktop itself (sales-os-items.handler ID_PATTERN). */
const FOLDER_REF = /^[A-Za-z0-9_-]{1,64}$/;

const folderId = z
  .string()
  .regex(FOLDER_REF, "Invalid folder id")
  .optional();

export const NOTE_COLORS = ["yellow", "pink", "blue", "green", "purple", "orange", "graphite"] as const;
export const FOLDER_COLORS = [
  "blue",
  "indigo",
  "purple",
  "pink",
  "red",
  "orange",
  "yellow",
  "green",
  "teal",
  "graphite",
] as const;
const ITEM_COLORS = Array.from(new Set<string>([...NOTE_COLORS, ...FOLDER_COLORS])) as [string, ...string[]];

/** SALES_OS_LIMITS.noteLength / nameLength / hrefLength. */
export const NOTE_TEXT_MAX = 2000;
export const ITEM_NAME_MAX = 80;
export const HREF_MAX = 2048;

/** A Max route: one leading slash, no backslash or whitespace (isSafeInternalPath). */
const MAX_ROUTE = /^\/(?![/\\])[^\s\\]*$/;

export const listSalesOsDesktopItemsSchema = z.object({
  ...withToken,
  folder_id: folderId.describe("A folder's id from a previous listing, or 'root' (default) for the desktop itself."),
});

export const addSalesOsDesktopItemSchema = z.object({
  ...withToken,
  type: z
    .enum(["note", "shortcut", "folder"])
    .describe("note = sticky note (needs text); shortcut = link to a Max page (needs href); folder (needs name)."),
  text: z
    .string()
    .min(1)
    .max(NOTE_TEXT_MAX)
    .regex(/\S/, "A note needs some text")
    .optional()
    .describe("type note only: the note's text."),
  href: z
    .string()
    .trim()
    .min(1)
    .max(HREF_MAX)
    .regex(MAX_ROUTE, "href must be a Max route starting with a single / (for example /campaigns/42)")
    .optional()
    .describe("type shortcut only: the Max route to open, e.g. /campaigns/42 or /deals?deal=<id> (not a full URL)."),
  name: z
    .string()
    .trim()
    .min(1)
    .max(ITEM_NAME_MAX)
    .optional()
    .describe("type folder: required folder name. type shortcut: optional label (defaults to the page's name)."),
  color: z
    .enum(ITEM_COLORS)
    .optional()
    .describe(
      `type note: ${NOTE_COLORS.join("|")}. type folder: ${FOLDER_COLORS.join("|")}.`,
    ),
  folder_id: folderId.describe("Put it inside this folder (id from list_sales_os_desktop_items); omit or 'root' for the desktop."),
});

export type AddSalesOsDesktopItemInput = z.infer<typeof addSalesOsDesktopItemSchema>;

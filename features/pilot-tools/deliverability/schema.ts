import { z } from "zod";
import { withToken } from "../shared";

// Mirrors max-agent validation: deliverability.handler.ts, warmup.handler.ts
// (+ schemas/warmup.dto.ts) and mailpool.handler.ts (+ helpers/domain-validation.ts).

const DOMAIN_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;
const PREFIX_PATTERN = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/i;
const domain = z.string().trim().max(253).regex(DOMAIN_PATTERN, "Invalid domain");

const warmupId = z.string().uuid().describe("Warm-up UUID (from list_warmups)");

const warmupSettingsShape = {
  daily_target: z.number().int().min(1).max(100).describe("Warm-up emails per day at full ramp (1-100)"),
  ramp_up_days: z.number().int().min(1).max(180).describe("Days to ramp up to daily_target (1-180)"),
};

// ── Deliverability ──────────────────────────────────────────────────────────
export const listInboxPlacementsSchema = z.object({
  ...withToken,
  results: z.number().int().min(0).max(25).optional()
    .describe("Also return the full result of the N most recent completed checks (0-25, default 0)"),
});

export const getInboxPlacementSchema = z.object({
  ...withToken,
  id: z.string().regex(/^[A-Za-z0-9._-]{1,128}$/, "Invalid check id")
    .describe("Inbox placement check id (from list_inbox_placements)"),
});

export const getWarmupDeliverabilitySchema = z.object({ ...withToken });

// ── Warm-up ─────────────────────────────────────────────────────────────────
export const listWarmupsSchema = z.object({ ...withToken });

export const getWarmupPricingSchema = z.object({ ...withToken });

export const startWarmupSchema = z.object({
  ...withToken,
  emails: z.array(z.string().trim().max(254).email()).min(1).max(50)
    .describe("Done-for-you mailbox addresses to warm up (1-50; see list_warmups.eligible)"),
  settings: z.object(warmupSettingsShape).optional().describe("Defaults applied when omitted"),
});

export const updateWarmupSchema = z.object({
  ...withToken,
  id: warmupId,
  ...warmupSettingsShape,
});

export const cancelWarmupSchema = z.object({ ...withToken, id: warmupId });

export const resumeWarmupSchema = z.object({ ...withToken, id: warmupId });

export const syncWarmupSchema = z.object({ ...withToken, id: warmupId });

export const syncAllWarmupsSchema = z.object({ ...withToken });

// ── Mailpool ────────────────────────────────────────────────────────────────
export const listMailpoolDomainsSchema = z.object({ ...withToken });

export const searchMailpoolDomainsSchema = z.object({
  ...withToken,
  query: z.string().trim().min(2).max(253)
    .regex(/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/i, "Invalid characters")
    .describe("Base name to check, e.g. 'tryacme' or 'tryacme.com'"),
  tlds: z.array(z.string().trim().regex(/^\.[a-z]{2,24}$/i, "Invalid TLD")).min(1).max(10).optional()
    .describe("Domain endings with leading dot (default ['.com', '.org'])"),
});

export const getMailpoolPricingSchema = z.object({ ...withToken });

export const listMailpoolOrdersSchema = z.object({ ...withToken });

export const createMailpoolOrderSchema = z.object({
  ...withToken,
  domains: z.array(domain).min(1).max(50)
    .describe("Domains for the order (1-50). Available ones are bought; ones the workspace already owns are reused"),
  redirect_domain: domain.optional().describe("Where web traffic to the new domains redirects (usually the main site)"),
  provider: z.enum(["google", "microsoft"]).optional().describe("Mailbox provider (default google)"),
  first_name: z.string().trim().min(1).max(100).describe("Sender first name set on every mailbox"),
  last_name: z.string().trim().min(1).max(100).describe("Sender last name set on every mailbox"),
  mailboxes: z.array(z.object({
    domain: domain.describe("One of `domains`"),
    prefix: z.string().trim().min(1).max(64).regex(PREFIX_PATTERN, "Invalid email prefix")
      .describe("Local part before the @"),
  })).min(1).max(200).describe("Mailboxes to create (1-200)"),
});

export const syncMailpoolOrderSchema = z.object({
  ...withToken,
  id: z.string().uuid().describe("Order UUID (from list_mailpool_orders)"),
});

import { z } from "zod";
import { withToken } from "../shared";

export const listAccountsSchema = z.object({ ...withToken });

export const getAccountSchema = z.object({
  ...withToken,
  id: z.string().uuid().describe("Account UUID"),
});

/**
 * Signature appended by Max to outbound email from this account. Mail is sent
 * through the provider API, which never applies the mailbox's own
 * Gmail/Outlook signature — this is the only signature a recipient sees.
 */
const emailSignatureSchema = z.object({
  enabled: z.boolean().optional().describe("Off by default; nothing is appended until true"),
  mode: z.enum(["template", "html"]).optional().describe("'template' renders a preset from fields; 'html' sends html verbatim (sanitized)"),
  template_id: z.enum(["name_only", "minimal", "professional", "full"]).optional()
    .describe("Preset layout. name_only/minimal emit no links, professional up to 2, full up to 4 — cold outreach tolerates ~2"),
  fields: z.object({
    full_name: z.string().max(120).optional(),
    job_title: z.string().max(120).optional(),
    company: z.string().max(120).optional(),
    phone: z.string().max(40).optional(),
    website: z.string().max(300).optional(),
    linkedin_url: z.string().max(300).optional(),
    booking_url: z.string().max(300).optional(),
  }).optional().describe("Values the selected preset renders; fields outside it are dropped"),
  html: z.string().max(20_000).optional().describe("Custom-HTML mode only; sanitized server-side"),
  text: z.string().max(4_000).optional().describe("Plain-text counterpart for custom HTML; derived from html when omitted"),
});

export const updateAccountSchema = z.object({
  ...withToken,
  id: z.string().uuid().describe("Account UUID"),
  config: z.object({
    sender_name: z.string().optional(),
    timezone: z.string().optional(),
    working_hours: z.object({
      start_hour: z.number().int().min(0).max(23),
      end_hour: z.number().int().min(0).max(23),
    }).optional(),
    signature: emailSignatureSchema.optional().describe("Email accounts only"),
  }).describe("Account config to update"),
});

export const disconnectAccountSchema = z.object({
  ...withToken,
  account_id: z.string().uuid().describe("Account UUID to disconnect"),
});

export const getAccountRateLimitsSchema = z.object({
  ...withToken,
  id: z.string().uuid().describe("Account UUID"),
});

export const updateAccountRateLimitSchema = z.object({
  ...withToken,
  id: z.string().uuid().describe("Rate-limit row UUID"),
  daily_limit: z.number().int().min(0).optional().describe("Daily sending cap"),
  weekly_limit: z.number().int().min(0).optional().describe("Weekly sending cap"),
});

export const hostedAuthLinkSchema = z.object({
  ...withToken,
  type: z.enum(["create", "reconnect"]).describe("'create' for new, 'reconnect' for existing"),
  reconnect_account_id: z.string().uuid().optional().describe("Required when type=reconnect"),
  providers: z.array(z.enum(["LINKEDIN", "GOOGLE", "GOOGLE_OAUTH", "OUTLOOK", "MAIL"])).optional().describe("Whitelist of providers"),
  success_redirect_url: z.string().optional(),
  failure_redirect_url: z.string().optional(),
});

import { z } from "zod";
import { withToken } from "../shared";

export const listAccountsSchema = z.object({ ...withToken });

export const getAccountSchema = z.object({
  ...withToken,
  id: z.string().uuid().describe("Account UUID"),
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

import { z } from "zod";
import { withToken } from "../shared";

// Inbox Autopilot: configure the per-workspace autopilot setting (master kill
// switch, mode, daily cap), review the replies it has drafted, and approve /
// reject those drafts (approve sends the reply in-thread). Also a manual
// trigger to classify a single inbound message on demand. All schemas mirror
// the max-agent /api/v1/inbox/* route contracts.

const modeSchema = z
  .enum(["auto_safe", "draft_all", "off"])
  .describe(
    "Autopilot mode. 'auto_safe' = auto-send only safe high-confidence replies (interested/meeting_request, confidence>=0.75) under the daily cap, draft the rest. 'draft_all' = always draft, never auto-send. 'off' = do nothing (incoming messages are suppressed).",
  );

export const setInboxAutopilotSchema = z.object({
  ...withToken,
  enabled: z
    .boolean()
    .describe(
      "Master toggle / kill switch. When false, autopilot does nothing regardless of mode. Auto-send requires this to be true.",
    ),
  mode: modeSchema,
  daily_cap: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe(
      "Maximum number of auto-sends per UTC day (mode 'auto_safe' only). Absent leaves the existing cap unchanged (defaults to 50 when never set).",
    ),
});

export const getInboxAutopilotStatusSchema = z.object({
  ...withToken,
});

export const listInboxDraftsSchema = z.object({
  ...withToken,
});

export const approveInboxDraftSchema = z.object({
  ...withToken,
  action_id: z
    .string()
    .uuid()
    .describe("InboxAutopilotAction UUID of the draft to approve and send."),
  body: z
    .string()
    .optional()
    .describe(
      "Optional edited reply to send instead of the stored draft body. Omit to send the draft as-is.",
    ),
});

export const rejectInboxDraftSchema = z.object({
  ...withToken,
  action_id: z
    .string()
    .uuid()
    .describe("InboxAutopilotAction UUID of the draft to reject (no reply is sent)."),
});

export const processInboxMessageSchema = z.object({
  ...withToken,
  message_id: z
    .string()
    .describe(
      "Provider message id of the inbound email to classify and act on now (manual trigger). Honors the workspace autopilot setting: may auto-send, draft, or suppress.",
    ),
});

import { z } from "zod";
import { withToken } from "../shared";

export const simulateAccountConnectedSchema = z.object({
  ...withToken,
  account_id: z.string().describe("Unipile provider account_id"),
  status: z.string().describe("e.g. CREATION_SUCCESS, RECONNECTED"),
  name: z.string().describe("Account name or email"),
  account_type: z.string().optional().describe("e.g. LINKEDIN, GOOGLE_OAUTH"),
});

export const simulateAccountStatusSchema = z.object({
  ...withToken,
  account_id: z.string().describe("Unipile provider account_id"),
  message: z.string().describe("e.g. OK, CREDENTIALS, ERROR, CONNECTING, STOPPED, DELETED, SYNC_SUCCESS"),
  account_type: z.string().optional(),
});

export const simulateNewEmailSchema = z.object({
  ...withToken,
  account_id: z.string().describe("Unipile provider account_id of the receiving account"),
  email_id: z.string().describe("Unipile email ID"),
  from_identifier: z.string().describe("Sender email address"),
  from_display_name: z.string().optional(),
  to_identifier: z.string().describe("Recipient email address"),
  subject: z.string().optional(),
  text: z.string().optional().describe("Plain-text body"),
  html: z.string().optional().describe("HTML body"),
  thread_id: z.string().optional().describe("Unipile thread ID for threading"),
  in_reply_to: z.string().optional().describe("Message ID this email replies to"),
});

export const simulateEmailTrackingSchema = z.object({
  ...withToken,
  event: z.enum(["mail_opened", "mail_link_clicked"]).describe("Tracking event type"),
  label: z.string().optional().describe("Format: execution_state_id:node_id — links event to campaign execution"),
  account_id: z.string().optional(),
  tracking_id: z.string().optional(),
  email_id: z.string().optional(),
  url: z.string().optional().describe("Clicked URL (for mail_link_clicked)"),
  ip: z.string().optional(),
});

export const simulateLinkedinMessagingSchema = z.object({
  ...withToken,
  account_id: z.string().describe("Unipile provider account_id"),
  event: z.enum(["message_received", "message_read", "message_delivered", "message_reaction", "message_edited", "message_deleted"]),
  chat_id: z.string().describe("Unipile chat/conversation ID"),
  message_id: z.string().describe("Unipile message ID"),
  message: z.string().optional().describe("Message text (for message_received)"),
  sender_id: z.string().optional().describe("Sender provider ID"),
});

export const simulateNewRelationSchema = z.object({
  ...withToken,
  account_id: z.string().describe("Unipile provider account_id of the LinkedIn account that received the connection"),
  user_provider_id: z.string().describe("LinkedIn provider ID of the user who accepted"),
  user_public_identifier: z.string().optional().describe("LinkedIn public slug e.g. jean-dupont-123"),
  user_full_name: z.string().optional(),
  user_profile_url: z.string().optional(),
});

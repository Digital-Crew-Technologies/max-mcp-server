import type { McpServer } from "../shared";
import { fetchWithRetry, apiUrl, responseBodyText } from "../shared";
import * as repo from "./repository";
import * as S from "./schema";

async function callWebhook(fn: () => Promise<Response>) {
  try {
    const res = await fn();
    const text = await responseBodyText(res);
    if (!res.ok) {
      return { content: [{ type: "text" as const, text: `Webhook error (${res.status}): ${text || res.statusText}` }] };
    }
    return { content: [{ type: "text" as const, text }] };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { content: [{ type: "text" as const, text: `Error: ${msg}` }] };
  }
}

export function registerWebhookTools(server: McpServer): void {
  server.registerTool("simulate_account_connected", {
    title: "Simulate account-connected webhook",
    description: "Fire a Unipile account-connected webhook event. Use to test the handler that creates/updates an account record when Unipile finishes connecting.",
    inputSchema: S.simulateAccountConnectedSchema,
  }, async (input) =>
    callWebhook(() => repo.simulateAccountConnected({
      account_id: input.account_id,
      status: input.status,
      name: input.name,
      account_type: input.account_type,
    })));

  server.registerTool("simulate_account_status", {
    title: "Simulate account-status webhook",
    description: "Fire a Unipile account-status webhook. Use to test status changes (OK, CREDENTIALS, ERROR, CONNECTING, STOPPED). Useful for verifying that disconnected accounts are flagged correctly.",
    inputSchema: S.simulateAccountStatusSchema,
  }, async (input) =>
    callWebhook(() => repo.simulateAccountStatus({
      account_id: input.account_id,
      message: input.message,
      account_type: input.account_type,
    })));

  server.registerTool("simulate_new_email", {
    title: "Simulate new-email webhook",
    description: "Fire a Unipile mail_received webhook. Use to test inbound email handling — reply detection, chat thread creation, and campaign execution advancement.",
    inputSchema: S.simulateNewEmailSchema,
  }, async (input) =>
    callWebhook(() => repo.simulateNewEmail({
      account_id: input.account_id,
      email_id: input.email_id,
      from_identifier: input.from_identifier,
      from_display_name: input.from_display_name,
      to_identifier: input.to_identifier,
      subject: input.subject,
      text: input.text,
      html: input.html,
      thread_id: input.thread_id,
      in_reply_to: input.in_reply_to,
    })));

  server.registerTool("simulate_email_tracking", {
    title: "Simulate email-tracking webhook",
    description: "Fire a Unipile mail_opened or mail_link_clicked tracking event. Pass label as 'execution_state_id:node_id' to link the event to a campaign execution and increment open/click counts.",
    inputSchema: S.simulateEmailTrackingSchema,
  }, async (input) =>
    callWebhook(() => repo.simulateEmailTracking({
      event: input.event,
      label: input.label,
      account_id: input.account_id,
      tracking_id: input.tracking_id,
      email_id: input.email_id,
      url: input.url,
      ip: input.ip,
    })));

  server.registerTool("simulate_linkedin_messaging", {
    title: "Simulate LinkedIn messaging webhook",
    description: "Fire a Unipile LinkedIn messaging event (message_received, message_read, message_delivered, etc.). Use to test reply detection and campaign execution advancement on LinkedIn.",
    inputSchema: S.simulateLinkedinMessagingSchema,
  }, async (input) =>
    callWebhook(() => repo.simulateLinkedinMessaging({
      account_id: input.account_id,
      event: input.event,
      chat_id: input.chat_id,
      message_id: input.message_id,
      message: input.message,
      sender_id: input.sender_id,
    })));

  server.registerTool("simulate_new_relation", {
    title: "Simulate LinkedIn new-relation webhook",
    description: "Fire a Unipile new_relation event (LinkedIn invitation accepted). Use to test that the connection record is updated and any waiting campaign executions are advanced.",
    inputSchema: S.simulateNewRelationSchema,
  }, async (input) =>
    callWebhook(() => repo.simulateNewRelation({
      account_id: input.account_id,
      user_provider_id: input.user_provider_id,
      user_public_identifier: input.user_public_identifier,
      user_full_name: input.user_full_name,
      user_profile_url: input.user_profile_url,
    })));
}

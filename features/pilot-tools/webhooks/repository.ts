import { apiUrl, fetchWithRetry } from "../shared";

const jsonPost = (url: string, body: unknown): Promise<Response> =>
  fetchWithRetry(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

export async function simulateAccountConnected(params: {
  account_id: string;
  status: string;
  name: string;
  account_type?: string;
}): Promise<Response> {
  return jsonPost(apiUrl("/api/v1/unipile/webhook/account-connected"), {
    account_id: params.account_id,
    status: params.status,
    name: params.name,
    ...(params.account_type && { account_type: params.account_type }),
  });
}

export async function simulateAccountStatus(params: {
  account_id: string;
  message: string;
  account_type?: string;
}): Promise<Response> {
  return jsonPost(apiUrl("/api/v1/unipile/webhook/account-status"), {
    AccountStatus: {
      account_id: params.account_id,
      message: params.message,
      ...(params.account_type && { account_type: params.account_type }),
    },
  });
}

export async function simulateNewEmail(params: {
  account_id: string;
  email_id: string;
  from_identifier: string;
  from_display_name?: string;
  to_identifier: string;
  subject?: string;
  text?: string;
  html?: string;
  thread_id?: string;
  in_reply_to?: string;
}): Promise<Response> {
  return jsonPost(apiUrl("/api/v1/unipile/webhook/email-events/new-email"), {
    event: "mail_received",
    email_id: params.email_id,
    account_id: params.account_id,
    from_attendee: {
      identifier: params.from_identifier,
      display_name: params.from_display_name,
    },
    to_attendees: [{ identifier: params.to_identifier }],
    subject: params.subject,
    text: params.text,
    html: params.html,
    thread_id: params.thread_id,
    in_reply_to: params.in_reply_to,
    date: new Date().toISOString(),
  });
}

export async function simulateEmailTracking(params: {
  event: "mail_opened" | "mail_link_clicked";
  label?: string;
  account_id?: string;
  tracking_id?: string;
  email_id?: string;
  url?: string;
  ip?: string;
}): Promise<Response> {
  return jsonPost(apiUrl("/api/v1/unipile/webhook/email-events/tracking-email"), {
    event: params.event,
    label: params.label,
    account_id: params.account_id,
    tracking_id: params.tracking_id,
    email_id: params.email_id,
    url: params.url,
    ip: params.ip,
    date: new Date().toISOString(),
  });
}

export async function simulateLinkedinMessaging(params: {
  account_id: string;
  event: string;
  chat_id: string;
  message_id: string;
  message?: string;
  sender_id?: string;
}): Promise<Response> {
  return jsonPost(apiUrl("/api/v1/unipile/webhook/linkedin-events/messaging"), {
    account_id: params.account_id,
    event: params.event,
    chat_id: params.chat_id,
    message_id: params.message_id,
    ...(params.message && { message: params.message }),
    ...(params.sender_id && { sender: { id: params.sender_id } }),
  });
}

export async function simulateNewRelation(params: {
  account_id: string;
  user_provider_id: string;
  user_public_identifier?: string;
  user_full_name?: string;
  user_profile_url?: string;
}): Promise<Response> {
  return jsonPost(apiUrl("/api/v1/unipile/webhook/linkedin-events/new-relation"), {
    event: "new_relation",
    account_id: params.account_id,
    user_provider_id: params.user_provider_id,
    user_public_identifier: params.user_public_identifier,
    user_full_name: params.user_full_name,
    user_profile_url: params.user_profile_url,
  });
}

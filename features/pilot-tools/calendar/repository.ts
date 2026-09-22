import { apiUrl, authHeaders, buildQuery, fetchWithRetry } from "../shared";

// All calendar calls go through max-agent's /api/v1/calendar/* routes. That
// layer holds the workspace's stored Cal.com credentials (base_url + api_key)
// and enforces workspace scoping via the auth gate (JWT or API key + scope), so
// the MCP server only needs the user's standard bearer token — same auth model
// as prospects, Claire, enrichment, intent, etc. The synced Google/Outlook
// calendar calls (/api/v1/calendar-sync/*, /calendar/team-availability) at the
// bottom of this file are a separate Unipile-backed integration and need no
// Cal.com connection.
//
// connect_calendar and book are the heavy ones: max-agent calls out to the
// remote Cal.com instance (listEventTypes validation / createBooking), so give
// them a longer timeout. book disables retries so a transient blip never
// double-books the slot.

const CALCOM_TIMEOUT_MS = 60_000;
const CALCOM_CONFIG = { timeoutMs: CALCOM_TIMEOUT_MS };
// Booking is a single mutating call to Cal.com — no retries so we never create
// two bookings for the same slot if the first response is slow.
const BOOK_CONFIG = { timeoutMs: CALCOM_TIMEOUT_MS, maxRetries: 0 };

export async function connectCalendar(
  token: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(
    apiUrl(`/api/v1/calendar/connection`),
    {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(body),
    },
    CALCOM_CONFIG,
  );
}

export async function getConnection(token: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/calendar/connection`), {
    headers: authHeaders(token),
  });
}

export async function getAvailability(
  token: string,
  params: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(
    apiUrl(`/api/v1/calendar/availability${buildQuery(params)}`),
    { headers: authHeaders(token) },
    CALCOM_CONFIG,
  );
}

export async function proposeTimes(
  token: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(
    apiUrl(`/api/v1/calendar/propose-times`),
    {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(body),
    },
    CALCOM_CONFIG,
  );
}

export async function bookMeeting(
  token: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(
    apiUrl(`/api/v1/calendar/book`),
    {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(body),
    },
    BOOK_CONFIG,
  );
}

export async function bookingLink(
  token: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/calendar/booking-link`), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

export async function getUpcomingMeetings(
  token: string,
  params: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(
    apiUrl(`/api/v1/calendar/meetings${buildQuery(params)}`),
    { headers: authHeaders(token) },
  );
}

export async function cancelMeeting(
  token: string,
  id: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(
    apiUrl(`/api/v1/calendar/meetings/${encodeURIComponent(id)}/cancel`),
    {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(body),
    },
    CALCOM_CONFIG,
  );
}

// ---------------------------------------------------------------------------
// Booking lifecycle on recorded Cal.com meetings (meetings.id UUID path param).
// These call Cal.com, which notifies the attendee. Reschedule and cancel-series
// are not idempotent (a retried reschedule could move the booking twice), so
// they never retry.
// ---------------------------------------------------------------------------

const LIFECYCLE_NO_RETRY = { timeoutMs: CALCOM_TIMEOUT_MS, maxRetries: 0 };

function meetingPath(id: string, action: string): string {
  return `/api/v1/calendar/meetings/${encodeURIComponent(id)}/${action}`;
}

async function postMeetingAction(
  token: string,
  id: string,
  action: string,
  body: Record<string, unknown>,
  config: { timeoutMs: number; maxRetries?: number },
): Promise<Response> {
  return fetchWithRetry(
    apiUrl(meetingPath(id, action)),
    { method: "POST", headers: authHeaders(token), body: JSON.stringify(body) },
    config,
  );
}

export async function confirmMeeting(token: string, id: string): Promise<Response> {
  return postMeetingAction(token, id, "confirm", {}, CALCOM_CONFIG);
}

export async function declineMeeting(
  token: string,
  id: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return postMeetingAction(token, id, "decline", body, CALCOM_CONFIG);
}

export async function rescheduleMeeting(
  token: string,
  id: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return postMeetingAction(token, id, "reschedule", body, LIFECYCLE_NO_RETRY);
}

export async function cancelMeetingSeries(
  token: string,
  id: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return postMeetingAction(token, id, "cancel-series", body, LIFECYCLE_NO_RETRY);
}

export async function updateMeetingAttendance(
  token: string,
  id: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return postMeetingAction(token, id, "attendance", body, CALCOM_CONFIG);
}

// ---------------------------------------------------------------------------
// Synced Google / Outlook calendars (via Unipile) — /api/v1/calendar-sync/*
// and the team free/busy read built on them. Independent of Cal.com.
// ---------------------------------------------------------------------------

// sync-now fans out over every calendar of every account (maxDuration=300 on
// the route). Long timeout, no retries — a retry would just queue a second
// provider sweep behind the first.
const SYNC_NOW_CONFIG = { timeoutMs: 290_000, maxRetries: 0 };
// Creating a provider event is not idempotent: a retry after a slow success
// would put a duplicate event (and duplicate invites) on the calendar.
const PROVIDER_TIMEOUT_MS = 60_000;
const PROVIDER_CONFIG = { timeoutMs: PROVIDER_TIMEOUT_MS };
const CREATE_EVENT_CONFIG = { timeoutMs: PROVIDER_TIMEOUT_MS, maxRetries: 0 };

export async function getTeamAvailability(
  token: string,
  params: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(
    apiUrl(`/api/v1/calendar/team-availability${buildQuery(params)}`),
    { headers: authHeaders(token) },
  );
}

export async function listSyncedAccounts(token: string): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/calendar-sync/accounts`), {
    headers: authHeaders(token),
  });
}

export async function disconnectSyncedAccount(
  token: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(apiUrl(`/api/v1/calendar-sync/accounts/disconnect`), {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

export async function syncCalendarsNow(
  token: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(
    apiUrl(`/api/v1/calendar-sync/sync-now`),
    { method: "POST", headers: authHeaders(token), body: JSON.stringify(body) },
    SYNC_NOW_CONFIG,
  );
}

export async function createCalendarEvent(
  token: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(
    apiUrl(`/api/v1/calendar-sync/events`),
    { method: "POST", headers: authHeaders(token), body: JSON.stringify(body) },
    CREATE_EVENT_CONFIG,
  );
}

export async function updateCalendarEvent(
  token: string,
  eventId: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(
    apiUrl(`/api/v1/calendar-sync/events/${encodeURIComponent(eventId)}`),
    { method: "PATCH", headers: authHeaders(token), body: JSON.stringify(body) },
    PROVIDER_CONFIG,
  );
}

// DELETE carries its account_id in the JSON body — that is max-agent's contract
// (events.handler.ts deleteBodySchema), not a query param.
export async function deleteCalendarEvent(
  token: string,
  eventId: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetchWithRetry(
    apiUrl(`/api/v1/calendar-sync/events/${encodeURIComponent(eventId)}`),
    { method: "DELETE", headers: authHeaders(token), body: JSON.stringify(body) },
    PROVIDER_CONFIG,
  );
}

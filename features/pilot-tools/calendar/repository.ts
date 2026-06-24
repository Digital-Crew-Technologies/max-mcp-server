import { apiUrl, authHeaders, buildQuery, fetchWithRetry } from "../shared";

// All calendar calls go through max-agent's /api/v1/calendar/* routes. That
// layer holds the workspace's stored Cal.com credentials (base_url + api_key)
// and enforces workspace scoping via the auth gate (JWT or API key + scope), so
// the MCP server only needs the user's standard bearer token — same auth model
// as prospects, Claire, enrichment, intent, etc.
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
    apiUrl(`/api/v1/calendar/meetings/${id}/cancel`),
    {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(body),
    },
    CALCOM_CONFIG,
  );
}

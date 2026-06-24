import { callApi, strip, type McpServer } from "../shared";
import * as repo from "./repository";
import * as S from "./schema";

// Calendar / Cal.com tools. The workspace connects its own self-hosted Cal.com
// instance, then Max can read availability, propose soonest times, book
// meetings, share the rep's public booking link, list upcoming meetings, and
// cancel them. All tools proxy max-agent's /api/v1/calendar/* routes with the
// user's standard bearer token (workspace-scoped by the auth gate).
//
// SECURITY: connect_calendar takes an api_key, but the api_key is NEVER echoed
// back in any tool output — max-agent stores it and never returns it.

export function registerCalendarTools(server: McpServer): void {
  server.registerTool(
    "connect_calendar",
    {
      title: "Connect the workspace's Cal.com instance",
      description:
        "Connect the workspace's self-hosted Cal.com instance so Max can read availability and book meetings. Validates the credentials by calling Cal.com listEventTypes before storing them. Pass base_url (the instance API base, e.g. https://cal.example.com or .../api/v2), api_key, and optionally default_event_type_id. Returns {data: CalendarStatus} with connected:true, baseUrl, username, label, defaultEventTypeId, and the list of eventTypes. The api_key is never returned.",
      inputSchema: S.connectCalendarSchema,
    },
    async (input) =>
      callApi(input.bearer_token, (t) =>
        repo.connectCalendar(t, strip(input, "bearer_token")),
      ),
  );

  server.registerTool(
    "calendar_status",
    {
      title: "Get Cal.com connection status",
      description:
        "Return the workspace's Cal.com connection status. Returns {data: {connected: false}} when no instance is connected, or {data: CalendarStatus} (baseUrl, username, label, defaultEventTypeId, eventTypes) when connected. eventTypes may be [] if the instance is currently unreachable. The api_key is never returned.",
      inputSchema: S.calendarStatusSchema,
    },
    async (input) => callApi(input.bearer_token, (t) => repo.getConnection(t)),
  );

  server.registerTool(
    "get_availability",
    {
      title: "Get Cal.com availability",
      description:
        "Fetch open booking slots for an event type, grouped by date. event_type_id defaults to the connection's default event type; start defaults to now and end to now + 14 days; time_zone is an optional IANA string to localize slots. Returns {data: {eventTypeId, slotsByDate: {<YYYY-MM-DD>: [{start, end?}]}}}. Fails with 409 if no calendar is connected, or 400 if no event type id is available.",
      inputSchema: S.getAvailabilitySchema,
    },
    async (input) =>
      callApi(input.bearer_token, (t) =>
        repo.getAvailability(t, strip(input, "bearer_token")),
      ),
  );

  server.registerTool(
    "propose_times",
    {
      title: "Propose the soonest available times",
      description:
        "Return the n soonest available slots as a flat list — handy for offering a prospect a few concrete times. count is 1-50 (default 3); event_type_id defaults to the connection's default event type; time_zone is an optional IANA string. Returns {data: {eventTypeId, slots: [{start, end?}]}}. Fails with 409 if no calendar is connected.",
      inputSchema: S.proposeTimesSchema,
    },
    async (input) =>
      callApi(input.bearer_token, (t) =>
        repo.proposeTimes(t, strip(input, "bearer_token")),
      ),
  );

  server.registerTool(
    "book_meeting",
    {
      title: "Book a Cal.com meeting",
      description:
        "Create a Cal.com booking and record it as a meeting. event_type_id defaults to the connection's default event type; start is a required ISO8601 UTC time; attendee_name, attendee_email, and attendee_time_zone (IANA) describe the attendee. Optionally pass prospect_id (advances that prospect to 'replied'), campaign_id, and a flat string metadata map. Returns the created {data: meeting row} (calcom_booking_uid, meeting_url, status 'scheduled', etc.). Fails with 409 (no calendar connected), 400 (invalid body / no default event type), or 4xx/502 CALCOM_ERROR (e.g. slot conflict / instance unreachable).",
      inputSchema: S.bookMeetingSchema,
    },
    async (input) =>
      callApi(input.bearer_token, (t) =>
        repo.bookMeeting(t, {
          ...strip(
            input,
            "bearer_token",
            "attendee_name",
            "attendee_email",
            "attendee_time_zone",
          ),
          attendee: {
            name: input.attendee_name,
            email: input.attendee_email,
            time_zone: input.attendee_time_zone,
          },
        }),
      ),
  );

  server.registerTool(
    "send_booking_link",
    {
      title: "Get the rep's public Cal.com booking link",
      description:
        "Compose the rep's public Cal.com booking link so it can be shared with a prospect. Does NOT call Cal.com. Optionally pass prospect_id for context. Returns {data: {url, username}}. Fails with 409 if no calendar is connected.",
      inputSchema: S.sendBookingLinkSchema,
    },
    async (input) =>
      callApi(input.bearer_token, (t) =>
        repo.bookingLink(t, strip(input, "bearer_token")),
      ),
  );

  server.registerTool(
    "get_upcoming_meetings",
    {
      title: "List upcoming meetings",
      description:
        "List upcoming non-cancelled meetings ordered by start time ascending. from defaults to now and to defaults to now + 30 days (both ISO8601). Returns {data: meeting row[]} (status one of scheduled|rescheduled|completed|no_show).",
      inputSchema: S.getUpcomingMeetingsSchema,
    },
    async (input) =>
      callApi(input.bearer_token, (t) =>
        repo.getUpcomingMeetings(t, strip(input, "bearer_token")),
      ),
  );

  server.registerTool(
    "cancel_meeting",
    {
      title: "Cancel a recorded meeting",
      description:
        "Cancel a recorded meeting by its meetings.id UUID. If the meeting has a Cal.com booking uid it is cancelled on Cal.com first, then the row is marked cancelled. Optionally pass a reason. Returns the updated {data: meeting row} with status 'cancelled'. Fails with 404 (unknown / not in this workspace), 409 (no calendar connected, only when a Cal.com cancel is needed), or 4xx/502 CALCOM_ERROR.",
      inputSchema: S.cancelMeetingSchema,
    },
    async (input) =>
      callApi(input.bearer_token, (t) =>
        repo.cancelMeeting(t, input.meeting_id, strip(input, "bearer_token", "meeting_id")),
      ),
  );
}

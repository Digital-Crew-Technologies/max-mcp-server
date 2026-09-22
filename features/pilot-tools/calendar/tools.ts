import { callApi, strip, toolHints, type McpServer } from "../shared";
import * as repo from "./repository";
import * as S from "./schema";

// Calendar tools. Two integrations:
//   • Cal.com — the workspace connects its own self-hosted Cal.com instance,
//     then Max can read availability, propose soonest times, book meetings,
//     share the rep's public booking link, list upcoming meetings, and run the
//     booking lifecycle (confirm / decline / reschedule / cancel / cancel
//     series / attendance). Proxies /api/v1/calendar/*.
//   • Synced Google/Outlook calendars (Unipile) — list/disconnect accounts,
//     sync now, create/update/delete provider events, team free/busy. Proxies
//     /api/v1/calendar-sync/* and /api/v1/calendar/team-availability.
// All tools forward the caller's bearer token (workspace-scoped by the gate).
//
// NOT exposed (max-agent rejects workspace API keys on them): Cal.com
// event-type / schedule / team configuration (admin JWT only), the calendar
// overlay (JWT only), and the Google/Microsoft calendar connect flows (need a
// signed-in user to own the grant).
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
      ...toolHints.readOnly,
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
      ...toolHints.readOnly,
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
        "Create a Cal.com booking and record it as a meeting. event_type_id defaults to the connection's default event type; start is a required ISO8601 UTC time; attendee_name, attendee_email, and attendee_time_zone (IANA) describe the attendee. Optionally pass recurrence_count (recurring event types), prospect_id (advances that prospect to 'replied'), campaign_id, and a flat string metadata map. Returns the created {data: meeting row} (calcom_booking_uid, meeting_url, status 'scheduled', etc.). Fails with 409 (no calendar connected), 400 (invalid body / no default event type), or 4xx/502 CALCOM_ERROR (e.g. slot conflict / instance unreachable).",
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
        "Compose the rep's public Cal.com booking link so it can be shared with a prospect. Does NOT call Cal.com. Optionally pass event_type_id (defaults to the connection's default) and prospect_id for context. Returns {data: {url, bookingLink, username}}. Fails with 409 if no calendar is connected.",
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
        "List upcoming meetings (excluding cancelled/rejected) ordered by start time ascending. from defaults to now and to defaults to now + 30 days (both ISO8601). Returns {data: meeting row[]} (status one of pending|scheduled|rescheduled|completed|no_show; pending = awaiting confirm_meeting / decline_meeting).",
      inputSchema: S.getUpcomingMeetingsSchema,
      ...toolHints.readOnly,
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
        "Cancel a recorded meeting by its meetings.id UUID. If the meeting has a Cal.com booking uid it is cancelled on Cal.com first, then the row is marked cancelled. Optionally pass a reason. Irreversible; Cal.com notifies the attendee. Returns the updated {data: meeting row} with status 'cancelled'. Fails with 404 (unknown / not in this workspace), 409 (no calendar connected, only when a Cal.com cancel is needed), or 4xx/502 CALCOM_ERROR.",
      inputSchema: S.cancelMeetingSchema,
      ...toolHints.destructive,
    },
    async (input) =>
      callApi(input.bearer_token, (t) =>
        repo.cancelMeeting(t, input.meeting_id, strip(input, "bearer_token", "meeting_id")),
      ),
  );

  // ── Cal.com booking lifecycle ───────────────────────────────────────────

  server.registerTool(
    "confirm_meeting",
    {
      title: "Confirm a pending booking request",
      description:
        "Accept a pending Cal.com booking request (status 'pending' in get_upcoming_meetings) by meeting_id. Cal.com notifies the attendee. Returns {data: meeting row} with status 'scheduled'; 409 MEETING_LIFECYCLE_CONFLICT if the meeting is not pending.",
      inputSchema: S.confirmMeetingSchema,
    },
    async (input) =>
      callApi(input.bearer_token, (t) => repo.confirmMeeting(t, input.meeting_id)),
  );

  server.registerTool(
    "decline_meeting",
    {
      title: "Decline a pending booking request",
      description:
        "Reject a pending Cal.com booking request by meeting_id, with an optional reason. Irreversible; Cal.com notifies the attendee. Returns {data: meeting row} with status 'rejected'; 409 if the meeting is not pending.",
      inputSchema: S.declineMeetingSchema,
      ...toolHints.destructive,
    },
    async (input) =>
      callApi(input.bearer_token, (t) =>
        repo.declineMeeting(t, input.meeting_id, strip(input, "bearer_token", "meeting_id")),
      ),
  );

  server.registerTool(
    "reschedule_meeting",
    {
      title: "Reschedule a Cal.com meeting",
      description:
        "Move a scheduled Cal.com meeting (meeting_id) to new_start (future ISO8601; check get_availability first), with an optional reason. Cal.com emails the attendee the new time. Returns {data: meeting row} with status 'rescheduled' and a new calcom_booking_uid; 409 if the meeting is not active or its event type forbids rescheduling.",
      inputSchema: S.rescheduleMeetingSchema,
    },
    async (input) =>
      callApi(input.bearer_token, (t) =>
        repo.rescheduleMeeting(t, input.meeting_id, {
          start: input.new_start,
          ...(input.reason !== undefined ? { reason: input.reason } : {}),
        }),
      ),
  );

  server.registerTool(
    "cancel_meeting_series",
    {
      title: "Cancel a recurring meeting series",
      description:
        "Cancel a recurring Cal.com series from one occurrence (meeting_id): scope 'remaining' (this and later occurrences) or 'series' (all), optional reason. Irreversible; Cal.com notifies every attendee. Returns {data: meeting row, meta: {scope, occurrence_count}}; 409 if the meeting is not part of a recurring series.",
      inputSchema: S.cancelMeetingSeriesSchema,
      ...toolHints.destructive,
    },
    async (input) =>
      callApi(input.bearer_token, (t) =>
        repo.cancelMeetingSeries(
          t,
          input.meeting_id,
          strip(input, "bearer_token", "meeting_id"),
        ),
      ),
  );

  server.registerTool(
    "update_meeting_attendance",
    {
      title: "Mark a meeting guest as a no-show",
      description:
        "Mark (absent: true) or clear (absent: false) a guest's no-show on a Cal.com meeting that has already ended, by meeting_id and attendee_email. Returns the updated {data: meeting row}; 409 if the meeting has not ended, is pending/cancelled, or the email is not a recorded guest.",
      inputSchema: S.updateMeetingAttendanceSchema,
      ...toolHints.idempotent,
    },
    async (input) =>
      callApi(input.bearer_token, (t) =>
        repo.updateMeetingAttendance(
          t,
          input.meeting_id,
          strip(input, "bearer_token", "meeting_id"),
        ),
      ),
  );

  // ── Synced Google / Outlook calendars (Unipile) ──────────────────────────

  server.registerTool(
    "get_team_calendar_availability",
    {
      title: "Get team free/busy",
      description:
        "Per-member free/busy from the workspace's synced Google/Outlook calendars (not Cal.com); books nothing. Free time counts only inside working hours (start_hour/end_hour/days/time_zone, default 09-18 Mon-Fri UTC); is_available = longest free run >= min_free_minutes. Returns {data: {window, members: [{user_id, name, has_calendar, stale, free_minutes, busy_blocks, next_free_at, is_available, ...}]}}.",
      inputSchema: S.getTeamCalendarAvailabilitySchema,
      ...toolHints.readOnly,
    },
    async (input) =>
      callApi(input.bearer_token, (t) =>
        repo.getTeamAvailability(t, {
          ...strip(input, "bearer_token", "user_ids", "days"),
          // max-agent reads both as comma-separated strings, not repeated keys.
          user_ids: input.user_ids?.join(","),
          days: input.days?.join(","),
        }),
      ),
  );

  server.registerTool(
    "list_synced_calendar_accounts",
    {
      title: "List synced Google/Outlook calendars",
      description:
        "List the workspace's connected Google/Outlook calendar accounts (synced via Unipile; separate from Cal.com). Returns {data: [{id, provider, externalAccountEmail, status, lastSyncedAt, syncIssue, needsReauth, scopeMissing, canReconnect}]}; id is the account_id the other synced-calendar tools take.",
      inputSchema: S.listSyncedCalendarAccountsSchema,
      ...toolHints.readOnly,
    },
    async (input) => callApi(input.bearer_token, (t) => repo.listSyncedAccounts(t)),
  );

  server.registerTool(
    "disconnect_synced_calendar_account",
    {
      title: "Disconnect a synced calendar",
      description:
        "Disconnect a synced Google/Outlook calendar account by account_id (any member's, not only yours) and stop syncing it. Destructive: only the owner can reconnect it, by signing in again in the app. Returns {success: true}.",
      inputSchema: S.disconnectSyncedCalendarAccountSchema,
      ...toolHints.destructive,
    },
    async (input) =>
      callApi(input.bearer_token, (t) =>
        repo.disconnectSyncedAccount(t, strip(input, "bearer_token")),
      ),
  );

  server.registerTool(
    "sync_calendars_now",
    {
      title: "Sync Google/Outlook calendars now",
      description:
        "Pull the latest events from the synced Google/Outlook calendars now: every account, or only account_id. May take minutes; an account already mid-sync is skipped. Returns {data: {accounts, synced, needsReauth, failed, skipped, eventsUpserted, eventsCancelled, results: [{accountId, provider, status, error}]}}.",
      inputSchema: S.syncCalendarsNowSchema,
    },
    async (input) =>
      callApi(input.bearer_token, (t) =>
        repo.syncCalendarsNow(t, strip(input, "bearer_token")),
      ),
  );

  server.registerTool(
    "create_calendar_event",
    {
      title: "Create a Google/Outlook calendar event",
      description:
        "Create an event directly on a synced Google/Outlook calendar (account_id; primary calendar unless calendar_id). Needs title and start_at (timed) or start_date (all-day); optional end_at/end_date, time_zone, body, location, attendees, recurrence. The provider may email invitations to attendees. Returns {data: provider event} whose id is the event_id for update/delete. For a Cal.com booking use book_meeting instead.",
      inputSchema: S.createCalendarEventSchema,
    },
    async (input) => {
      const body = eventBody(input);
      if (typeof body === "string") return inputError(body);
      if (!body.start) return inputError("start_at or start_date is required.");
      return callApi(input.bearer_token, (t) => repo.createCalendarEvent(t, body));
    },
  );

  server.registerTool(
    "update_calendar_event",
    {
      title: "Update a Google/Outlook calendar event",
      description:
        "Patch an event on a synced Google/Outlook calendar by event_id + account_id; omitted fields are left unchanged. The provider may notify attendees. Returns {data: provider event}; 409 conflict if it was edited elsewhere, 401 reauth_required if the account must be reconnected.",
      inputSchema: S.updateCalendarEventSchema,
      ...toolHints.idempotent,
    },
    async (input) => {
      const body = eventBody(input);
      if (typeof body === "string") return inputError(body);
      return callApi(input.bearer_token, (t) =>
        repo.updateCalendarEvent(t, input.event_id, body),
      );
    },
  );

  server.registerTool(
    "delete_calendar_event",
    {
      title: "Delete a Google/Outlook calendar event",
      description:
        "Delete an event from a synced Google/Outlook calendar by event_id + account_id. Irreversible; the provider may notify attendees. Returns {success: true}; 404 if the event is not found.",
      inputSchema: S.deleteCalendarEventSchema,
      ...toolHints.destructive,
    },
    async (input) => {
      const res = await callApi(input.bearer_token, (t) =>
        repo.deleteCalendarEvent(t, input.event_id, { account_id: input.account_id }),
      );
      // max-agent answers 204 No Content; give the model something to read.
      if (!res.isError && res.content[0]?.text === "") {
        return { content: [{ type: "text" as const, text: JSON.stringify({ success: true }) }] };
      }
      return res;
    },
  );
}

// ── helpers ────────────────────────────────────────────────────────────────

function inputError(message: string) {
  return {
    content: [{ type: "text" as const, text: `Invalid input: ${message}` }],
    isError: true,
  };
}

/**
 * Rebuild one event boundary in max-agent's shape: `{date}` for all-day,
 * `{date_time, time_zone?}` for timed. Returns an error string when both forms
 * were given, undefined when neither was.
 */
function boundary(
  label: "start" | "end",
  at: unknown,
  date: unknown,
  timeZone: unknown,
): Record<string, unknown> | string | undefined {
  if (typeof at === "string" && typeof date === "string") {
    return `pass ${label}_at or ${label}_date, not both.`;
  }
  if (typeof date === "string") return { date };
  if (typeof at === "string") {
    return typeof timeZone === "string"
      ? { date_time: at, time_zone: timeZone }
      : { date_time: at };
  }
  return undefined;
}

/**
 * Map the flat MCP event fields onto the calendar-sync events body. Returns an
 * error string for contradictory input.
 */
function eventBody(input: Record<string, unknown>): Record<string, unknown> | string {
  const start = boundary("start", input.start_at, input.start_date, input.time_zone);
  if (typeof start === "string") return start;
  const end = boundary("end", input.end_at, input.end_date, input.time_zone);
  if (typeof end === "string") return end;
  return {
    ...strip(
      input,
      "bearer_token",
      "event_id",
      "start_at",
      "start_date",
      "end_at",
      "end_date",
      "time_zone",
    ),
    ...(start ? { start } : {}),
    ...(end ? { end } : {}),
  };
}

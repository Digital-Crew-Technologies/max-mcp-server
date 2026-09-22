import { z } from "zod";
import { withToken } from "../shared";

// Calendar tools. Two integrations share this domain:
//   • Cal.com (/api/v1/calendar/*): read availability, propose times, book,
//     share a booking link, list meetings, and run the booking lifecycle
//     (confirm / decline / reschedule / cancel / cancel series / attendance).
//   • Synced Google/Outlook calendars via Unipile (/api/v1/calendar-sync/*):
//     list/disconnect accounts, sync now, create/update/delete provider events,
//     and team free/busy.
// Every schema mirrors the max-agent route contracts.
//
// GROUPED-MODE NOTE: in the default grouped catalog all these tools become one
// `calendar` tool whose published schema MERGES fields by name, keeping the
// FIRST definition's type and description. So a field name is reused only when
// its meaning and type match everywhere (meeting_id, reason, account_id,
// time_zone, attendee_email). Where the API reuses a name with a different
// shape (reschedule's `start`, the event `start`/`end` objects) the MCP field
// gets its own name and the handler maps it back.
//
// SECURITY: connect_calendar accepts an api_key, but the api_key is NEVER
// echoed back in any tool output — max-agent stores it and never returns it.

export const connectCalendarSchema = z.object({
  ...withToken,
  base_url: z
    .string()
    .url()
    .describe(
      "The self-hosted Cal.com instance API base URL, e.g. https://cal.example.com or https://cal.example.com/api/v2.",
    ),
  api_key: z
    .string()
    .describe(
      "The Cal.com API key used to authenticate against the instance. Validated by a listEventTypes call before storing; never returned by any tool.",
    ),
  default_event_type_id: z
    .number()
    .optional()
    .describe(
      "Optional Cal.com event type id to use as the default when none is specified for availability/proposals/bookings.",
    ),
});

export const calendarStatusSchema = z.object({
  ...withToken,
});

export const getAvailabilitySchema = z.object({
  ...withToken,
  event_type_id: z
    .number()
    .optional()
    .describe(
      "Cal.com event type id to check availability for. Defaults to the connection's default event type.",
    ),
  start: z
    .string()
    .optional()
    .describe("ISO8601 start of the availability window (default: now)."),
  end: z
    .string()
    .optional()
    .describe("ISO8601 end of the availability window (default: now + 14 days)."),
  time_zone: z
    .string()
    .optional()
    .describe("IANA time zone string, e.g. America/New_York."),
});

export const proposeTimesSchema = z.object({
  ...withToken,
  count: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe("How many of the soonest available slots to return (1-50, default 3)."),
  event_type_id: z
    .number()
    .optional()
    .describe(
      "Cal.com event type id to propose times for. Defaults to the connection's default event type.",
    ),
  time_zone: z
    .string()
    .optional()
    .describe("IANA time zone string used to localize the returned slots."),
});

export const bookMeetingSchema = z.object({
  ...withToken,
  event_type_id: z
    .number()
    .optional()
    .describe(
      "Cal.com event type id to book. Defaults to the connection's default event type.",
    ),
  start: z
    .string()
    .describe("ISO8601 UTC start time of the booking (required)."),
  attendee_name: z.string().describe("Attendee full name."),
  attendee_email: z.string().email().describe("Attendee email address."),
  attendee_time_zone: z
    .string()
    .describe("Attendee IANA time zone string, e.g. America/New_York."),
  prospect_id: z
    .string()
    .uuid()
    .optional()
    .describe(
      "Optional prospect UUID to associate; when given, the prospect's status advances to 'replied'.",
    ),
  campaign_id: z
    .string()
    .uuid()
    .optional()
    .describe("Optional campaign UUID to associate the booked meeting with."),
  recurrence_count: z
    .number()
    .int()
    .min(1)
    .max(24)
    .optional()
    .describe(
      "Optional number of occurrences for a recurring event type (1-24). Books the whole series.",
    ),
  metadata: z
    .record(z.string(), z.string())
    .optional()
    .describe("Optional flat map of string metadata to attach to the booking."),
});

export const sendBookingLinkSchema = z.object({
  ...withToken,
  prospect_id: z
    .string()
    .uuid()
    .optional()
    .describe("Optional prospect UUID the booking link is being shared with."),
  event_type_id: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Optional Cal.com event type id to link to. Defaults to the connection's default."),
});

export const getUpcomingMeetingsSchema = z.object({
  ...withToken,
  from: z
    .string()
    .optional()
    .describe("ISO8601 lower bound for meeting start time (default: now)."),
  to: z
    .string()
    .optional()
    .describe("ISO8601 upper bound for meeting start time (default: now + 30 days)."),
});

export const cancelMeetingSchema = z.object({
  ...withToken,
  meeting_id: z
    .string()
    .uuid()
    .describe("The meetings.id UUID (from get_upcoming_meetings)."),
  reason: z
    .string()
    .max(500)
    .optional()
    .describe("Optional reason (max 500 chars), passed to Cal.com and shown to the attendee."),
});

// ---------------------------------------------------------------------------
// Cal.com booking lifecycle
// ---------------------------------------------------------------------------

const meetingId = z
  .string()
  .uuid()
  .describe("The meetings.id UUID (from get_upcoming_meetings).");

const lifecycleReason = z
  .string()
  .max(500)
  .optional()
  .describe("Optional reason (max 500 chars), passed to Cal.com and shown to the attendee.");

export const confirmMeetingSchema = z.object({
  ...withToken,
  meeting_id: meetingId,
});

export const declineMeetingSchema = z.object({
  ...withToken,
  meeting_id: meetingId,
  reason: lifecycleReason,
});

export const rescheduleMeetingSchema = z.object({
  ...withToken,
  meeting_id: meetingId,
  new_start: z
    .string()
    .datetime({ offset: true })
    .describe("New ISO8601 start time (must be in the future), e.g. 2026-10-01T15:00:00Z."),
  reason: lifecycleReason,
});

export const cancelMeetingSeriesSchema = z.object({
  ...withToken,
  meeting_id: meetingId,
  scope: z
    .enum(["remaining", "series"])
    .describe(
      "'remaining' cancels this occurrence and every later one; 'series' cancels every occurrence.",
    ),
  reason: lifecycleReason,
});

export const updateMeetingAttendanceSchema = z.object({
  ...withToken,
  meeting_id: meetingId,
  attendee_email: z
    .string()
    .email()
    .max(320)
    .describe("Email of a guest recorded on the booking."),
  absent: z.boolean().describe("true marks the guest a no-show; false clears it."),
});

// ---------------------------------------------------------------------------
// Synced Google / Outlook calendars (Unipile)
// ---------------------------------------------------------------------------

export const getTeamCalendarAvailabilitySchema = z.object({
  ...withToken,
  user_ids: z
    .array(z.string().uuid())
    .optional()
    .describe("Auth user ids to check. Omit for every joined member (max 50)."),
  start: z
    .string()
    .datetime({ offset: true })
    .optional()
    .describe("ISO8601 window start (default: now)."),
  window_days: z
    .number()
    .int()
    .min(1)
    .max(30)
    .optional()
    .describe("Days to look ahead (1-30, default 3)."),
  min_free_minutes: z
    .number()
    .int()
    .min(15)
    .max(480)
    .optional()
    .describe("Smallest unbroken free run that counts as room (15-480, default 60)."),
  start_hour: z
    .number()
    .int()
    .min(0)
    .max(23)
    .optional()
    .describe("Local hour the working day opens (0-23, default 9)."),
  end_hour: z
    .number()
    .int()
    .min(1)
    .max(24)
    .optional()
    .describe("Local hour it closes (1-24, must be > start_hour, default 18)."),
  days: z
    .array(z.number().int().min(0).max(6))
    .optional()
    .describe("Working days, 0=Sunday (default [1,2,3,4,5])."),
  time_zone: z
    .string()
    .min(1)
    .max(64)
    .optional()
    .describe("IANA time zone string, e.g. America/New_York."),
});

export const listSyncedCalendarAccountsSchema = z.object({
  ...withToken,
});

const syncedAccountId = z
  .string()
  .uuid()
  .describe("Synced calendar account id (from list_synced_calendar_accounts).");

export const disconnectSyncedCalendarAccountSchema = z.object({
  ...withToken,
  account_id: syncedAccountId,
});

export const syncCalendarsNowSchema = z.object({
  ...withToken,
  account_id: syncedAccountId
    .optional()
    .describe("Sync only this account. Omit to sync every account in the workspace."),
});

const eventAttendee = z.object({
  email: z.string().email().describe("Attendee email."),
  display_name: z.string().nullable().optional().describe("Optional display name."),
});

// Event boundaries are flattened to scalars; the handler rebuilds max-agent's
// {date_time, time_zone} | {date} objects (see buildBoundary in tools.ts).
const eventBoundaryFields = {
  start_at: z
    .string()
    .datetime({ offset: true })
    .optional()
    .describe("Timed start, ISO8601 with offset. Use this or start_date."),
  start_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe("All-day start, YYYY-MM-DD. Use this or start_at."),
  end_at: z
    .string()
    .datetime({ offset: true })
    .optional()
    .describe("Timed end, ISO8601 with offset."),
  end_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe("All-day end, YYYY-MM-DD."),
  time_zone: z
    .string()
    .optional()
    .describe("IANA time zone string, e.g. America/New_York."),
  is_all_day: z.boolean().optional().describe("Mark the event all-day."),
};

const eventCommonFields = {
  attendees: z
    .array(eventAttendee)
    .max(200)
    .optional()
    .describe("Guests to invite (max 200). The provider may email them an invitation."),
  recurrence: z
    .array(z.string())
    .max(50)
    .nullable()
    .optional()
    .describe("RFC 5545 rules, e.g. [\"RRULE:FREQ=WEEKLY;COUNT=4\"]."),
};

export const createCalendarEventSchema = z.object({
  ...withToken,
  account_id: syncedAccountId,
  calendar_id: z
    .string()
    .min(1)
    .optional()
    .describe("Target a non-primary calendar. Omit for the account's primary calendar."),
  title: z.string().min(1).max(500).describe("Event title."),
  body: z.string().max(20_000).nullable().optional().describe("Event description."),
  location: z.string().max(500).nullable().optional().describe("Event location."),
  ...eventBoundaryFields,
  ...eventCommonFields,
});

const providerEventId = z
  .string()
  .min(1)
  .describe("Provider event id (the id create_calendar_event returned, or a synced event's externalEventId).");

export const updateCalendarEventSchema = z.object({
  ...withToken,
  event_id: providerEventId,
  account_id: syncedAccountId,
  title: z.string().min(1).max(500).optional().describe("New title."),
  body: z.string().max(20_000).nullable().optional().describe("New description; null clears it."),
  location: z.string().max(500).nullable().optional().describe("New location; null clears it."),
  ...eventBoundaryFields,
  ...eventCommonFields,
});

export const deleteCalendarEventSchema = z.object({
  ...withToken,
  event_id: providerEventId,
  account_id: syncedAccountId,
});

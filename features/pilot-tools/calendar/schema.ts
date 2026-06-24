import { z } from "zod";
import { withToken } from "../shared";

// Calendar / Cal.com tools. The workspace connects its own self-hosted Cal.com
// instance, then Max can read availability, propose times, book meetings, share
// a booking link, list upcoming meetings, and cancel them. Every schema mirrors
// the max-agent /api/v1/calendar/* route contracts.
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
    .describe("IANA time zone string used to localize the returned slots, e.g. America/New_York."),
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
    .describe("The meetings.id UUID of the recorded meeting to cancel."),
  reason: z
    .string()
    .optional()
    .describe("Optional cancellation reason passed to Cal.com and recorded on the meeting."),
});

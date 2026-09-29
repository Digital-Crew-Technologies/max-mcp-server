import { z } from "zod";
import { withToken } from "../shared";

// Meeting links: Max's own booking pages (Meetings › Meeting links in the app,
// public at <app>/book/<slug>). Mirrors max-agent
// src/features/meeting-links/meeting-links.schema.ts. Field-level limits are
// repeated here so the model gets them in the schema; the cross-field rules
// (overlapping hours, a video room link, dropdown answers, host calendars) are
// max-agent's, which answers 400 with {error, code:'invalid_settings', issues}.
//
// Not Cal.com: that integration is the `calendar` group.

const meetingLinkId = z
  .string()
  .uuid()
  .describe("Meeting link (booking page) UUID, from list_meeting_links.");

const TIME_OF_DAY = /^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/;

const hoursRange = z.object({
  start: z.string().regex(TIME_OF_DAY, "Use HH:MM").describe("Opening time, HH:MM."),
  end: z.string().regex(TIME_OF_DAY, "Use HH:MM").describe("Closing time, HH:MM; 24:00 closes at midnight."),
});

const dayHours = z.array(hoursRange).max(6);

const weeklyHours = z
  .object({
    sun: dayHours.optional(),
    mon: dayHours.optional(),
    tue: dayHours.optional(),
    wed: dayHours.optional(),
    thu: dayHours.optional(),
    fri: dayHours.optional(),
    sat: dayHours.optional(),
  })
  .describe(
    "Opening hours per weekday, read in the page's time_zone, e.g. {mon:[{start:'09:00',end:'12:00'},{start:'14:00',end:'18:00'}]}. A day left out (or []) is closed; up to six non-overlapping ranges a day. Default Mon–Fri 09:00–17:00. On update this REPLACES the whole week.",
  );

const answerId = z
  .string()
  .regex(/^[a-z][a-z0-9_]{0,39}$/)
  .describe("Stable id: a lowercase letter, then lowercase letters, digits or _ (max 40).");

const question = z.object({
  id: answerId,
  type: z
    .enum(["short_text", "long_text", "select"])
    .describe("short_text (one line), long_text (paragraph) or select (dropdown)."),
  label: z.string().min(1).max(300).describe("The question as the lead reads it."),
  placeholder: z.string().max(150).optional(),
  required: z.boolean().optional().describe("Default true."),
  options: z
    .array(
      z.object({
        id: answerId,
        label: z.string().min(1).max(200),
        disqualifies: z
          .boolean()
          .optional()
          .describe("Choosing this answer ends the flow with disqualified_message instead of the calendar. Never shown to the lead."),
      }),
    )
    .max(20)
    .optional()
    .describe("select only: 2–20 answers, at least one of which must not disqualify."),
});

const host = z.object({
  user_id: z.string().uuid().describe("A workspace member's user id (get_meeting_link returns them as `team`)."),
  routing_note: z
    .string()
    .max(500)
    .optional()
    .describe("Who should get these leads — read by dispatch_strategy 'ai', never shown to leads."),
  calendar_account_ids: z
    .array(z.string().uuid())
    .max(5)
    .optional()
    .describe(
      "That host's OWN synced Google/Outlook calendars to write each booking to (ids from `team[].calendars`). Busy time is read from all their calendars either way.",
    ),
});

const httpsUrl = (what: string) =>
  z.string().max(500).nullable().optional().describe(`${what} Full https:// URL, or null for none.`);

/** Every editable setting, all optional; create_meeting_link requires title and time_zone. */
const settings = {
  title: z.string().min(1).max(120).describe("Page title shown to leads."),
  slug: z
    .string()
    .regex(/^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])$/)
    .describe(
      "Public address: <app>/book/<slug>. 3–64 lowercase letters, digits and hyphens, unique across Max (409 slug_taken). On create, leave it out to get the title plus a random id.",
    ),
  description: z
    .string()
    .max(5000)
    .describe("Shown above the form. Supports **bold** and lines starting with '- ' as bullets."),
  locale: z.enum(["en", "fr"]).describe("Language of the page's own words and confirmation email. Default en."),
  duration_minutes: z.number().int().min(5).max(480).describe("Meeting length. Default 30."),
  slot_step_minutes: z
    .number()
    .int()
    .min(5)
    .max(480)
    .describe("Minutes between offered start times. Default 30."),
  buffer_minutes: z.number().int().min(0).max(240).describe("Free time kept before and after each meeting. Default 0."),
  min_notice_minutes: z
    .number()
    .int()
    .min(0)
    .max(43200)
    .describe("Earliest bookable start, in minutes from now. Default 240."),
  max_days_ahead: z.number().int().min(1).max(180).describe("Booking window in days. Default 30."),
  time_zone: z
    .string()
    .min(1)
    .max(64)
    .describe(
      "IANA zone the weekly hours are read in, e.g. Europe/Paris — the host's own zone. Leads always see times in theirs, detected from their browser.",
    ),
  weekly_hours: weeklyHours,
  location_kind: z
    .enum(["video", "phone", "in_person"])
    .describe("video (needs location_value: the https room link, revealed only after booking), phone (the host calls the lead; default) or in_person (needs location_value: the address)."),
  location_value: z.string().max(500).nullable().describe("Room link for video, address for in_person; ignored for phone."),
  fields: z
    .array(question)
    .max(15)
    .describe(
      "The host's own questions, asked after phone and name (email is always asked). Default none. On update this REPLACES the list.",
    ),
  brand_color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .describe("Button colour #RRGGBB, or null for Max's."),
  show_logo: z.boolean().describe("Show the workspace logo (Settings › Appearance). Default false via the API."),
  privacy_url: httpsUrl("Privacy policy link shown under the form."),
  confirmation_message: z.string().max(1000).nullable().describe("Shown and emailed to the lead once booked."),
  redirect_url: httpsUrl(
    "Thank-you page the lead is sent to once booked, with start, end, time_zone and google_calendar_url appended.",
  ),
  disqualified_message: z
    .string()
    .max(1000)
    .nullable()
    .describe("Shown instead of the calendar when an answer disqualifies."),
  hosts: z
    .array(host)
    .min(1)
    .max(10)
    .describe(
      "Who the page books (1–10 workspace members). Default on create: the API key's owner alone. On update this REPLACES the host list.",
    ),
  host_mode: z
    .enum(["collective", "dispatch"])
    .describe("With 2+ hosts: collective = every host attends (a time is offered only when all are free); dispatch = one host per booking. Default collective."),
  dispatch_strategy: z
    .enum(["round_robin", "least_busy", "ai"])
    .describe("How dispatch picks the host among those free: round_robin (take turns, default), least_busy (lightest day) or ai (matches the lead's answers to each host's routing_note; billed)."),
  is_active: z.boolean().describe("false unpublishes the page (its address answers 404) without deleting it. Default true."),
};

type SettingKey = keyof typeof settings;
const optionalSettings = Object.fromEntries(
  Object.entries(settings).map(([key, schema]) => [key, schema.optional()]),
) as { [K in SettingKey]: z.ZodOptional<(typeof settings)[K]> };

export const listMeetingLinksSchema = z.object({ ...withToken });

export const getMeetingLinkSchema = z.object({ ...withToken, meeting_link_id: meetingLinkId });

export const createMeetingLinkSchema = z.object({
  ...withToken,
  ...optionalSettings,
  title: settings.title,
  time_zone: settings.time_zone,
});

export const updateMeetingLinkSchema = z.object({
  ...withToken,
  meeting_link_id: meetingLinkId,
  ...optionalSettings,
});

export const deleteMeetingLinkSchema = z.object({ ...withToken, meeting_link_id: meetingLinkId });

export const listMeetingLinkSubmissionsSchema = z.object({
  ...withToken,
  meeting_link_id: meetingLinkId,
});

export const suggestMeetingLinkSlugSchema = z.object({
  ...withToken,
  title: z.string().min(1).max(120).describe("The page title the address is drawn from."),
});

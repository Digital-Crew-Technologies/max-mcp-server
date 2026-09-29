import { callApi, strip, toolHints, type McpServer } from "../shared";
import * as repo from "./repository";
import * as S from "./schema";

// Meeting links — Max's own booking pages (Meetings › Meeting links), public at
// <app>/book/<slug>. A lead leaves phone and name (saved at once as a CRM
// person, with the time zone their browser reports), answers the host's
// questions, is qualified, then books a time the hosts' synced
// Google/Outlook calendars show free; the meeting is written to those
// calendars. Proxies max-agent /api/v1/meeting-links/* (prospects:read /
// prospects:write): the pages capture leads into the CRM, so they are governed
// like People.
//
// Every page in a response carries `booking_url`, its absolute public address,
// ready to send to a lead.
//
// NOT exposed: the public visitor routes (/api/v1/booking/<slug>/*). They are
// the lead's own flow — rate-limited per network and authorized by a visitor
// token — so an agent never fills a page in on a lead's behalf.

export function registerMeetingLinkTools(server: McpServer): void {
  server.registerTool(
    "list_meeting_links",
    {
      title: "List booking pages",
      description:
        "List the workspace's booking pages (meeting links), newest first, each with its settings, hosts, booking_url (share this with leads) and per-status lead counts (partial, qualified, disqualified, booked, cancelled). Also returns `calendars` (the API key owner's synced calendars) and viewer_user_id. Returns {data: MeetingLink[], calendars, viewer_user_id}.",
      inputSchema: S.listMeetingLinksSchema,
      ...toolHints.readOnly,
    },
    async (input) => callApi(input.bearer_token, (t) => repo.listMeetingLinks(t)),
  );

  server.registerTool(
    "get_meeting_link",
    {
      title: "Get a booking page",
      description:
        "Get one booking page by meeting_link_id, with `team`: every workspace member who can host it and their synced calendars (the user_id and calendar ids to use in hosts[] on create/update). Returns {data: MeetingLink, calendars, team}.",
      inputSchema: S.getMeetingLinkSchema,
      ...toolHints.readOnly,
    },
    async (input) => callApi(input.bearer_token, (t) => repo.getMeetingLink(t, input.meeting_link_id)),
  );

  server.registerTool(
    "create_meeting_link",
    {
      title: "Create a booking page",
      description:
        "Publish a new booking page. Only title and time_zone (the host's IANA zone, e.g. Europe/Paris) are required: slug defaults to the title plus a random id, and the rest starts as in the app (30-minute calls on a 30-minute grid, Mon–Fri 09:00–17:00, phone call, no questions, 4 h notice, 30-day window). Hosted by the API key's owner unless hosts is given. Live at once unless is_active=false. Returns 201 {data: MeetingLink} with booking_url to share; 400 invalid_settings {issues}, 409 slug_taken.",
      inputSchema: S.createMeetingLinkSchema,
    },
    async (input) =>
      callApi(input.bearer_token, (t) =>
        repo.createMeetingLink(t, strip(input, "bearer_token")),
      ),
  );

  server.registerTool(
    "update_meeting_link",
    {
      title: "Update a booking page",
      description:
        "Change any subset of a booking page's settings by meeting_link_id; the merged result is validated in full. weekly_hours, fields and hosts each REPLACE the stored value — read the page first (get_meeting_link) and send the whole list. Changing slug moves the public address (the old one stops working). is_active=false unpublishes it. Returns {data: MeetingLink}; 400 invalid_settings {issues}, 409 slug_taken.",
      inputSchema: S.updateMeetingLinkSchema,
      ...toolHints.idempotent,
    },
    async (input) =>
      callApi(input.bearer_token, (t) =>
        repo.updateMeetingLink(t, input.meeting_link_id, strip(input, "bearer_token", "meeting_link_id")),
      ),
  );

  server.registerTool(
    "delete_meeting_link",
    {
      title: "Delete a booking page",
      description:
        "Permanently delete a booking page and its lead submissions; its address stops working. The CRM people it captured and their timelines stay. To take a page offline but keep it, use update_meeting_link with is_active=false instead. Returns {data: {id}}.",
      inputSchema: S.deleteMeetingLinkSchema,
      ...toolHints.destructive,
    },
    async (input) => callApi(input.bearer_token, (t) => repo.deleteMeetingLink(t, input.meeting_link_id)),
  );

  server.registerTool(
    "list_meeting_link_submissions",
    {
      title: "List a booking page's leads",
      description:
        "Everyone who left a phone number on a booking page (newest first, up to 200), booked or not: status (partial = stopped after phone/name, qualified, disqualified, booked, cancelled), name, phone, email, prospect_id (their CRM person), readable answers, disqualified_by, time_zone (the lead's zone, detected from their browser), booked_start_at/booked_end_at (UTC), host_names, dispatch_reason and calendar write status. Returns {data: Submission[]}.",
      inputSchema: S.listMeetingLinkSubmissionsSchema,
      ...toolHints.readOnly,
    },
    async (input) =>
      callApi(input.bearer_token, (t) => repo.listMeetingLinkSubmissions(t, input.meeting_link_id)),
  );

  server.registerTool(
    "suggest_meeting_link_slug",
    {
      title: "Suggest a free booking page address",
      description:
        "A free slug drawn from a title: the title's words plus a random 6-character id (e.g. discovery-call-k3x9p2). Not reserved — create_meeting_link can still answer 409 slug_taken in a race. Only needed to preview or pin the address; create_meeting_link picks one itself when slug is left out. Returns {data: {slug}}.",
      inputSchema: S.suggestMeetingLinkSlugSchema,
      ...toolHints.readOnly,
    },
    async (input) => callApi(input.bearer_token, (t) => repo.suggestMeetingLinkSlug(t, input.title)),
  );
}

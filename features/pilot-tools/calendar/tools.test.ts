import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { McpServer } from "@/features/pilot-tools/shared";
import { registerCalendarTools } from "@/features/pilot-tools/calendar/tools";
import { registerAsGroup } from "@/features/pilot-tools/mcp/group-adapter";

type Captured = {
  name: string;
  config: Record<string, unknown>;
  handler: (input: Record<string, unknown>) => Promise<{
    content: Array<{ type: "text"; text: string }>;
    isError?: boolean;
  }>;
};

function capture(register: (s: McpServer) => void = registerCalendarTools): Captured[] {
  const tools: Captured[] = [];
  const server: McpServer = {
    registerTool(name, config, handler) {
      tools.push({ name, config, handler });
    },
  };
  register(server);
  return tools;
}

function tool(name: string): Captured {
  const found = capture().find((t) => t.name === name);
  if (!found) throw new Error(`tool "${name}" was not registered`);
  return found;
}

function mockFetch(body: unknown, init: { status?: number } = {}) {
  const status = init.status ?? 200;
  const fetchMock = vi.fn(
    async (_url: string, _init?: RequestInit) =>
      new Response(status === 204 ? null : JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function calledUrl(fetchMock: ReturnType<typeof mockFetch>): URL {
  return new URL(fetchMock.mock.calls[0][0]);
}

function calledMethod(fetchMock: ReturnType<typeof mockFetch>): string | undefined {
  return fetchMock.mock.calls[0][1]?.method;
}

function calledBody(fetchMock: ReturnType<typeof mockFetch>): Record<string, unknown> {
  return JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
}

const MEETING = "11111111-1111-4111-8111-111111111111";
const ACCOUNT = "22222222-2222-4222-8222-222222222222";
const USER_A = "33333333-3333-4333-8333-333333333333";
const USER_B = "44444444-4444-4444-8444-444444444444";

const NEW_TOOLS = [
  "confirm_meeting",
  "decline_meeting",
  "reschedule_meeting",
  "cancel_meeting_series",
  "update_meeting_attendance",
  "get_team_calendar_availability",
  "list_synced_calendar_accounts",
  "disconnect_synced_calendar_account",
  "sync_calendars_now",
  "create_calendar_event",
  "update_calendar_event",
  "delete_calendar_event",
];

beforeEach(() => {
  process.env.DIGITALCREW_API_BASE_URL = "https://api.test";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("calendar tool registration", () => {
  it("registers every lifecycle and synced-calendar tool", () => {
    const names = capture().map((t) => t.name);
    for (const name of NEW_TOOLS) expect(names).toContain(name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("names every new tool unambiguously next to book_meeting / cancel_meeting", () => {
    for (const name of NEW_TOOLS) {
      expect(name).toMatch(/calendar|meeting|event_type|schedule/);
    }
  });

  it("marks the irreversible tools destructive and the reads read-only", () => {
    const hints = (name: string) =>
      (tool(name).config.annotations ?? {}) as Record<string, boolean>;
    for (const name of [
      "cancel_meeting",
      "decline_meeting",
      "cancel_meeting_series",
      "disconnect_synced_calendar_account",
      "delete_calendar_event",
    ]) {
      expect(hints(name).destructiveHint, name).toBe(true);
    }
    for (const name of ["get_team_calendar_availability", "list_synced_calendar_accounts"]) {
      expect(hints(name).readOnlyHint, name).toBe(true);
    }
  });
});

describe("Cal.com booking lifecycle", () => {
  it("confirm_meeting POSTs to /meetings/{id}/confirm", async () => {
    const fetchMock = mockFetch({ data: { id: MEETING, status: "scheduled" } });
    const res = await tool("confirm_meeting").handler({ bearer_token: "t", meeting_id: MEETING });
    expect(res.isError).toBeUndefined();
    expect(calledMethod(fetchMock)).toBe("POST");
    expect(calledUrl(fetchMock).pathname).toBe(`/api/v1/calendar/meetings/${MEETING}/confirm`);
  });

  it("reschedule_meeting sends new_start as the API's `start`", async () => {
    const fetchMock = mockFetch({ data: { id: MEETING } });
    await tool("reschedule_meeting").handler({
      bearer_token: "t",
      meeting_id: MEETING,
      new_start: "2026-10-01T15:00:00Z",
      reason: "Conflict",
    });
    expect(calledUrl(fetchMock).pathname).toBe(
      `/api/v1/calendar/meetings/${MEETING}/reschedule`,
    );
    expect(calledBody(fetchMock)).toEqual({ start: "2026-10-01T15:00:00Z", reason: "Conflict" });
    // Not idempotent upstream — must never be retried.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("cancel_meeting_series sends scope + reason, never the path id", async () => {
    const fetchMock = mockFetch({ data: { id: MEETING }, meta: { scope: "remaining" } });
    await tool("cancel_meeting_series").handler({
      bearer_token: "t",
      meeting_id: MEETING,
      scope: "remaining",
      reason: "Project ended",
    });
    expect(calledUrl(fetchMock).pathname).toBe(
      `/api/v1/calendar/meetings/${MEETING}/cancel-series`,
    );
    expect(calledBody(fetchMock)).toEqual({ scope: "remaining", reason: "Project ended" });
  });

  it("update_meeting_attendance posts attendee_email + absent", async () => {
    const fetchMock = mockFetch({ data: { id: MEETING } });
    await tool("update_meeting_attendance").handler({
      bearer_token: "t",
      meeting_id: MEETING,
      attendee_email: "ada@example.com",
      absent: true,
    });
    expect(calledUrl(fetchMock).pathname).toBe(
      `/api/v1/calendar/meetings/${MEETING}/attendance`,
    );
    expect(calledBody(fetchMock)).toEqual({ attendee_email: "ada@example.com", absent: true });
  });
});

describe("synced Google/Outlook calendars", () => {
  it("get_team_calendar_availability sends user_ids and days as CSV", async () => {
    const fetchMock = mockFetch({ data: { window: null, members: [] } });
    await tool("get_team_calendar_availability").handler({
      bearer_token: "t",
      user_ids: [USER_A, USER_B],
      days: [1, 3, 5],
      window_days: 7,
      time_zone: "Europe/Paris",
    });
    const url = calledUrl(fetchMock);
    expect(calledMethod(fetchMock)).toBeUndefined(); // GET
    expect(url.pathname).toBe("/api/v1/calendar/team-availability");
    expect(url.searchParams.getAll("user_ids")).toEqual([`${USER_A},${USER_B}`]);
    expect(url.searchParams.getAll("days")).toEqual(["1,3,5"]);
    expect(url.searchParams.get("window_days")).toBe("7");
    expect(url.searchParams.get("time_zone")).toBe("Europe/Paris");
    expect(url.searchParams.has("bearer_token")).toBe(false);
  });

  it("list_synced_calendar_accounts GETs /calendar-sync/accounts", async () => {
    const fetchMock = mockFetch({ data: [] });
    await tool("list_synced_calendar_accounts").handler({ bearer_token: "t" });
    expect(calledUrl(fetchMock).pathname).toBe("/api/v1/calendar-sync/accounts");
  });

  it("disconnect_synced_calendar_account posts the account_id", async () => {
    const fetchMock = mockFetch({ success: true });
    await tool("disconnect_synced_calendar_account").handler({
      bearer_token: "t",
      account_id: ACCOUNT,
    });
    expect(calledMethod(fetchMock)).toBe("POST");
    expect(calledUrl(fetchMock).pathname).toBe("/api/v1/calendar-sync/accounts/disconnect");
    expect(calledBody(fetchMock)).toEqual({ account_id: ACCOUNT });
  });

  it("sync_calendars_now posts an empty body for a whole-workspace sync", async () => {
    const fetchMock = mockFetch({ data: { accounts: 0 } });
    await tool("sync_calendars_now").handler({ bearer_token: "t" });
    expect(calledUrl(fetchMock).pathname).toBe("/api/v1/calendar-sync/sync-now");
    expect(calledBody(fetchMock)).toEqual({});
  });

  it("create_calendar_event rebuilds timed boundaries", async () => {
    const fetchMock = mockFetch({ data: { id: "evt_1" } }, { status: 201 });
    await tool("create_calendar_event").handler({
      bearer_token: "t",
      account_id: ACCOUNT,
      title: "Intro call",
      start_at: "2026-10-01T15:00:00Z",
      end_at: "2026-10-01T15:30:00Z",
      time_zone: "America/New_York",
      attendees: [{ email: "ada@example.com" }],
    });
    expect(calledMethod(fetchMock)).toBe("POST");
    expect(calledUrl(fetchMock).pathname).toBe("/api/v1/calendar-sync/events");
    expect(calledBody(fetchMock)).toEqual({
      account_id: ACCOUNT,
      title: "Intro call",
      start: { date_time: "2026-10-01T15:00:00Z", time_zone: "America/New_York" },
      end: { date_time: "2026-10-01T15:30:00Z", time_zone: "America/New_York" },
      attendees: [{ email: "ada@example.com" }],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("create_calendar_event sends all-day boundaries as {date}", async () => {
    const fetchMock = mockFetch({ data: { id: "evt_2" } }, { status: 201 });
    await tool("create_calendar_event").handler({
      bearer_token: "t",
      account_id: ACCOUNT,
      title: "Offsite",
      start_date: "2026-10-05",
      end_date: "2026-10-06",
      is_all_day: true,
    });
    const body = calledBody(fetchMock);
    expect(body.start).toEqual({ date: "2026-10-05" });
    expect(body.end).toEqual({ date: "2026-10-06" });
    expect(body.is_all_day).toBe(true);
  });

  it("create_calendar_event refuses a missing or ambiguous start without calling the API", async () => {
    const fetchMock = mockFetch({});
    const missing = await tool("create_calendar_event").handler({
      bearer_token: "t",
      account_id: ACCOUNT,
      title: "No start",
    });
    expect(missing.isError).toBe(true);
    const both = await tool("create_calendar_event").handler({
      bearer_token: "t",
      account_id: ACCOUNT,
      title: "Both",
      start_at: "2026-10-01T15:00:00Z",
      start_date: "2026-10-01",
    });
    expect(both.isError).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("update_calendar_event PATCHes the encoded provider id with only the patch", async () => {
    const fetchMock = mockFetch({ data: { id: "abc/def" } });
    await tool("update_calendar_event").handler({
      bearer_token: "t",
      event_id: "abc/def",
      account_id: ACCOUNT,
      title: "Renamed",
      location: null,
    });
    expect(calledMethod(fetchMock)).toBe("PATCH");
    expect(calledUrl(fetchMock).pathname).toBe("/api/v1/calendar-sync/events/abc%2Fdef");
    expect(calledBody(fetchMock)).toEqual({
      account_id: ACCOUNT,
      title: "Renamed",
      location: null,
    });
  });

  it("delete_calendar_event sends account_id in the body and reports 204 as success", async () => {
    const fetchMock = mockFetch(null, { status: 204 });
    const res = await tool("delete_calendar_event").handler({
      bearer_token: "t",
      event_id: "evt_9",
      account_id: ACCOUNT,
    });
    expect(calledMethod(fetchMock)).toBe("DELETE");
    expect(calledUrl(fetchMock).pathname).toBe("/api/v1/calendar-sync/events/evt_9");
    expect(calledBody(fetchMock)).toEqual({ account_id: ACCOUNT });
    expect(JSON.parse(res.content[0].text)).toEqual({ success: true });
  });
});

describe("grouped `calendar` tool", () => {
  function grouped(): Captured {
    const tools = capture((s) =>
      registerAsGroup(s, "calendar", "test blurb", registerCalendarTools),
    );
    return tools[0];
  }

  it("dispatches a new action through the grouped tool", async () => {
    const fetchMock = mockFetch({ data: { id: MEETING } });
    await grouped().handler({
      action: "decline_meeting",
      bearer_token: "t",
      meeting_id: MEETING,
      reason: "Not a fit",
    });
    expect(calledUrl(fetchMock).pathname).toBe(`/api/v1/calendar/meetings/${MEETING}/decline`);
    expect(calledBody(fetchMock)).toEqual({ reason: "Not a fit" });
  });

  it("still validates per action (reschedule needs new_start)", async () => {
    const fetchMock = mockFetch({});
    const res = await grouped().handler({
      action: "reschedule_meeting",
      bearer_token: "t",
      meeting_id: MEETING,
    });
    expect(res.isError).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

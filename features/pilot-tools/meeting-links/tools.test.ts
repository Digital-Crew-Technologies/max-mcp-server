import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { z } from "zod";
import type { McpServer } from "@/features/pilot-tools/shared";
import { registerMeetingLinkTools } from "@/features/pilot-tools/meeting-links/tools";

type Captured = {
  name: string;
  config: Record<string, unknown>;
  handler: (input: Record<string, unknown>) => Promise<{
    content: Array<{ type: "text"; text: string }>;
    isError?: boolean;
  }>;
};

function capture(): Captured[] {
  const tools: Captured[] = [];
  const server: McpServer = {
    registerTool(name, config, handler) {
      tools.push({ name, config, handler });
    },
  };
  registerMeetingLinkTools(server);
  return tools;
}

function tool(name: string): Captured {
  const found = capture().find((t) => t.name === name);
  if (!found) throw new Error(`tool "${name}" was not registered`);
  return found;
}

const schemaOf = (name: string) => tool(name).config.inputSchema as z.ZodTypeAny;

function mockFetch(body: unknown, init: { status?: number } = {}) {
  const fetchMock = vi.fn(
    async (_url: string, _init?: RequestInit) =>
      new Response(JSON.stringify(body), {
        status: init.status ?? 200,
        headers: { "Content-Type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const url = (m: ReturnType<typeof mockFetch>) => new URL(m.mock.calls[0][0]);
const method = (m: ReturnType<typeof mockFetch>) => m.mock.calls[0][1]?.method ?? "GET";
const body = (m: ReturnType<typeof mockFetch>) =>
  JSON.parse(m.mock.calls[0][1]?.body as string) as Record<string, unknown>;

const LINK = "70000000-0000-4000-8000-000000000001";
const MEMBER = "50000000-0000-4000-8000-000000000002";

beforeEach(() => {
  process.env.DIGITALCREW_API_BASE_URL = "https://api.test";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("meeting link tools", () => {
  it("registers full CRUD plus the leads and the address suggestion", () => {
    expect(capture().map((t) => t.name).sort()).toEqual(
      [
        "create_meeting_link",
        "delete_meeting_link",
        "get_meeting_link",
        "list_meeting_link_submissions",
        "list_meeting_links",
        "suggest_meeting_link_slug",
        "update_meeting_link",
      ].sort(),
    );
  });

  it("marks reads read-only and delete destructive", () => {
    for (const name of ["list_meeting_links", "get_meeting_link", "list_meeting_link_submissions", "suggest_meeting_link_slug"]) {
      expect(tool(name).config.annotations, name).toEqual({ readOnlyHint: true });
    }
    expect(tool("delete_meeting_link").config.annotations).toEqual({ destructiveHint: true });
    expect(tool("create_meeting_link").config.annotations).toBeUndefined();
  });

  it("list_meeting_links GETs the collection", async () => {
    const f = mockFetch({ data: [], calendars: [], viewer_user_id: MEMBER });
    const result = await tool("list_meeting_links").handler({ bearer_token: "t" });
    expect(method(f)).toBe("GET");
    expect(url(f).pathname).toBe("/api/v1/meeting-links");
    expect(result.isError).toBeUndefined();
  });

  it("get_meeting_link reads one page by id and requires a UUID", async () => {
    expect(schemaOf("get_meeting_link").safeParse({ meeting_link_id: "intro-call" }).success).toBe(false);
    const f = mockFetch({ data: { id: LINK }, calendars: [], team: [] });
    await tool("get_meeting_link").handler({ bearer_token: "t", meeting_link_id: LINK });
    expect(url(f).pathname).toBe(`/api/v1/meeting-links/${LINK}`);
  });

  it("create_meeting_link needs only a title and a time zone, and never retries", async () => {
    const schema = schemaOf("create_meeting_link");
    expect(schema.safeParse({ title: "Discovery call" }).success).toBe(false);
    expect(schema.safeParse({ time_zone: "Europe/Paris" }).success).toBe(false);
    expect(schema.safeParse({ title: "Discovery call", time_zone: "Europe/Paris" }).success).toBe(true);

    // A 503 would normally be retried; a second POST would publish a second page.
    const f = mockFetch({ error: "Service unavailable" }, { status: 503 });
    const result = await tool("create_meeting_link").handler({
      bearer_token: "t",
      title: "Discovery call",
      time_zone: "Europe/Paris",
    });
    expect(f).toHaveBeenCalledTimes(1);
    expect(result.isError).toBe(true);
  });

  it("create_meeting_link POSTs the settings without the token", async () => {
    const f = mockFetch({ data: { id: LINK, booking_url: "https://max.test/book/discovery-call-k3x9p2" } }, { status: 201 });
    const settings = {
      title: "Discovery call",
      time_zone: "America/New_York",
      duration_minutes: 45,
      weekly_hours: { mon: [{ start: "09:00", end: "12:00" }], wed: [{ start: "14:00", end: "18:00" }] },
      location_kind: "video" as const,
      location_value: "https://meet.google.com/abc-defg-hij",
      fields: [
        {
          id: "budget",
          type: "select" as const,
          label: "Budget?",
          options: [
            { id: "low", label: "Under $2k", disqualifies: true },
            { id: "mid", label: "$2k+" },
          ],
        },
      ],
      hosts: [{ user_id: MEMBER, calendar_account_ids: [] }],
      host_mode: "dispatch" as const,
      dispatch_strategy: "least_busy" as const,
    };
    expect(schemaOf("create_meeting_link").safeParse(settings).success).toBe(true);
    const result = await tool("create_meeting_link").handler({ bearer_token: "t", ...settings });
    expect(method(f)).toBe("POST");
    expect(url(f).pathname).toBe("/api/v1/meeting-links");
    expect(body(f)).toEqual(settings);
    expect(result.content[0].text).toContain("/book/discovery-call-k3x9p2");
  });

  it("rejects settings max-agent would refuse, before any call", () => {
    const schema = schemaOf("create_meeting_link");
    const base = { title: "Intro", time_zone: "Europe/Paris" };
    expect(schema.safeParse({ ...base, slug: "Intro Call" }).success).toBe(false);
    expect(schema.safeParse({ ...base, duration_minutes: 2 }).success).toBe(false);
    expect(schema.safeParse({ ...base, weekly_hours: { mon: [{ start: "9am", end: "5pm" }] } }).success).toBe(false);
    expect(schema.safeParse({ ...base, brand_color: "blue" }).success).toBe(false);
    expect(schema.safeParse({ ...base, hosts: [] }).success).toBe(false);
    expect(schema.safeParse({ ...base, location_kind: "zoom" }).success).toBe(false);
  });

  it("update_meeting_link PATCHes /meeting-links/:id with only the changed settings", async () => {
    const f = mockFetch({ data: { id: LINK } });
    await tool("update_meeting_link").handler({
      bearer_token: "t",
      meeting_link_id: LINK,
      is_active: false,
      time_zone: "Asia/Tokyo",
    });
    expect(method(f)).toBe("PATCH");
    expect(url(f).pathname).toBe(`/api/v1/meeting-links/${LINK}`);
    expect(body(f)).toEqual({ is_active: false, time_zone: "Asia/Tokyo" });
  });

  it("delete_meeting_link DELETEs /meeting-links/:id", async () => {
    const f = mockFetch({ data: { id: LINK } });
    await tool("delete_meeting_link").handler({ bearer_token: "t", meeting_link_id: LINK });
    expect(method(f)).toBe("DELETE");
    expect(url(f).pathname).toBe(`/api/v1/meeting-links/${LINK}`);
  });

  it("list_meeting_link_submissions reads one page's leads", async () => {
    const f = mockFetch({ data: [{ status: "booked", time_zone: "Europe/London" }] });
    const result = await tool("list_meeting_link_submissions").handler({ bearer_token: "t", meeting_link_id: LINK });
    expect(url(f).pathname).toBe(`/api/v1/meeting-links/${LINK}/submissions`);
    expect(result.content[0].text).toContain("Europe/London");
  });

  it("suggest_meeting_link_slug sends the title as ?title=", async () => {
    const f = mockFetch({ data: { slug: "discovery-call-k3x9p2" } });
    await tool("suggest_meeting_link_slug").handler({ bearer_token: "t", title: "Discovery call" });
    expect(url(f).pathname).toBe("/api/v1/meeting-links/slug-suggestion");
    expect(url(f).searchParams.get("title")).toBe("Discovery call");
  });

  it("surfaces max-agent's validation message", async () => {
    mockFetch(
      {
        error: "location_value: Paste the https:// link of your Google Meet, Zoom or Teams room",
        code: "invalid_settings",
      },
      { status: 400 },
    );
    const result = await tool("update_meeting_link").handler({
      bearer_token: "t",
      meeting_link_id: LINK,
      location_kind: "video",
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("API error (400)");
    expect(result.content[0].text).toContain("location_value");
  });
});

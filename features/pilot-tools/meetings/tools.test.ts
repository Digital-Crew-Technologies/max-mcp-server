import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { McpServer } from "@/features/pilot-tools/shared";
import {
  registerMeetingTools,
  MEETINGS_CAPABILITIES,
} from "@/features/pilot-tools/meetings/tools";

// The grouped tool's handler is reached through registerTool, so capture what
// registration hands the server and drive the handlers the way mcp-handler will.
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
  registerMeetingTools(server);
  return tools;
}

function tool(name: string): Captured {
  const found = capture().find((t) => t.name === name);
  if (!found) throw new Error(`tool "${name}" was not registered`);
  return found;
}

/** Mock fetch, returning `body`, and expose the calls for assertion. */
function mockFetch(body: unknown, init: { status?: number } = {}) {
  const fetchMock = vi.fn(
    async (_url: string, _init?: RequestInit) =>
      new Response(typeof body === "string" ? body : JSON.stringify(body), {
        status: init.status ?? 200,
        headers: { "Content-Type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** The URL the tool actually called upstream. */
function calledUrl(fetchMock: ReturnType<typeof mockFetch>): URL {
  return new URL(fetchMock.mock.calls[0][0]);
}

beforeEach(() => {
  process.env.DIGITALCREW_API_BASE_URL = "https://api.test";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("meetings tool registration", () => {
  it("registers the grouped `meetings` tool and flat prospect_list_meetings", () => {
    const names = capture().map((t) => t.name);
    expect(names).toContain("meetings");
    expect(names).toContain("prospect_list_meetings");
  });

  it("exposes list as an action on the grouped tool", async () => {
    const fetchMock = mockFetch({ data: [], nextCursor: null });
    await tool("meetings").handler({ action: "list", bearer_token: "t" });
    expect(calledUrl(fetchMock).pathname).toBe("/api/v1/meeting-hub/sessions");
  });

  it("rejects an unknown action rather than silently doing nothing", async () => {
    const res = await tool("meetings").handler({
      action: "not_a_real_action",
      bearer_token: "t",
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("Unknown action");
  });
});

describe("meetings capability names", () => {
  it("maps every action to its governing capability", () => {
    expect(MEETINGS_CAPABILITIES).toEqual({
      "meetings.list": "meetings.read",
      "meetings.get": "meetings.read",
      "meetings.get_transcript": "meetings.read",
      "meetings.get_summary": "meetings.read",
      "meetings.list_participants": "meetings.read",
      "meetings.list_calendar": "meetings.read",
      "meetings.list_coaching_library": "meetings.read",
      "meetings.get_conversation_config": "meetings.read",
      "meetings.get_conversation_analysis": "meetings.read",
      "meetings.list_feedback": "meetings.read",
      "meetings.get_live_transcript": "meetings.read",
      "meetings.list_notes": "meetings.read",
      "meetings.add_note": "meetings.notes.write",
      "meetings.delete_note": "meetings.notes.write",
      "meetings.correct_transcript": "meetings.transcript.correct",
      "meetings.regenerate_summary": "meetings.summary.regenerate",
      "meetings.create": "meetings.create",
      "meetings.disable_share_link": "meetings.share.revoke",
      "meetings.list_bots": "vexa.bot.read",
      "meetings.list_bot_meetings": "vexa.bot.read",
      "meetings.get_bot_transcript": "vexa.bot.read",
      "meetings.stop_bot": "vexa.bot.stop",
      prospect_list_meetings: "meetings.read",
    });
  });

  it("covers every registered action and flat tool", () => {
    // A tool with no capability name is a tool the 403 layer cannot govern once
    // the route declares one — so the map must not fall behind registration.
    const flat = capture()
      .map((t) => t.name)
      .filter((n) => n !== "meetings");
    for (const name of flat) {
      expect(MEETINGS_CAPABILITIES, `${name} has no capability name`).toHaveProperty(name);
    }
  });
});

describe("meetings pagination", () => {
  it("passes the cursor through to the API unchanged", async () => {
    const fetchMock = mockFetch({ data: [], nextCursor: null });
    await tool("meetings").handler({
      action: "list",
      bearer_token: "t",
      cursor: "eyJzIjoiMjAyNi0wNy0xNyJ9",
      limit: 25,
    });
    const url = calledUrl(fetchMock);
    expect(url.searchParams.get("cursor")).toBe("eyJzIjoiMjAyNi0wNy0xNyJ9");
    expect(url.searchParams.get("limit")).toBe("25");
  });

  it("surfaces the API's nextCursor to the caller instead of truncating", async () => {
    mockFetch({
      data: [{ id: "m1" }],
      nextCursor: "cursor-page-2",
    });
    const res = await tool("meetings").handler({ action: "list", bearer_token: "t" });
    expect(JSON.parse(res.content[0].text).nextCursor).toBe("cursor-page-2");
  });

  it("surfaces a null nextCursor (last page) as null, not as a missing field", async () => {
    mockFetch({ data: [{ id: "m1" }], nextCursor: null });
    const res = await tool("meetings").handler({ action: "list", bearer_token: "t" });
    const body = JSON.parse(res.content[0].text);
    expect(body).toHaveProperty("nextCursor");
    expect(body.nextCursor).toBeNull();
  });

  it("omits cursor entirely on the first page", async () => {
    const fetchMock = mockFetch({ data: [], nextCursor: null });
    await tool("meetings").handler({ action: "list", bearer_token: "t" });
    expect(calledUrl(fetchMock).searchParams.has("cursor")).toBe(false);
  });
});

describe("meetings tenancy", () => {
  it("has no workspace/tenant argument on any tool — the bearer decides", () => {
    // A workspace_id arg would let a caller pick a tenant. prospect_id is a
    // filter within the authenticated workspace, which is a different thing.
    for (const t of capture()) {
      const schema = JSON.stringify(t.config.inputSchema ?? {});
      expect(schema, `${t.name} exposes a tenant selector`).not.toMatch(
        /workspace_?[Ii]d|tenant_?[Ii]d/,
      );
    }
  });

  it("sends prospect_id as a filter param, not a tenant selector", async () => {
    const fetchMock = mockFetch({ data: [], nextCursor: null });
    await tool("prospect_list_meetings").handler({
      bearer_token: "t",
      prospect_id: "11111111-1111-1111-1111-111111111111",
    });
    const url = calledUrl(fetchMock);
    expect(url.searchParams.get("prospectId")).toBe(
      "11111111-1111-1111-1111-111111111111",
    );
    expect(url.pathname).toBe("/api/v1/meeting-hub/sessions");
  });
});

describe("meetings error handling", () => {
  it("surfaces a 400 from the API as an error, not an empty result", async () => {
    mockFetch({ error: "Invalid query parameters", details: [] }, { status: 400 });
    const res = await tool("meetings").handler({ action: "list", bearer_token: "t" });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("400");
  });

  it("never echoes bearer material out of an upstream error body", async () => {
    mockFetch("upstream said: Authorization: Bearer sk-live-supersecret", {
      status: 500,
    });
    const res = await tool("meetings").handler({ action: "list", bearer_token: "t" });
    expect(res.content[0].text).not.toContain("sk-live-supersecret");
    expect(res.content[0].text).toContain("[redacted]");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Single-meeting reads: get, get_transcript, get_summary, list_participants
// ─────────────────────────────────────────────────────────────────────────────

const SID = "22222222-2222-2222-2222-222222222222";

/** N transcript segments, each a distinct sentence. */
function segments(n: number): Array<Record<string, unknown>> {
  return Array.from({ length: n }, (_, i) => ({
    sequenceNumber: i + 1,
    speakerLabel: `Speaker ${i % 2}`,
    participantId: null,
    startMs: i * 1000,
    endMs: i * 1000 + 900,
    text: `This is segment number ${i + 1}.`,
    confidence: 0.9,
  }));
}

describe("single-meeting read actions exist on the grouped tool", () => {
  it("exposes get, get_transcript, get_summary, list_participants", async () => {
    for (const action of ["get", "get_transcript", "get_summary", "list_participants"]) {
      const fetchMock = mockFetch({ data: {} });
      await tool("meetings").handler({ action, bearer_token: "t", id: SID });
      expect(
        calledUrl(fetchMock).pathname.startsWith(`/api/v1/meeting-hub/sessions/${SID}`),
        `action "${action}" should hit the session detail namespace`,
      ).toBe(true);
      vi.unstubAllGlobals();
    }
  });
});

describe("meetings.get (detail)", () => {
  it("GETs /sessions/:id", async () => {
    const fetchMock = mockFetch({ data: { id: SID, currentTranscript: null } });
    await tool("meetings").handler({ action: "get", bearer_token: "t", id: SID });
    expect(calledUrl(fetchMock).pathname).toBe(`/api/v1/meeting-hub/sessions/${SID}`);
  });

  it("omits the embedded transcript segments to control token cost", async () => {
    // MeetingSessionDetailDto.currentTranscript carries the FULL transcript — a
    // detail read must not become a whole-transcript dump.
    mockFetch({
      data: {
        id: SID,
        title: "Q3 review",
        currentTranscript: { versionNumber: 4, segments: segments(800) },
        currentSummary: { summary: "kept" },
      },
    });
    const res = await tool("meetings").handler({ action: "get", bearer_token: "t", id: SID });
    const body = JSON.parse(res.content[0].text);

    expect(body.data.currentTranscript.segments).toEqual([]);
    // The rest of the detail survives untouched.
    expect(body.data.title).toBe("Q3 review");
    expect(body.data.currentSummary.summary).toBe("kept");
    // And the caller is told what happened + where to get the words.
    expect(body.transcriptOmitted.segmentCount).toBe(800);
    expect(body.transcriptOmitted.transcriptVersionNumber).toBe(4);
  });

  it("leaves a detail with no transcript untouched", async () => {
    mockFetch({ data: { id: SID, currentTranscript: null } });
    const res = await tool("meetings").handler({ action: "get", bearer_token: "t", id: SID });
    const body = JSON.parse(res.content[0].text);
    expect(body.data.currentTranscript).toBeNull();
    expect(body).not.toHaveProperty("transcriptOmitted");
  });

  it("surfaces a 404 as a clean not-found, not an exception dump", async () => {
    mockFetch({ error: "Session not found" }, { status: 404 });
    const res = await tool("meetings").handler({ action: "get", bearer_token: "t", id: SID });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("404");
    expect(res.content[0].text).toContain("Session not found");
  });
});

describe("meetings.get_transcript (bounded)", () => {
  it("GETs /sessions/:id/transcript and passes version through", async () => {
    const fetchMock = mockFetch({ data: { versionNumber: 2, segments: segments(3) } });
    await tool("meetings").handler({
      action: "get_transcript",
      bearer_token: "t",
      id: SID,
      version: 2,
    });
    const url = calledUrl(fetchMock);
    expect(url.pathname).toBe(`/api/v1/meeting-hub/sessions/${SID}/transcript`);
    expect(url.searchParams.get("version")).toBe("2");
  });

  it("omits version on the query when not asked for (current version)", async () => {
    const fetchMock = mockFetch({ data: { versionNumber: 5, segments: segments(3) } });
    await tool("meetings").handler({ action: "get_transcript", bearer_token: "t", id: SID });
    expect(calledUrl(fetchMock).searchParams.has("version")).toBe(false);
  });

  it("does NOT bound by dumping every segment — defaults to a 50-segment window", async () => {
    mockFetch({ data: { versionNumber: 1, segments: segments(800) } });
    const res = await tool("meetings").handler({
      action: "get_transcript",
      bearer_token: "t",
      id: SID,
    });
    const body = JSON.parse(res.content[0].text);
    expect(body.data.segments).toHaveLength(50);
    expect(body.transcriptWindow.totalSegments).toBe(800);
    expect(body.transcriptWindow.returnedSegments).toBe(50);
    expect(body.transcriptWindow.offset).toBe(0);
    expect(body.transcriptWindow.nextOffset).toBe(50);
    expect(body.transcriptWindow.truncated).toBe(true);
  });

  it("never sends the client-side offset/limit to the upstream route", async () => {
    const fetchMock = mockFetch({ data: { versionNumber: 1, segments: segments(200) } });
    await tool("meetings").handler({
      action: "get_transcript",
      bearer_token: "t",
      id: SID,
      offset: 50,
      limit: 25,
    });
    const url = calledUrl(fetchMock);
    expect(url.searchParams.has("offset")).toBe(false);
    expect(url.searchParams.has("limit")).toBe(false);
  });

  it("pages via offset + nextOffset", async () => {
    mockFetch({ data: { versionNumber: 1, segments: segments(120) } });
    const res = await tool("meetings").handler({
      action: "get_transcript",
      bearer_token: "t",
      id: SID,
      offset: 50,
      limit: 50,
    });
    const body = JSON.parse(res.content[0].text);
    expect(body.data.segments).toHaveLength(50);
    expect(body.data.segments[0].sequenceNumber).toBe(51);
    expect(body.transcriptWindow.offset).toBe(50);
    expect(body.transcriptWindow.nextOffset).toBe(100);
  });

  it("reports nextOffset null on the last window", async () => {
    mockFetch({ data: { versionNumber: 1, segments: segments(60) } });
    const res = await tool("meetings").handler({
      action: "get_transcript",
      bearer_token: "t",
      id: SID,
      offset: 50,
      limit: 50,
    });
    const body = JSON.parse(res.content[0].text);
    expect(body.data.segments).toHaveLength(10);
    expect(body.transcriptWindow.nextOffset).toBeNull();
    expect(body.transcriptWindow.truncated).toBe(true); // started at 50
  });

  it("rejects a limit past the 200-segment max at the argument gate", async () => {
    mockFetch({ data: { versionNumber: 1, segments: segments(500) } });
    // Grouped tools validate against their strict per-action schema before
    // dispatch, so an out-of-range limit is refused with a usable message
    // rather than silently reinterpreted. (Before the schemas were published
    // correctly this parse lived in the MCP SDK; it now lives in
    // registerGroupedTool — same guarantee, same place in the call order.)
    const res = await tool("meetings").handler({
      action: "get_transcript",
      bearer_token: "t",
      id: SID,
      limit: 5000,
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("limit");
  });

  it("still caps the window at the 200-segment max — defence in depth", async () => {
    mockFetch({ data: { versionNumber: 1, segments: segments(500) } });
    // The gate above is not the only defence: a transcript with more segments
    // than the window must still be cut to the max, so a caller asking for the
    // legal maximum cannot pull 500 segments of tokens.
    const res = await tool("meetings").handler({
      action: "get_transcript",
      bearer_token: "t",
      id: SID,
      limit: 200,
    });
    const body = JSON.parse(res.content[0].text);
    expect(body.data.segments).toHaveLength(200);
    expect(body.transcriptWindow.limit).toBe(200);
  });

  it("handles a short transcript without truncation", async () => {
    mockFetch({ data: { versionNumber: 1, segments: segments(3) } });
    const res = await tool("meetings").handler({
      action: "get_transcript",
      bearer_token: "t",
      id: SID,
    });
    const body = JSON.parse(res.content[0].text);
    expect(body.data.segments).toHaveLength(3);
    expect(body.transcriptWindow.nextOffset).toBeNull();
    expect(body.transcriptWindow.truncated).toBe(false);
  });

  it("surfaces a 400 invalid version cleanly", async () => {
    mockFetch({ error: "Invalid version", details: [] }, { status: 400 });
    const res = await tool("meetings").handler({
      action: "get_transcript",
      bearer_token: "t",
      id: SID,
      version: 1,
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("400");
  });

  it("surfaces a 404 (no such version) cleanly, without a window", async () => {
    mockFetch({ error: "Transcript version not found" }, { status: 404 });
    const res = await tool("meetings").handler({
      action: "get_transcript",
      bearer_token: "t",
      id: SID,
      version: 99,
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("404");
    expect(res.content[0].text).not.toContain("transcriptWindow");
  });
});

describe("meetings.get_summary", () => {
  it("GETs /sessions/:id/summary", async () => {
    const fetchMock = mockFetch({ data: { summary: "We agreed on pricing." } });
    await tool("meetings").handler({ action: "get_summary", bearer_token: "t", id: SID });
    expect(calledUrl(fetchMock).pathname).toBe(
      `/api/v1/meeting-hub/sessions/${SID}/summary`,
    );
  });

  it("surfaces {data: null} (no summary yet) as a clean result, not an error", async () => {
    mockFetch({ data: null });
    const res = await tool("meetings").handler({
      action: "get_summary",
      bearer_token: "t",
      id: SID,
    });
    expect(res.isError).toBeFalsy();
    expect(JSON.parse(res.content[0].text).data).toBeNull();
  });

  it("surfaces a 404 (no such meeting) as a clean not-found", async () => {
    mockFetch({ error: "Session not found" }, { status: 404 });
    const res = await tool("meetings").handler({
      action: "get_summary",
      bearer_token: "t",
      id: SID,
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("404");
  });
});

describe("meetings.list_participants", () => {
  it("GETs /sessions/:id/participants", async () => {
    const fetchMock = mockFetch({ data: [] });
    await tool("meetings").handler({
      action: "list_participants",
      bearer_token: "t",
      id: SID,
    });
    expect(calledUrl(fetchMock).pathname).toBe(
      `/api/v1/meeting-hub/sessions/${SID}/participants`,
    );
  });

  it("returns the roster untouched", async () => {
    const roster = [
      { id: "p1", displayName: "Ada", matchStatus: "suggested", prospectId: null },
    ];
    mockFetch({ data: roster });
    const res = await tool("meetings").handler({
      action: "list_participants",
      bearer_token: "t",
      id: SID,
    });
    expect(JSON.parse(res.content[0].text).data).toEqual(roster);
  });

  it("surfaces a 404 as a clean not-found", async () => {
    mockFetch({ error: "Session not found" }, { status: 404 });
    const res = await tool("meetings").handler({
      action: "list_participants",
      bearer_token: "t",
      id: SID,
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("404");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Calendar, conversation intelligence, notes, transcript/summary writes,
// manual create, share-link revoke, and the Vexa bot proxy.
// ─────────────────────────────────────────────────────────────────────────────

const NOTE_ID = "33333333-3333-3333-3333-333333333333";

/** The RequestInit the tool actually sent upstream. */
function calledInit(fetchMock: ReturnType<typeof mockFetch>): RequestInit {
  return fetchMock.mock.calls[0][1] ?? {};
}

function calledBody(fetchMock: ReturnType<typeof mockFetch>): unknown {
  const body = calledInit(fetchMock).body;
  return typeof body === "string" ? JSON.parse(body) : undefined;
}

function publishedActions(): string[] {
  const shape = tool("meetings").config.inputSchema as Record<
    string,
    { options?: string[]; unwrap?: () => { options: string[] } }
  >;
  const action = shape.action;
  return action.options ?? action.unwrap?.().options ?? [];
}

describe("meetings: no bot dispatch", () => {
  it("never exposes an action that sends a bot into a meeting", () => {
    // POST /vexa/bots needs a signed-in user and is confirm-card gated in
    // max-agent. Stopping a bot is fine; sending one is not an agent's call.
    const actions = publishedActions();
    expect(actions).toContain("stop_bot");
    for (const a of actions) {
      expect(a, `${a} looks like a bot dispatch`).not.toMatch(/send|dispatch|join/);
    }
  });

  it("no action ever POSTs to /api/v1/vexa/bots", async () => {
    const actions = publishedActions();
    const args: Record<string, unknown> = {
      bearer_token: "t",
      id: SID,
      note_id: NOTE_ID,
      platform: "google_meet",
      native_meeting_id: "abc-defg-hij",
      body: "n",
      expected_version: 1,
      changes: [{ sequence_number: 1, text: "x" }],
      title: "t",
      started_at: "2026-07-01T15:00:00Z",
      ended_at: "2026-07-01T16:00:00Z",
    };
    for (const action of actions) {
      const fetchMock = mockFetch({ data: {} });
      await tool("meetings").handler({ action, ...args });
      for (const [url, init] of fetchMock.mock.calls) {
        const posted = (init?.method ?? "GET").toUpperCase() === "POST";
        expect(
          posted && new URL(url).pathname === "/api/v1/vexa/bots",
          `${action} dispatched a bot`,
        ).toBe(false);
      }
      vi.unstubAllGlobals();
    }
  });
});

describe("meetings.list_calendar", () => {
  it("GETs /meeting-hub/calendar with the window + paging query", async () => {
    const fetchMock = mockFetch({ data: [], nextCursor: null });
    await tool("meetings").handler({
      action: "list_calendar",
      bearer_token: "t",
      from: "2026-07-01T00:00:00Z",
      to: "2026-07-08T00:00:00Z",
      limit: 250,
      cursor: "c2",
    });
    const url = calledUrl(fetchMock);
    expect(calledInit(fetchMock).method ?? "GET").toBe("GET");
    expect(url.pathname).toBe("/api/v1/meeting-hub/calendar");
    expect(url.searchParams.get("from")).toBe("2026-07-01T00:00:00Z");
    expect(url.searchParams.get("to")).toBe("2026-07-08T00:00:00Z");
    expect(url.searchParams.get("limit")).toBe("250");
    expect(url.searchParams.get("cursor")).toBe("c2");
  });

  it("rejects a limit past the calendar max", async () => {
    const res = await tool("meetings").handler({
      action: "list_calendar",
      bearer_token: "t",
      limit: 251,
    });
    expect(res.isError).toBe(true);
  });
});

describe("meetings conversation-intelligence + feedback reads", () => {
  it.each([
    ["list_coaching_library", "/api/v1/meeting-hub/coaching-library", {}],
    ["get_conversation_config", "/api/v1/meeting-hub/conversation-configuration", {}],
    [
      "get_conversation_analysis",
      `/api/v1/meeting-hub/sessions/${SID}/conversation-intelligence`,
      { id: SID },
    ],
    ["list_feedback", `/api/v1/meeting-hub/sessions/${SID}/feedback`, { id: SID }],
    ["list_notes", `/api/v1/meeting-hub/sessions/${SID}/notes`, { id: SID }],
    ["list_bots", "/api/v1/vexa/bots/activity", {}],
    ["list_bot_meetings", "/api/v1/vexa/meetings", {}],
  ])("%s GETs %s", async (action, path, extra) => {
    const fetchMock = mockFetch({ data: [] });
    await tool("meetings").handler({ action, bearer_token: "t", ...extra });
    expect(calledInit(fetchMock).method ?? "GET").toBe("GET");
    expect(calledUrl(fetchMock).pathname).toBe(path);
  });
});

describe("meetings.get_live_transcript", () => {
  it("GETs /sessions/:id/live-transcript and windows the segments", async () => {
    const fetchMock = mockFetch({ data: { live: true, segments: segments(120) } });
    const res = await tool("meetings").handler({
      action: "get_live_transcript",
      bearer_token: "t",
      id: SID,
      offset: 100,
    });
    expect(calledUrl(fetchMock).pathname).toBe(
      `/api/v1/meeting-hub/sessions/${SID}/live-transcript`,
    );
    expect(calledUrl(fetchMock).searchParams.has("offset")).toBe(false);
    const body = JSON.parse(res.content[0].text);
    expect(body.data.live).toBe(true);
    expect(body.data.segments).toHaveLength(20);
    expect(body.transcriptWindow.totalSegments).toBe(120);
    expect(body.transcriptWindow.nextOffset).toBeNull();
  });

  it("passes a not-live answer through", async () => {
    mockFetch({ data: { live: false, segments: [] } });
    const res = await tool("meetings").handler({
      action: "get_live_transcript",
      bearer_token: "t",
      id: SID,
    });
    expect(JSON.parse(res.content[0].text).data.live).toBe(false);
  });
});

describe("meetings notes", () => {
  it("add_note POSTs the typed note body", async () => {
    const fetchMock = mockFetch({ data: { id: NOTE_ID } }, { status: 201 });
    await tool("meetings").handler({
      action: "add_note",
      bearer_token: "t",
      id: SID,
      body: "Follow up on pricing",
      format: "markdown",
    });
    expect(calledInit(fetchMock).method).toBe("POST");
    expect(calledUrl(fetchMock).pathname).toBe(`/api/v1/meeting-hub/sessions/${SID}/notes`);
    expect(calledBody(fetchMock)).toEqual({ body: "Follow up on pricing", format: "markdown" });
  });

  it("add_note rejects an empty note at the argument gate", async () => {
    const fetchMock = mockFetch({});
    const res = await tool("meetings").handler({
      action: "add_note",
      bearer_token: "t",
      id: SID,
      body: "",
    });
    expect(res.isError).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("delete_note DELETEs /sessions/:id/notes/:noteId", async () => {
    const fetchMock = mockFetch({ success: true });
    await tool("meetings").handler({
      action: "delete_note",
      bearer_token: "t",
      id: SID,
      note_id: NOTE_ID,
    });
    expect(calledInit(fetchMock).method).toBe("DELETE");
    expect(calledUrl(fetchMock).pathname).toBe(
      `/api/v1/meeting-hub/sessions/${SID}/notes/${NOTE_ID}`,
    );
  });
});

describe("meetings.correct_transcript", () => {
  it("PATCHes /sessions/:id/segments with a camelCase batch", async () => {
    const fetchMock = mockFetch(
      { data: { versionNumber: 3, segments: [] }, segmentCount: 0, summaryRegenerationQueued: true },
      { status: 201 },
    );
    await tool("meetings").handler({
      action: "correct_transcript",
      bearer_token: "t",
      id: SID,
      expected_version: 2,
      changes: [
        { sequence_number: 14, text: "We start the pilot on May 4th." },
        { sequence_number: 15, text: "Procurement joins next call." },
      ],
      change_summary: "Fixed the date",
    });
    expect(calledInit(fetchMock).method).toBe("PATCH");
    expect(calledUrl(fetchMock).pathname).toBe(`/api/v1/meeting-hub/sessions/${SID}/segments`);
    expect(calledBody(fetchMock)).toEqual({
      expectedVersion: 2,
      changes: [
        { sequenceNumber: 14, text: "We start the pilot on May 4th." },
        { sequenceNumber: 15, text: "Procurement joins next call." },
      ],
      changeSummary: "Fixed the date",
    });
  });

  it("omits the echoed segments of the new version but keeps its metadata", async () => {
    mockFetch(
      {
        data: { id: "v3", versionNumber: 3, segments: segments(900) },
        segmentCount: 900,
        summaryRegenerationQueued: true,
      },
      { status: 201 },
    );
    const res = await tool("meetings").handler({
      action: "correct_transcript",
      bearer_token: "t",
      id: SID,
      expected_version: 2,
      changes: [{ sequence_number: 1, text: "x" }],
    });
    const body = JSON.parse(res.content[0].text);
    expect(body.data.segments).toEqual([]);
    expect(body.data.versionNumber).toBe(3);
    expect(body.summaryRegenerationQueued).toBe(true);
    expect(body.segmentsOmitted.segmentCount).toBe(900);
  });

  it("surfaces a 409 version_conflict untouched", async () => {
    mockFetch(
      { error: "moved on", code: "version_conflict", currentVersionNumber: 5 },
      { status: 409 },
    );
    const res = await tool("meetings").handler({
      action: "correct_transcript",
      bearer_token: "t",
      id: SID,
      expected_version: 2,
      changes: [{ sequence_number: 1, text: "x" }],
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("409");
    expect(res.content[0].text).toContain("version_conflict");
  });
});

describe("meetings summary / create / share-link writes", () => {
  it("regenerate_summary POSTs /sessions/:id/summary/regenerate", async () => {
    const fetchMock = mockFetch({ data: { stage: "generate_summary" } }, { status: 202 });
    await tool("meetings").handler({ action: "regenerate_summary", bearer_token: "t", id: SID });
    expect(calledInit(fetchMock).method).toBe("POST");
    expect(calledUrl(fetchMock).pathname).toBe(
      `/api/v1/meeting-hub/sessions/${SID}/summary/regenerate`,
    );
  });

  it("create POSTs /sessions with the camelCase body the strict schema expects", async () => {
    const fetchMock = mockFetch({ id: SID }, { status: 201 });
    await tool("meetings").handler({
      action: "create",
      bearer_token: "t",
      title: "Pricing call",
      started_at: "2026-07-01T15:00:00Z",
      ended_at: "2026-07-01T16:00:00Z",
      meeting_url: "https://meet.google.com/abc-defg-hij",
    });
    expect(calledInit(fetchMock).method).toBe("POST");
    expect(calledUrl(fetchMock).pathname).toBe("/api/v1/meeting-hub/sessions");
    expect(calledBody(fetchMock)).toEqual({
      title: "Pricing call",
      startedAt: "2026-07-01T15:00:00Z",
      endedAt: "2026-07-01T16:00:00Z",
      meetingUrl: "https://meet.google.com/abc-defg-hij",
    });
  });

  it("create sends no meetingUrl key when none was given", async () => {
    const fetchMock = mockFetch({ id: SID }, { status: 201 });
    await tool("meetings").handler({
      action: "create",
      bearer_token: "t",
      title: "Pricing call",
      started_at: "2026-07-01T15:00:00Z",
      ended_at: "2026-07-01T16:00:00Z",
    });
    expect(calledBody(fetchMock)).not.toHaveProperty("meetingUrl");
  });

  it("disable_share_link DELETEs /sessions/:id/share-link", async () => {
    const fetchMock = mockFetch({ success: true });
    await tool("meetings").handler({ action: "disable_share_link", bearer_token: "t", id: SID });
    expect(calledInit(fetchMock).method).toBe("DELETE");
    expect(calledUrl(fetchMock).pathname).toBe(`/api/v1/meeting-hub/sessions/${SID}/share-link`);
  });
});

describe("meetings Vexa bot actions", () => {
  it("get_bot_transcript encodes the path and windows top-level segments", async () => {
    const vexaSegments = Array.from({ length: 70 }, (_, i) => ({
      speaker: "A",
      text: `s${i}`,
      start: i,
      end: i + 1,
    }));
    const fetchMock = mockFetch({ segments: vexaSegments });
    const res = await tool("meetings").handler({
      action: "get_bot_transcript",
      bearer_token: "t",
      platform: "teams",
      native_meeting_id: "19:meeting_abc@thread.v2",
    });
    const raw = fetchMock.mock.calls[0][0];
    expect(raw).toContain(
      `/api/v1/vexa/transcripts/teams/${encodeURIComponent("19:meeting_abc@thread.v2")}`,
    );
    const body = JSON.parse(res.content[0].text);
    expect(body.segments).toHaveLength(50);
    expect(body.transcriptWindow.totalSegments).toBe(70);
    expect(body.transcriptWindow.nextOffset).toBe(50);
  });

  it("stop_bot DELETEs /vexa/bots/:platform/:nativeMeetingId", async () => {
    const fetchMock = mockFetch({ stopped: true });
    await tool("meetings").handler({
      action: "stop_bot",
      bearer_token: "t",
      platform: "google_meet",
      native_meeting_id: "abc-defg-hij",
    });
    expect(calledInit(fetchMock).method).toBe("DELETE");
    expect(calledUrl(fetchMock).pathname).toBe("/api/v1/vexa/bots/google_meet/abc-defg-hij");
  });

  it("stop_bot rejects an unknown platform before calling upstream", async () => {
    const fetchMock = mockFetch({});
    const res = await tool("meetings").handler({
      action: "stop_bot",
      bearer_token: "t",
      platform: "webex",
      native_meeting_id: "123",
    });
    expect(res.isError).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces 409 (Vexa not connected) as an error", async () => {
    mockFetch({ error: "Vexa not connected" }, { status: 409 });
    const res = await tool("meetings").handler({ action: "list_bots", bearer_token: "t" });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("Vexa not connected");
  });
});

describe("meetings group annotations", () => {
  it("is not read-only and is flagged destructive now that it can delete/stop", () => {
    const annotations = tool("meetings").config.annotations as Record<string, boolean>;
    expect(annotations.readOnlyHint).toBe(false);
    expect(annotations.destructiveHint).toBe(true);
  });
});

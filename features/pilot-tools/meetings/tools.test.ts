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
  it("registers meetings.read for every read tool", () => {
    expect(MEETINGS_CAPABILITIES).toEqual({
      "meetings.list": "meetings.read",
      "meetings.get": "meetings.read",
      "meetings.get_transcript": "meetings.read",
      "meetings.get_summary": "meetings.read",
      "meetings.list_participants": "meetings.read",
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

  it("caps the window at the 200-segment max even if a larger limit slips through", async () => {
    mockFetch({ data: { versionNumber: 1, segments: segments(500) } });
    // The schema caps limit at 200; assert the transform enforces it too, so a
    // client that bypasses validation still cannot demand 500 segments.
    const res = await tool("meetings").handler({
      action: "get_transcript",
      bearer_token: "t",
      id: SID,
      limit: 5000,
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

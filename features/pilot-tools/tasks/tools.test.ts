import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { z } from "zod";
import type { McpServer } from "@/features/pilot-tools/shared";
import {
  registerTaskTools,
  TASKS_CAPABILITIES,
} from "@/features/pilot-tools/tasks/tools";
import * as repo from "@/features/pilot-tools/tasks/repository";
import * as S from "@/features/pilot-tools/tasks/schema";

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
  registerTaskTools(server);
  return tools;
}

function tool(name: string): Captured {
  const found = capture().find((t) => t.name === name);
  if (!found) throw new Error(`tool "${name}" was not registered`);
  return found;
}

/** The `tasks` grouped tool's discriminated-union input schema. */
function tasksSchema(): z.ZodTypeAny {
  return tool("tasks").config.inputSchema as z.ZodTypeAny;
}

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

function calledUrl(fetchMock: ReturnType<typeof mockFetch>): URL {
  return new URL(fetchMock.mock.calls[0][0]);
}

function calledBody(fetchMock: ReturnType<typeof mockFetch>): Record<string, unknown> {
  return JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
}

function calledMethod(fetchMock: ReturnType<typeof mockFetch>): string | undefined {
  return fetchMock.mock.calls[0][1]?.method;
}

const UUID = "11111111-1111-1111-1111-111111111111";
const ISO = "2026-07-17T10:00:00.000Z";

beforeEach(() => {
  process.env.DIGITALCREW_API_BASE_URL = "https://api.test";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("tasks tool registration", () => {
  it("registers the grouped `tasks` tool and flat prospect_list_tasks", () => {
    const names = capture().map((t) => t.name);
    expect(names).toContain("tasks");
    expect(names).toContain("prospect_list_tasks");
  });

  it("exposes exactly the five intended actions", async () => {
    for (const action of ["list", "get", "create_suggestion", "update", "complete"]) {
      const parsed = tasksSchema().safeParse({
        action,
        id: UUID,
        title: "x",
        expected_version: ISO,
      });
      expect(parsed.success, `action "${action}" should be valid`).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The human review gate. These are the tests that matter most in this file: if
// any of them fails, an agent can approve its own suggestion and the whole
// suggested→approved lifecycle is decoration.
// ─────────────────────────────────────────────────────────────────────────────

describe("no tool can approve a task", () => {
  it("registers no tool whose name suggests approval or rejection", () => {
    for (const t of capture()) {
      expect(t.name).not.toMatch(/approve|reject/i);
    }
  });

  it("offers no approve/reject/delete action on the grouped tool", () => {
    for (const action of ["approve", "reject", "delete", "approve_task"]) {
      const parsed = tasksSchema().safeParse({ action, id: UUID });
      expect(parsed.success, `action "${action}" must not exist`).toBe(false);
    }
  });

  it("exports no approve/reject/delete function from the repository", () => {
    // A wrapper here could not succeed anyway (max-agent 403s API-key callers),
    // it would only give a model something to call and retry against.
    for (const name of Object.keys(repo)) {
      expect(name).not.toMatch(/approve|reject|delete/i);
    }
  });

  it("will not let `update` set status to approved or rejected", () => {
    for (const status of ["approved", "rejected"]) {
      const parsed = tasksSchema().safeParse({
        action: "update",
        id: UUID,
        expected_version: ISO,
        status,
      });
      expect(parsed.success, `update must not accept status="${status}"`).toBe(false);
    }
  });

  it("still allows the legal agent-driven transitions", () => {
    for (const status of ["in_progress", "completed", "cancelled"]) {
      const parsed = tasksSchema().safeParse({
        action: "update",
        id: UUID,
        expected_version: ISO,
        status,
      });
      expect(parsed.success, `update should accept status="${status}"`).toBe(true);
    }
  });

  it("keeps approved/rejected out of the agent-settable status list", () => {
    expect(S.TASK_AGENT_SETTABLE_STATUSES).not.toContain("approved");
    expect(S.TASK_AGENT_SETTABLE_STATUSES).not.toContain("rejected");
  });

  it("still allows filtering a LIST by approved — reading is not reviewing", () => {
    const parsed = tasksSchema().safeParse({
      action: "list",
      status: ["approved", "rejected"],
    });
    expect(parsed.success).toBe(true);
  });
});

describe("create_suggestion can only ever create status='suggested'", () => {
  it("sends status='suggested' explicitly on every create", async () => {
    const fetchMock = mockFetch({ data: { id: UUID } }, { status: 201 });
    await tool("tasks").handler({
      action: "create_suggestion",
      bearer_token: "t",
      title: "Follow up on pricing",
    });
    const body = calledBody(fetchMock);
    expect(body.status).toBe("suggested");
    expect(calledUrl(fetchMock).pathname).toBe("/api/v1/tasks");
    expect(calledMethod(fetchMock)).toBe("POST");
  });

  it("exposes no status argument at all", () => {
    expect(S.createTaskSuggestionSchema.shape).not.toHaveProperty("status");
  });

  it("drops a status the caller tries to smuggle past the schema", async () => {
    // Belt and braces: the schema already has no status field, but the handler
    // must not forward one either if a client bypasses validation.
    const fetchMock = mockFetch({ data: { id: UUID } }, { status: 201 });
    await tool("tasks").handler({
      action: "create_suggestion",
      bearer_token: "t",
      title: "Sneaky",
      status: "approved",
    });
    expect(calledBody(fetchMock).status).toBe("suggested");
  });

  it("rejects status='approved' at the schema boundary", () => {
    const parsed = tasksSchema().safeParse({
      action: "create_suggestion",
      title: "Sneaky",
      status: "approved",
    });
    // Zod strips unknown keys rather than failing, so assert the parsed output
    // carries no status the handler could act on.
    if (parsed.success) {
      expect(parsed.data).not.toHaveProperty("status");
    }
  });

  it("forwards lineage and dedup_key so retries stay idempotent", async () => {
    const fetchMock = mockFetch({ data: { id: UUID }, deduplicated: true });
    await tool("tasks").handler({
      action: "create_suggestion",
      bearer_token: "t",
      title: "Send the deck",
      session_id: UUID,
      source_summary_id: UUID,
      dedup_key: `${UUID}:send-the-deck:max`,
    });
    const body = calledBody(fetchMock);
    expect(body.sessionId).toBe(UUID);
    expect(body.sourceSummaryId).toBe(UUID);
    expect(body.dedupKey).toBe(`${UUID}:send-the-deck:max`);
    expect(body.status).toBe("suggested");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Optimistic concurrency
// ─────────────────────────────────────────────────────────────────────────────

describe("expectedVersion and the 409 conflict", () => {
  it("requires expected_version on update", () => {
    const parsed = tasksSchema().safeParse({
      action: "update",
      id: UUID,
      title: "no version",
    });
    expect(parsed.success).toBe(false);
  });

  it("requires expected_version on complete", () => {
    const parsed = tasksSchema().safeParse({ action: "complete", id: UUID });
    expect(parsed.success).toBe(false);
  });

  it("sends expectedVersion as the PATCH body token", async () => {
    const fetchMock = mockFetch({ data: { id: UUID } });
    await tool("tasks").handler({
      action: "update",
      bearer_token: "t",
      id: UUID,
      expected_version: ISO,
      title: "Renamed",
    });
    const body = calledBody(fetchMock);
    expect(body.expectedVersion).toBe(ISO);
    expect(body.title).toBe("Renamed");
    expect(calledMethod(fetchMock)).toBe("PATCH");
    expect(calledUrl(fetchMock).pathname).toBe(`/api/v1/tasks/${UUID}`);
  });

  it("surfaces a 409 conflict as an error instead of swallowing it", async () => {
    const conflict = {
      error: "Task was modified by someone else. Reload and retry with the current version.",
      code: "version_conflict",
      current: { id: UUID, updatedAt: "2026-07-17T11:00:00.000Z" },
    };
    mockFetch(conflict, { status: 409 });

    const res = await tool("tasks").handler({
      action: "update",
      bearer_token: "t",
      id: UUID,
      expected_version: ISO,
      title: "Renamed",
    });

    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("409");
    // The caller needs the CURRENT version to reconcile — a conflict reported
    // without it just invites a blind retry.
    expect(res.content[0].text).toContain("version_conflict");
    expect(res.content[0].text).toContain("2026-07-17T11:00:00.000Z");
  });

  it("does not retry a 409 away", async () => {
    const fetchMock = mockFetch({ code: "version_conflict" }, { status: 409 });
    await tool("tasks").handler({
      action: "update",
      bearer_token: "t",
      id: UUID,
      expected_version: ISO,
      title: "Renamed",
    });
    // One attempt only: a conflict is the caller's to resolve, and retrying it
    // would either fail identically or clobber someone else's edit.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("surfaces an invalid transition (409) when completing an unreviewed suggestion", async () => {
    mockFetch(
      { error: "Cannot transition task from 'suggested' to 'completed'", code: "invalid_transition" },
      { status: 409 },
    );
    const res = await tool("tasks").handler({
      action: "complete",
      bearer_token: "t",
      id: UUID,
      expected_version: ISO,
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("invalid_transition");
  });

  it("surfaces the 403 when max-agent refuses an agent-driven review", async () => {
    // Defense in depth: the schema already blocks status=approved, but if the
    // route ever 403s us we report it rather than dressing it up as success.
    mockFetch(
      { error: "Only a signed-in user can approve a task.", code: "human_review_required" },
      { status: 403 },
    );
    const res = await tool("tasks").handler({
      action: "update",
      bearer_token: "t",
      id: UUID,
      expected_version: ISO,
      status: "in_progress",
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("403");
    expect(res.content[0].text).toContain("human_review_required");
  });
});

describe("complete", () => {
  it("PATCHes status=completed with the version token", async () => {
    const fetchMock = mockFetch({ data: { id: UUID, status: "completed" } });
    await tool("tasks").handler({
      action: "complete",
      bearer_token: "t",
      id: UUID,
      expected_version: ISO,
    });
    expect(calledBody(fetchMock)).toEqual({
      status: "completed",
      expectedVersion: ISO,
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Pagination
// ─────────────────────────────────────────────────────────────────────────────

describe("tasks pagination", () => {
  it("passes the cursor and limit through to the API", async () => {
    const fetchMock = mockFetch({ data: [] });
    await tool("tasks").handler({
      action: "list",
      bearer_token: "t",
      cursor: ISO,
      limit: 10,
    });
    const url = calledUrl(fetchMock);
    expect(url.searchParams.get("cursor")).toBe(ISO);
    expect(url.searchParams.get("limit")).toBe("10");
  });

  it("derives nextCursor from the last row of a FULL page", async () => {
    // GET /api/v1/tasks returns no nextCursor of its own, but IS keyset
    // paginated on created_at DESC — so a full page means "there is more".
    mockFetch({
      data: [
        { id: "t1", createdAt: "2026-07-17T12:00:00.000Z" },
        { id: "t2", createdAt: "2026-07-17T11:00:00.000Z" },
      ],
    });
    const res = await tool("tasks").handler({
      action: "list",
      bearer_token: "t",
      limit: 2,
    });
    expect(JSON.parse(res.content[0].text).nextCursor).toBe("2026-07-17T11:00:00.000Z");
  });

  it("reports nextCursor null on a short page (the last page)", async () => {
    mockFetch({ data: [{ id: "t1", createdAt: "2026-07-17T12:00:00.000Z" }] });
    const res = await tool("tasks").handler({
      action: "list",
      bearer_token: "t",
      limit: 10,
    });
    const body = JSON.parse(res.content[0].text);
    expect(body).toHaveProperty("nextCursor");
    expect(body.nextCursor).toBeNull();
  });

  it("reports nextCursor null on an empty page", async () => {
    mockFetch({ data: [] });
    const res = await tool("tasks").handler({ action: "list", bearer_token: "t", limit: 5 });
    expect(JSON.parse(res.content[0].text).nextCursor).toBeNull();
  });

  it("uses the API's default page size (50) when no limit is given", async () => {
    const data = Array.from({ length: 50 }, (_, i) => ({
      id: `t${i}`,
      createdAt: `2026-07-17T${String(23 - Math.floor(i / 3)).padStart(2, "0")}:00:00.000Z`,
    }));
    mockFetch({ data });
    const res = await tool("tasks").handler({ action: "list", bearer_token: "t" });
    // A full default page must still advertise more, or callers silently stop
    // at 50 tasks and never learn there were more.
    expect(JSON.parse(res.content[0].text).nextCursor).toBe(data[49].createdAt);
  });

  it("defers to the API's own nextCursor if the route grows one", async () => {
    mockFetch({
      data: [{ id: "t1", createdAt: "2026-07-17T12:00:00.000Z" }],
      nextCursor: "upstream-cursor",
    });
    const res = await tool("tasks").handler({ action: "list", bearer_token: "t", limit: 1 });
    expect(JSON.parse(res.content[0].text).nextCursor).toBe("upstream-cursor");
  });

  it("preserves the rest of the payload while adding nextCursor", async () => {
    mockFetch({ data: [{ id: "t1", createdAt: ISO }], somethingElse: 42 });
    const res = await tool("tasks").handler({ action: "list", bearer_token: "t", limit: 5 });
    const body = JSON.parse(res.content[0].text);
    expect(body.data).toHaveLength(1);
    expect(body.somethingElse).toBe(42);
  });

  it("leaves an error response untouched rather than inventing a cursor", async () => {
    mockFetch({ error: "Invalid query parameters" }, { status: 400 });
    const res = await tool("tasks").handler({ action: "list", bearer_token: "t" });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).not.toContain("nextCursor");
  });

  it("repeats multi-status filters as separate query params", async () => {
    const fetchMock = mockFetch({ data: [] });
    await tool("tasks").handler({
      action: "list",
      bearer_token: "t",
      status: ["suggested", "approved"],
    });
    expect(calledUrl(fetchMock).searchParams.getAll("status")).toEqual([
      "suggested",
      "approved",
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Capabilities + tenancy
// ─────────────────────────────────────────────────────────────────────────────

describe("tasks capability names", () => {
  it("registers the expected capability per action", () => {
    expect(TASKS_CAPABILITIES).toEqual({
      "tasks.list": "tasks.read",
      "tasks.get": "tasks.read",
      "tasks.create_suggestion": "tasks.suggest",
      "tasks.update": "tasks.update",
      "tasks.complete": "tasks.complete",
      prospect_list_tasks: "tasks.read",
    });
  });

  it("never names an approve/reject capability", () => {
    for (const capability of Object.values(TASKS_CAPABILITIES)) {
      expect(capability).not.toMatch(/approve|reject/i);
    }
  });

  it("gives reads and writes distinct capabilities", () => {
    // Otherwise granting an agent read access would hand it write access too.
    expect(TASKS_CAPABILITIES["tasks.list"]).not.toBe(
      TASKS_CAPABILITIES["tasks.create_suggestion"],
    );
    expect(TASKS_CAPABILITIES["tasks.list"]).not.toBe(TASKS_CAPABILITIES["tasks.update"]);
  });
});

describe("tasks tenancy", () => {
  it("has no workspace/tenant argument on any tool — the bearer decides", () => {
    for (const t of capture()) {
      const schema = JSON.stringify(t.config.inputSchema ?? {});
      expect(schema, `${t.name} exposes a tenant selector`).not.toMatch(
        /workspace_?[Ii]d|tenant_?[Ii]d/,
      );
    }
  });

  it("never sends a workspaceId in a create body", async () => {
    const fetchMock = mockFetch({ data: { id: UUID } }, { status: 201 });
    await tool("tasks").handler({
      action: "create_suggestion",
      bearer_token: "t",
      title: "x",
      prospect_id: UUID,
    });
    const body = calledBody(fetchMock);
    expect(body).not.toHaveProperty("workspaceId");
    // prospect_id is a filter/attribute within the workspace, not a selector.
    expect(body.prospectId).toBe(UUID);
  });

  it("sends prospect_id as a filter param on prospect_list_tasks", async () => {
    const fetchMock = mockFetch({ data: [] });
    await tool("prospect_list_tasks").handler({ bearer_token: "t", prospect_id: UUID });
    const url = calledUrl(fetchMock);
    expect(url.pathname).toBe("/api/v1/tasks");
    expect(url.searchParams.get("prospectId")).toBe(UUID);
  });
});

describe("tasks error handling", () => {
  it("never echoes bearer material out of an upstream error body", async () => {
    mockFetch("failed for Authorization: Bearer sk-live-supersecret", { status: 400 });
    const res = await tool("tasks").handler({ action: "list", bearer_token: "t" });
    expect(res.content[0].text).not.toContain("sk-live-supersecret");
    expect(res.content[0].text).toContain("[redacted]");
  });
});

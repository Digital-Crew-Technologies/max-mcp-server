import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { McpServer } from "@/features/pilot-tools/shared";
import {
  registerCustomFieldsTools,
  CUSTOM_FIELDS_CAPABILITIES,
} from "@/features/pilot-tools/custom-fields/tools";
import * as repo from "@/features/pilot-tools/custom-fields/repository";

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
  registerCustomFieldsTools(server);
  return tools;
}

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

beforeEach(() => {
  process.env.DIGITALCREW_API_BASE_URL = "https://api.test";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("custom-fields tool registration", () => {
  it("registers ONLY the read tool — the registry is admin-managed", () => {
    // Field definitions shape every custom_fields write across the workspace;
    // creating/renaming/archiving them is workspace-admin configuration in the
    // web app. If a mutation tool ever appears here, that gate is gone.
    const tools = capture();
    expect(tools.map((t) => t.name)).toEqual(["list_custom_fields"]);
    for (const name of Object.keys(repo)) {
      expect(name).not.toMatch(/create|update|delete|archive/i);
    }
  });

  it("is annotated read-only", () => {
    const [t] = capture();
    expect(
      (t.config.annotations as Record<string, unknown> | undefined)?.readOnlyHint,
    ).toBe(true);
  });

  it("has no workspace/tenant argument — the bearer decides", () => {
    const [t] = capture();
    expect(JSON.stringify(t.config.inputSchema ?? {})).not.toMatch(
      /workspace_?[Ii]d|tenant_?[Ii]d/,
    );
  });

  it("names a capability for the 403 layer", () => {
    expect(CUSTOM_FIELDS_CAPABILITIES).toEqual({
      list_custom_fields: "custom_fields.read",
    });
  });
});

describe("custom-fields read", () => {
  it("maps entity_type and include_archived onto the API's query params", async () => {
    const fetchMock = mockFetch({ data: [] });
    await capture()[0].handler({
      bearer_token: "t",
      entity_type: "deal",
      include_archived: true,
    });
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.pathname).toBe("/api/v1/custom-fields");
    expect(url.searchParams.get("entity_type")).toBe("deal");
    expect(url.searchParams.get("includeArchived")).toBe("true");
  });

  it("omits includeArchived unless asked — archived fields are noise by default", async () => {
    const fetchMock = mockFetch({ data: [] });
    await capture()[0].handler({ bearer_token: "t" });
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.searchParams.has("includeArchived")).toBe(false);
    expect(url.searchParams.has("entity_type")).toBe(false);
  });
});

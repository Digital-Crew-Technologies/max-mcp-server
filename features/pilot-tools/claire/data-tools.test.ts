import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { McpServer } from "../shared";
import { CLAIRE_DATA_TOOL_NAMES, registerClaireDataTools } from "./data-tools";

type Captured = {
  name: string;
  config: { description: string; inputSchema: { safeParse: (value: unknown) => { success: boolean } } };
  handler: (input: Record<string, unknown>) => Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }>;
};

function capture(): Captured[] {
  const tools: Captured[] = [];
  const server: McpServer = {
    registerTool(name, config, handler) {
      tools.push({ name, config: config as Captured["config"], handler });
    },
  };
  registerClaireDataTools(server);
  return tools;
}
const tool = (name: string) => capture().find((entry) => entry.name === name)!;

function mockFetch(status = 200, body: unknown = { data: { status: "ok", charged_credits: 26 } }) {
  const fn = vi.fn(async (_url: string, _init?: RequestInit) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

beforeEach(() => {
  vi.stubEnv("DIGITALCREW_API_BASE_URL", "https://max.test");
  vi.stubEnv("ALLOW_ENV_TOKEN_FALLBACK", "false");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("Claire paid data tools", () => {
  it("registers one tool per operation, each warning that it costs credits", () => {
    const tools = capture();
    expect(tools.map((entry) => entry.name)).toEqual(CLAIRE_DATA_TOOL_NAMES);
    expect(tools).toHaveLength(13);
    for (const entry of tools) {
      expect(entry.name).toMatch(/^claire_/);
      expect(entry.config.description).toContain("COSTS CREDITS");
      expect(entry.config.description).toContain("max_cost_usd");
    }
  });

  it("sends the operation, its params and the price cap to max-agent with the caller's bearer", async () => {
    const fetchMock = mockFetch();
    const result = await tool("claire_enrich_person").handler({
      bearer_token: "member-token", linkedin: "https://www.linkedin.com/in/jane", include_contact: true, max_cost_usd: 0.05,
    });
    expect(result.isError).not.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://max.test/api/v1/claire/data");
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer member-token");
    // The bearer never travels in the body, and the cap is not mixed into the params.
    expect(JSON.parse(String(init?.body))).toEqual({
      operation: "enrich_person",
      params: { linkedin: "https://www.linkedin.com/in/jane", include_contact: true },
      max_cost_usd: 0.05,
    });
  });

  it("omits the cap when none was given, and maps each tool to its own operation", async () => {
    const fetchMock = mockFetch();
    await tool("claire_find_people").handler({ bearer_token: "t", company_domain: "example.com", title: "CTO", limit: 5 });
    await tool("claire_verify_email").handler({ bearer_token: "t", email: "jane@example.com" });
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      operation: "find_people", params: { company_domain: "example.com", title: "CTO", limit: 5 },
    });
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
      operation: "verify_email", params: { email: "jane@example.com" },
    });
  });

  it("never retries a paid lookup that failed", async () => {
    const fetchMock = mockFetch(502, { error: "Claire couldn't complete this lookup right now." });
    const result = await tool("claire_enrich_company").handler({ bearer_token: "t", domain: "example.com" });
    expect(result.isError).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("validates inputs: a bounded row limit, a positive cap, a real email and URL", () => {
    const people = tool("claire_find_people").config.inputSchema;
    expect(people.safeParse({ q: "CTOs in Paris", limit: 10, max_cost_usd: 0.05 }).success).toBe(true);
    expect(people.safeParse({ q: "CTOs", limit: 500 }).success).toBe(false);
    expect(people.safeParse({ q: "CTOs", max_cost_usd: 0 }).success).toBe(false);
    expect(tool("claire_verify_email").config.inputSchema.safeParse({ email: "not-an-email" }).success).toBe(false);
    expect(tool("claire_get_linkedin_profile").config.inputSchema.safeParse({ linkedin_url: "jane" }).success).toBe(false);
  });
});

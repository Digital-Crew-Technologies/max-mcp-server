import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { McpServer } from "@/features/pilot-tools/shared";
import { registerEnrichmentTools } from "@/features/pilot-tools/enrichment/tools";

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
  registerEnrichmentTools(server);
  return tools;
}

function tool(name: string): Captured {
  const found = capture().find((t) => t.name === name);
  if (!found) throw new Error(`tool "${name}" was not registered`);
  return found;
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

function calledMethod(fetchMock: ReturnType<typeof mockFetch>): string {
  return fetchMock.mock.calls[0][1]?.method ?? "GET";
}

function calledBody(fetchMock: ReturnType<typeof mockFetch>): Record<string, unknown> {
  return JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
}

const UUID = "11111111-1111-1111-1111-111111111111";
const UUID2 = "22222222-2222-2222-2222-222222222222";

beforeEach(() => {
  process.env.DIGITALCREW_API_BASE_URL = "https://api.test";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("contact enrichment tools", () => {
  it("registers the contact-enrichment, verification and preview tools", () => {
    const names = capture().map((t) => t.name);
    for (const name of [
      "enrich_contact_details",
      "get_contact_enrichment_job",
      "verify_emails",
      "get_email_verification_job",
      "preview_enrichment",
    ]) {
      expect(names).toContain(name);
    }
  });

  it("enrich_contact_details POSTs the body without the bearer token", async () => {
    const fetchMock = mockFetch({ data: { job_id: UUID } }, { status: 202 });
    await tool("enrich_contact_details").handler({
      bearer_token: "t",
      list_id: UUID,
      fields: ["email"],
      only_missing: true,
      verify_after: true,
    });
    expect(calledMethod(fetchMock)).toBe("POST");
    expect(calledUrl(fetchMock).pathname).toBe("/api/v1/contact-enrichment/enrich");
    expect(calledBody(fetchMock)).toEqual({
      list_id: UUID,
      fields: ["email"],
      only_missing: true,
      verify_after: true,
    });
  });

  it("does not retry a credit-charging enrich call", async () => {
    const fetchMock = mockFetch({ error: "unavailable" }, { status: 503 });
    const res = await tool("enrich_contact_details").handler({
      bearer_token: "t",
      prospect_ids: [UUID],
    });
    expect(res.isError).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("get_contact_enrichment_job GETs the job by id", async () => {
    const fetchMock = mockFetch({ data: { job_id: UUID, status: "pending" } });
    await tool("get_contact_enrichment_job").handler({ bearer_token: "t", job_id: UUID });
    expect(calledMethod(fetchMock)).toBe("GET");
    expect(calledUrl(fetchMock).pathname).toBe(`/api/v1/contact-enrichment/jobs/${UUID}`);
  });

  it("verify_emails POSTs prospect_ids", async () => {
    const fetchMock = mockFetch({ data: { job_id: UUID } }, { status: 202 });
    await tool("verify_emails").handler({ bearer_token: "t", prospect_ids: [UUID, UUID2] });
    expect(calledMethod(fetchMock)).toBe("POST");
    expect(calledUrl(fetchMock).pathname).toBe("/api/v1/email-verification/verify");
    expect(calledBody(fetchMock)).toEqual({ prospect_ids: [UUID, UUID2] });
  });

  it("get_email_verification_job GETs the job by id", async () => {
    const fetchMock = mockFetch({ data: { job_id: UUID } });
    await tool("get_email_verification_job").handler({ bearer_token: "t", job_id: UUID });
    expect(calledUrl(fetchMock).pathname).toBe(`/api/v1/email-verification/jobs/${UUID}`);
  });

  it("preview_enrichment POSTs the selection and is marked read-only", async () => {
    const t = tool("preview_enrichment");
    expect((t.config.annotations as { readOnlyHint?: boolean }).readOnlyHint).toBe(true);
    const fetchMock = mockFetch({ data: { coverage: {}, providers: [] } });
    await t.handler({ bearer_token: "t", list_id: UUID, fields: ["phone"] });
    expect(calledMethod(fetchMock)).toBe("POST");
    expect(calledUrl(fetchMock).pathname).toBe("/api/v1/enrichment/preview");
    expect(calledBody(fetchMock)).toEqual({ list_id: UUID, fields: ["phone"] });
  });
});

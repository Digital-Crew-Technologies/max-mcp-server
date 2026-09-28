import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { McpServer } from "@/features/pilot-tools/shared";
import { registerCampaignTools } from "@/features/pilot-tools/campaigns/tools";
import { registerAsGroup } from "@/features/pilot-tools/mcp/group-adapter";
import { assertFetchableUrl, mimeFor } from "@/features/pilot-tools/campaigns/attachments";

type Handler = (input: Record<string, unknown>) => Promise<{
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}>;

function tools(): Map<string, { config: Record<string, unknown>; handler: Handler }> {
  const out = new Map<string, { config: Record<string, unknown>; handler: Handler }>();
  registerCampaignTools({
    registerTool(name, config, handler) {
      out.set(name, { config, handler: handler as Handler });
    },
  });
  return out;
}

function run(name: string, input: Record<string, unknown>) {
  const t = tools().get(name);
  if (!t) throw new Error(`tool ${name} not registered`);
  return t.handler({ bearer_token: "tok", ...input });
}

/** Scripted fetch: each entry answers the next call, in order. */
function scriptFetch(
  ...responses: Array<(url: string, init?: RequestInit) => Response>
) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const next = responses[calls.length - 1];
    if (!next) throw new Error(`unexpected fetch #${calls.length}: ${url}`);
    return next(url, init);
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

const json = (body: unknown, status = 200) => () =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const CAMPAIGN = "11111111-1111-1111-1111-111111111111";
const ATT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_ATT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SIGNED = "https://proj.supabase.co/storage/v1/object/upload/sign/campaign-attachments/w/a-guide.pdf?token=secret";

const TICKET = {
  data: {
    attachment_id: ATT,
    file_name: "guide.pdf",
    mime: "application/pdf",
    storage_path: `w/${ATT}-guide.pdf`,
    token: "secret",
    signed_url: SIGNED,
  },
};
const ROW = {
  id: ATT,
  file_name: "guide.pdf",
  mime_type: "application/pdf",
  size_bytes: 8,
};

beforeEach(() => {
  process.env.DIGITALCREW_API_BASE_URL = "https://api.test";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("registration", () => {
  it("registers the attachment tools and keeps them in the campaigns group", () => {
    const names = [...tools().keys()];
    for (const name of [
      "list_campaign_attachments",
      "upload_campaign_attachment",
      "set_campaign_step_attachments",
      "delete_campaign_attachment",
    ]) {
      expect(names).toContain(name);
    }

    const grouped: Array<{ name: string; config: Record<string, unknown> }> = [];
    const server: McpServer = {
      registerTool(name, config) {
        grouped.push({ name, config });
      },
    };
    registerAsGroup(server, "campaigns", "Campaigns", registerCampaignTools);
    expect(grouped).toHaveLength(1);
    expect(String(grouped[0].config.description)).toContain("upload_campaign_attachment");
  });
});

describe("upload_campaign_attachment", () => {
  it("uploads base64 bytes through the signed ticket and records the row", async () => {
    const calls = scriptFetch(json(TICKET), () => new Response(null, { status: 200 }), json({ data: ROW }, 201));
    const bytes = Buffer.from("%PDF-1.7");

    const res = await run("upload_campaign_attachment", {
      file_name: "guide.pdf",
      content_base64: bytes.toString("base64"),
    });

    expect(res.isError).toBeFalsy();
    expect(JSON.parse(res.content[0].text)).toEqual({ data: ROW });

    expect(calls[0].url).toBe("https://api.test/api/v1/campaigns/attachments/upload-url");
    expect(JSON.parse(calls[0].init!.body as string)).toEqual({
      file_name: "guide.pdf",
      mime: "application/pdf",
      size: bytes.byteLength,
    });
    expect((calls[0].init!.headers as Record<string, string>).Authorization).toBe("Bearer tok");

    // The PUT goes to the signed URL with the bytes and no Max bearer token.
    expect(calls[1].url).toBe(SIGNED);
    expect(calls[1].init!.method).toBe("PUT");
    const sent = new Uint8Array(await (calls[1].init!.body as Blob).arrayBuffer());
    expect(Buffer.from(sent).toString()).toBe("%PDF-1.7");
    expect(JSON.stringify(calls[1].init!.headers)).not.toContain("Bearer");

    expect(calls[2].url).toBe("https://api.test/api/v1/campaigns/attachments/complete");
    expect(JSON.parse(calls[2].init!.body as string)).toEqual({
      attachment_id: ATT,
      file_name: "guide.pdf",
      mime: "application/pdf",
      storage_path: `w/${ATT}-guide.pdf`,
    });
  });

  it("downloads a public https file first", async () => {
    const calls = scriptFetch(
      () => new Response("%PDF-1.7", { status: 200, headers: { "content-type": "application/pdf" } }),
      json(TICKET),
      () => new Response(null, { status: 200 }),
      json({ data: ROW }, 201),
    );

    const res = await run("upload_campaign_attachment", {
      file_name: "guide.pdf",
      file_url: "https://cdn.example.com/guide.pdf",
    });

    expect(res.isError).toBeFalsy();
    expect(calls[0].url).toBe("https://cdn.example.com/guide.pdf");
    expect(calls[0].init!.redirect).toBe("manual");
  });

  it("re-checks every redirect hop", async () => {
    scriptFetch(() => new Response(null, { status: 302, headers: { location: "https://169.254.169.254/latest" } }));
    const res = await run("upload_campaign_attachment", {
      file_name: "guide.pdf",
      file_url: "https://cdn.example.com/guide.pdf",
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/public host name/);
  });

  it("refuses a file over 15 MB before uploading", async () => {
    const calls = scriptFetch(
      () => new Response("x", { status: 200, headers: { "content-length": String(16 * 1024 * 1024) } }),
    );
    const res = await run("upload_campaign_attachment", {
      file_name: "big.pdf",
      file_url: "https://cdn.example.com/big.pdf",
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/15 MB/);
    expect(calls).toHaveLength(1);
  });

  it("needs exactly one source", async () => {
    const res = await run("upload_campaign_attachment", { file_name: "guide.pdf" });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/exactly one of file_url or content_base64/);
  });

  it("surfaces max-agent's refusal", async () => {
    scriptFetch(json({ error: '"notes.docx" can\'t be sent in a campaign' }, 400));
    const res = await run("upload_campaign_attachment", {
      file_name: "notes.docx",
      content_base64: Buffer.from("x").toString("base64"),
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("can't be sent in a campaign");
  });
});

const workflow = (actionType = "send_linkedin_message") => ({
  nodes: [
    { id: "start", type: "campaignStart", position: { x: 0, y: 0 }, data: {} },
    {
      id: "msg",
      type: "action",
      position: { x: 0, y: 100 },
      data: { actionType, config: { message_mode: "standard", message: "Here is the guide" } },
    },
  ],
  edges: [{ id: "e", source: "start", target: "msg" }],
});

describe("set_campaign_step_attachments", () => {
  it("resolves library ids and writes them onto the step", async () => {
    const calls = scriptFetch(
      json({ id: CAMPAIGN, status: "draft", workflow_config: workflow() }),
      json({ data: [ROW] }),
      json({ data: { id: CAMPAIGN } }),
    );

    const res = await run("set_campaign_step_attachments", {
      id: CAMPAIGN,
      node_id: "msg",
      attachment_ids: [ATT],
    });

    expect(res.isError).toBeFalsy();
    expect(calls[2].init!.method).toBe("PATCH");
    expect(calls[2].url).toBe(`https://api.test/api/v1/campaigns/${CAMPAIGN}`);
    const patched = JSON.parse(calls[2].init!.body as string).workflow_config;
    expect(patched.nodes[1].data.config).toEqual({
      message_mode: "standard",
      message: "Here is the guide",
      attachments: [{ id: ATT, name: "guide.pdf", mime: "application/pdf", size_bytes: 8 }],
    });
    expect(patched.edges).toHaveLength(1);
  });

  it("removes the step's files with an empty list", async () => {
    const wf = workflow();
    (wf.nodes[1].data.config as Record<string, unknown>).attachments = [{ id: ATT }];
    const calls = scriptFetch(
      json({ status: "draft", workflow_config: wf }),
      json({ data: {} }),
    );

    const res = await run("set_campaign_step_attachments", { id: CAMPAIGN, node_id: "msg", attachment_ids: [] });

    expect(res.isError).toBeFalsy();
    const patched = JSON.parse(calls[1].init!.body as string).workflow_config;
    expect(patched.nodes[1].data.config).not.toHaveProperty("attachments");
  });

  it("refuses a step that cannot carry files", async () => {
    const calls = scriptFetch(json({ status: "draft", workflow_config: workflow("send_linkedin_inmail") }));
    const res = await run("set_campaign_step_attachments", { id: CAMPAIGN, node_id: "msg", attachment_ids: [ATT] });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/only send_email, send_linkedin_message, send_whatsapp_message/);
    expect(calls).toHaveLength(1);
  });

  it("refuses ids that are not in the workspace library", async () => {
    const calls = scriptFetch(
      json({ status: "draft", workflow_config: workflow() }),
      json({ data: [ROW] }),
    );
    const res = await run("set_campaign_step_attachments", {
      id: CAMPAIGN,
      node_id: "msg",
      attachment_ids: [ATT, OTHER_ATT],
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain(OTHER_ATT);
    expect(calls).toHaveLength(2);
  });

  it("refuses a running campaign and names the steps for a wrong node id", async () => {
    scriptFetch(json({ status: "active", workflow_config: workflow() }));
    const active = await run("set_campaign_step_attachments", { id: CAMPAIGN, node_id: "msg", attachment_ids: [ATT] });
    expect(active.content[0].text).toMatch(/draft or stopped/);

    vi.unstubAllGlobals();
    scriptFetch(json({ status: "draft", workflow_config: workflow() }));
    const wrong = await run("set_campaign_step_attachments", { id: CAMPAIGN, node_id: "nope", attachment_ids: [ATT] });
    expect(wrong.content[0].text).toContain("msg (send_linkedin_message)");
  });
});

describe("thin proxies", () => {
  it("lists and deletes library files", async () => {
    const calls = scriptFetch(json({ data: [ROW] }), json({ success: true }));
    await run("list_campaign_attachments", {});
    await run("delete_campaign_attachment", { attachment_id: ATT });
    expect(calls[0].url).toBe("https://api.test/api/v1/campaigns/attachments");
    expect(calls[1].url).toBe(`https://api.test/api/v1/campaigns/attachments/${ATT}`);
    expect(calls[1].init!.method).toBe("DELETE");
  });
});

describe("assertFetchableUrl / mimeFor", () => {
  it.each([
    "http://cdn.example.com/a.pdf",
    "https://127.0.0.1/a.pdf",
    "https://[::1]/a.pdf",
    "https://localhost/a.pdf",
    "https://metadata.google.internal/a",
    "https://intranet/a.pdf",
    "https://user:pw@cdn.example.com/a.pdf",
  ])("refuses %s", (url) => {
    expect(() => assertFetchableUrl(url)).toThrow();
  });

  it("accepts a public https host", () => {
    expect(assertFetchableUrl("https://drive.example.com/guide.pdf").host).toBe("drive.example.com");
  });

  it("prefers an explicit type and falls back to the extension", () => {
    expect(mimeFor("guide.pdf")).toBe("application/pdf");
    expect(mimeFor("guide.pdf", "application/octet-stream")).toBe("application/pdf");
    expect(mimeFor("shot.png", "image/png; charset=binary")).toBe("image/png");
  });
});

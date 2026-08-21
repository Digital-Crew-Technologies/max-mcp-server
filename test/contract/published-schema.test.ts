import { describe, it, expect } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpServer as OurMcpServer } from "@/features/pilot-tools/shared";
import { registerWorkspaceProfileTools } from "@/features/workspace-profile/mcp/register";
import { registerPilotMcpTools } from "@/features/pilot-tools/mcp/register";

// ── THE FAILURE THIS FILE EXISTS FOR ────────────────────────────────────────
// Every other test in this repo inspects what we PASS to registerTool. None of
// them checked what the SDK actually PUBLISHES, and the two are not the same
// thing: @modelcontextprotocol/sdk 1.26 serializes inputSchema through
// normalizeObjectSchema, which accepts only a raw shape or a schema exposing
// `.shape`. A discriminated union (every grouped tool) and a .refine()-wrapped
// object (bulk_enrich, get_enrichment_status) have neither, so the SDK
// substituted `{"type":"object","properties":{}}` — silently, with the tool
// still listed and calls still working, because the CALL path falls back to
// the original schema.
//
// 21 of 23 tools were reaching the model with NO arguments: no action enum, no
// field names, no types. The only way to catch that is to publish through a
// real MCP client and look at the wire, which is what these tests do.

const EMPTY_SCHEMA = '{"type":"object","properties":{}}';

type WireTool = {
  name: string;
  inputSchema: { type?: string; properties?: Record<string, unknown> };
};

/** Register the real catalog on a real McpServer and read back tools/list. */
async function publishedTools(mode: string | undefined): Promise<WireTool[]> {
  const prev = process.env.GROUPED_TOOLS;
  if (mode === undefined) delete process.env.GROUPED_TOOLS;
  else process.env.GROUPED_TOOLS = mode;

  const server = new McpServer(
    { name: "contract-probe", version: "0" },
    { capabilities: { tools: {} } },
  );
  const adapter: OurMcpServer = {
    registerTool(name, config, handler) {
      (server as unknown as OurMcpServer).registerTool(name, config, handler);
    },
  };

  try {
    registerWorkspaceProfileTools(adapter);
    registerPilotMcpTools(adapter);

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: "contract-probe", version: "0" }, { capabilities: {} });
    await client.connect(clientTransport);
    const { tools } = await client.listTools();
    await client.close();
    await server.close();
    return tools as unknown as WireTool[];
  } finally {
    if (prev === undefined) delete process.env.GROUPED_TOOLS;
    else process.env.GROUPED_TOOLS = prev;
  }
}

describe("published input schemas (contract)", () => {
  it("no tool reaches the model with an empty schema, in the default mode", async () => {
    const tools = await publishedTools(undefined);
    const empty = tools
      .filter((t) => JSON.stringify(t.inputSchema) === EMPTY_SCHEMA)
      .map((t) => t.name);

    expect(
      empty,
      `These tools publish an EMPTY input schema, so the model sees them with ` +
        `no arguments at all and can only guess from the description: ` +
        `${empty.join(", ")}. The SDK does this silently for any schema that ` +
        `is not a raw shape or a Zod object — run it through ` +
        `toPublishableShape (features/pilot-tools/mcp/publishable-schema.ts).`,
    ).toEqual([]);
  }, 20_000);

  it("holds in flat mode too", async () => {
    const tools = await publishedTools("false");
    const empty = tools
      .filter((t) => JSON.stringify(t.inputSchema) === EMPTY_SCHEMA)
      .map((t) => t.name);
    expect(empty).toEqual([]);
  }, 20_000);

  it("every grouped tool publishes an action enum listing its actions", async () => {
    const tools = await publishedTools(undefined);
    const unibox = tools.find((t) => t.name === "unibox");
    expect(unibox).toBeDefined();

    const action = unibox!.inputSchema.properties?.action as
      | { enum?: string[] }
      | undefined;
    expect(action?.enum, "unibox must publish its actions as an enum").toBeDefined();
    // The model picks the action from this list; it is the one field it cannot
    // guess, and the whole grouped design depends on it being visible.
    expect(action!.enum).toContain("list_chats");
    expect(action!.enum).toContain("send_chat_message");
  }, 20_000);

  it("publishes the arguments of a grouped tool, not just the discriminator", async () => {
    const tools = await publishedTools(undefined);
    const unibox = tools.find((t) => t.name === "unibox")!;
    const props = Object.keys(unibox.inputSchema.properties ?? {});
    // An action enum alone would still leave the model guessing every arg.
    expect(props.length).toBeGreaterThan(5);
    expect(props).toContain("action");
  }, 20_000);
});

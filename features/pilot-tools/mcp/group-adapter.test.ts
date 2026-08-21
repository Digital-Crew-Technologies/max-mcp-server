import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import type { McpServer } from "@/features/pilot-tools/shared";
import { registerAsGroup } from "@/features/pilot-tools/mcp/group-adapter";

type Captured = {
  name: string;
  config: Record<string, unknown>;
  handler: (input: Record<string, unknown>) => Promise<{
    content: Array<{ type: "text"; text: string }>;
    isError?: boolean;
  }>;
};

function capture(register: (s: McpServer) => void): Captured[] {
  const tools: Captured[] = [];
  const server: McpServer = {
    registerTool(name, config, handler) {
      tools.push({ name, config, handler });
    },
  };
  register(server);
  return tools;
}

const ok = async () => ({ content: [{ type: "text" as const, text: "ok" }] });

describe("registerAsGroup", () => {
  it("collapses a flat registrar into exactly one tool", () => {
    const tools = capture((s) =>
      registerAsGroup(s, "demo", "Demo domain.", (r) => {
        r.registerTool("list_things", { title: "List", description: "List things.", inputSchema: z.object({ page: z.number().optional() }) }, ok);
        r.registerTool("get_thing", { title: "Get", description: "Get a thing.", inputSchema: z.object({ id: z.string() }) }, ok);
      }),
    );

    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe("demo");
  });

  it("routes an action to the flat tool's own handler, with `action` stripped", async () => {
    const listHandler = vi.fn(ok);
    const getHandler = vi.fn(ok);

    const [group] = capture((s) =>
      registerAsGroup(s, "demo", "Demo domain.", (r) => {
        r.registerTool("list_things", { title: "List", description: "List things.", inputSchema: z.object({ page: z.number().optional() }) }, listHandler);
        r.registerTool("get_thing", { title: "Get", description: "Get a thing.", inputSchema: z.object({ id: z.string() }) }, getHandler);
      }),
    );

    await group.handler({ action: "get_thing", id: "abc", bearer_token: "t" });

    expect(listHandler).not.toHaveBeenCalled();
    expect(getHandler).toHaveBeenCalledTimes(1);
    // The handler must see exactly what it saw in flat mode — no discriminator.
    expect(getHandler).toHaveBeenCalledWith({ id: "abc", bearer_token: "t" });
  });

  it("returns an isError result naming the valid actions on an unknown action", async () => {
    const [group] = capture((s) =>
      registerAsGroup(s, "demo", "Demo domain.", (r) => {
        r.registerTool("list_things", { title: "List", description: "List things.", inputSchema: z.object({}) }, ok);
      }),
    );

    const res = await group.handler({ action: "nope" });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("list_things");
  });

  it("preserves each action's own arg schema in the union", () => {
    const [group] = capture((s) =>
      registerAsGroup(s, "demo", "Demo domain.", (r) => {
        r.registerTool("list_things", { title: "List", description: "List things.", inputSchema: z.object({ page: z.number().optional() }) }, ok);
        r.registerTool("get_thing", { title: "Get", description: "Get a thing.", inputSchema: z.object({ id: z.string() }) }, ok);
      }),
    );

    const schema = group.config._strictInputSchema as z.ZodTypeAny;
    // get_thing requires `id`; list_things does not accept it as required.
    expect(schema.safeParse({ action: "get_thing", id: "abc" }).success).toBe(true);
    expect(schema.safeParse({ action: "get_thing" }).success).toBe(false);
    expect(schema.safeParse({ action: "list_things" }).success).toBe(true);
    expect(schema.safeParse({ action: "made_up" }).success).toBe(false);
  });

  it("accepts a bare Zod shape as inputSchema, not just a ZodObject", () => {
    // linkedin/tools.ts registers flat with `inputSchema: { ...a.inputShape }`.
    const [group] = capture((s) =>
      registerAsGroup(s, "demo", "Demo domain.", (r) => {
        r.registerTool("do_thing", { title: "Do", description: "Do a thing.", inputSchema: { id: z.string() } }, ok);
      }),
    );

    const schema = group.config._strictInputSchema as z.ZodTypeAny;
    expect(schema.safeParse({ action: "do_thing", id: "x" }).success).toBe(true);
    expect(schema.safeParse({ action: "do_thing" }).success).toBe(false);
  });

  it("is read-only only when every action is read-only", () => {
    const readOnly = capture((s) =>
      registerAsGroup(s, "reads", "Reads.", (r) => {
        r.registerTool("a", { title: "A", description: "A.", inputSchema: z.object({}), annotations: { readOnlyHint: true } }, ok);
        r.registerTool("b", { title: "B", description: "B.", inputSchema: z.object({}), annotations: { readOnlyHint: true } }, ok);
      }),
    );
    expect((readOnly[0].config.annotations as { readOnlyHint: boolean }).readOnlyHint).toBe(true);

    const mixed = capture((s) =>
      registerAsGroup(s, "mixed", "Mixed.", (r) => {
        r.registerTool("a", { title: "A", description: "A.", inputSchema: z.object({}), annotations: { readOnlyHint: true } }, ok);
        r.registerTool("b", { title: "B", description: "B.", inputSchema: z.object({}), annotations: { destructiveHint: true } }, ok);
      }),
    );
    const ann = mixed[0].config.annotations as { readOnlyHint: boolean; destructiveHint: boolean };
    expect(ann.readOnlyHint).toBe(false);
    expect(ann.destructiveHint).toBe(true);
  });

  it("rejects a group name containing an underscore", () => {
    // Such a name would be tiered as a droppable flat tool by max-agent's cap.
    expect(() =>
      capture((s) =>
        registerAsGroup(s, "prospect_lists", "Bad.", (r) => {
          r.registerTool("a", { title: "A", description: "A.", inputSchema: z.object({}) }, ok);
        }),
      ),
    ).toThrow(/contains "_"/);
  });
});

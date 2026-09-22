import { describe, it, expect } from "vitest";
import { z } from "zod";
import { toPublishableShape } from "./publishable-schema";

/** Every published field is optional; look through that to the definition. */
const inner = (field: z.ZodTypeAny): z.ZodTypeAny => (field as z.ZodOptional<z.ZodTypeAny>).unwrap();

const union = (...branches: z.AnyZodObject[]) =>
  z.discriminatedUnion(
    "action",
    branches as unknown as [z.AnyZodObject, z.AnyZodObject, ...z.AnyZodObject[]],
  );

describe("toPublishableShape — fields shared across actions", () => {
  it("publishes one definition when every action defines the field the same way", () => {
    const shape = toPublishableShape(
      union(
        z.object({ action: z.literal("get_deal"), id: z.string().uuid().describe("Deal id") }),
        z.object({ action: z.literal("delete_deal"), id: z.string().uuid().describe("Deal UUID") }),
        z.object({ action: z.literal("list_deals") }),
      ),
    )!;

    const id = inner(shape.id);
    expect(id).toBeInstanceOf(z.ZodString);
    expect(shape.id.description).toContain("get_deal, delete_deal");
  });

  it("treats required and optional versions of the same type as one definition", () => {
    const shape = toPublishableShape(
      union(
        z.object({ action: z.literal("a"), limit: z.number().int() }),
        z.object({ action: z.literal("b"), limit: z.number().int().optional() }),
      ),
    )!;
    expect(inner(shape.limit)).toBeInstanceOf(z.ZodNumber);
  });

  it("publishes every distinct definition when actions disagree, so no action's values are hidden", () => {
    const shape = toPublishableShape(
      union(
        z.object({ action: z.literal("list_deals"), status: z.enum(["open", "won", "lost"]) }),
        z.object({ action: z.literal("update_deal"), status: z.enum(["open", "won", "lost"]) }),
        z.object({
          action: z.literal("update_sales_catalog_item"),
          status: z.enum(["draft", "active", "archived"]),
        }),
      ),
    )!;

    const status = shape.status;
    // Every value either action accepts is valid against the published schema…
    for (const v of ["open", "won", "lost", "draft", "active", "archived"]) {
      expect(status.safeParse(v).success).toBe(true);
    }
    expect(status.safeParse("bogus").success).toBe(false);

    // …and each variant says which actions it belongs to.
    const variants = (inner(status) as z.ZodUnion<[z.ZodTypeAny, ...z.ZodTypeAny[]]>).options;
    expect(variants).toHaveLength(2);
    expect(variants[0].description).toContain("list_deals, update_deal");
    expect(variants[1].description).toContain("update_sales_catalog_item");
  });
});

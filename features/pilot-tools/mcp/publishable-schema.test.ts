import { describe, it, expect } from "vitest";
import { z } from "zod";
import { toPublishableShape } from "./publishable-schema";

/** Every published field is optional; look through that to the definition. */
const inner = (field: z.ZodTypeAny): z.ZodTypeAny => (field as z.ZodOptional<z.ZodTypeAny>).unwrap();

const union = (...branches: z.ZodObject[]) =>
  z.discriminatedUnion(
    "action",
    branches as unknown as [z.ZodObject, z.ZodObject, ...z.ZodObject[]],
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

describe("toPublishableShape — zod 4 schema structures", () => {
  it("keeps a field's own description when .optional() wraps it", () => {
    // Zod 3 copied the description onto the .optional() wrapper; zod 4 leaves
    // it inside. Losing it would publish "Used by: …" and nothing else.
    const shape = toPublishableShape(
      union(
        z.object({ action: z.literal("get_deal"), note: z.string().describe("Free-text note").optional() }),
        z.object({ action: z.literal("update_deal"), note: z.string().describe("Free-text note").optional() }),
        z.object({ action: z.literal("list_deals") }),
      ),
    )!;
    expect(shape.note.description).toBe("Free-text note (get_deal, update_deal)");
  });

  it("tells array fields apart by their length bounds", () => {
    // create requires at least one list; update accepts an empty one. Publishing
    // only the first would make a validating client reject a valid update.
    const shape = toPublishableShape(
      union(
        z.object({ action: z.literal("create"), lists: z.array(z.string()).min(1) }),
        z.object({ action: z.literal("update"), lists: z.array(z.string()).optional() }),
      ),
    )!;
    expect(shape.lists.safeParse([]).success).toBe(true);
    const variants = (inner(shape.lists) as z.ZodUnion<[z.ZodTypeAny, ...z.ZodTypeAny[]]>).options;
    expect(variants).toHaveLength(2);
  });

  it("tells .trim() from .toLowerCase()", () => {
    const shape = toPublishableShape(
      union(
        z.object({ action: z.literal("a"), name: z.string().trim() }),
        z.object({ action: z.literal("b"), name: z.string().toLowerCase() }),
      ),
    )!;
    const variants = (inner(shape.name) as z.ZodUnion<[z.ZodTypeAny, ...z.ZodTypeAny[]]>).options;
    expect(variants).toHaveLength(2);
  });

  it("still treats identically defined fields as one definition", () => {
    const shape = toPublishableShape(
      union(
        z.object({ action: z.literal("a"), ids: z.array(z.guid()).min(1).max(50) }),
        z.object({ action: z.literal("b"), ids: z.array(z.guid()).min(1).max(50) }),
      ),
    )!;
    expect(inner(shape.ids)).toBeInstanceOf(z.ZodArray);
  });

  it("publishes the action enum from the branches' literals", () => {
    const shape = toPublishableShape(
      union(z.object({ action: z.literal("a") }), z.object({ action: z.literal("b") })),
    )!;
    expect(shape.action.safeParse("a").success).toBe(true);
    expect(shape.action.safeParse("c").success).toBe(false);
  });

  it("reaches the object behind .refine() and .transform()", () => {
    const base = z.object({ prospect_id: z.guid().optional(), organization_id: z.guid().optional() });
    const refined = base.refine((b) => Boolean(b.prospect_id) !== Boolean(b.organization_id));
    const transformed = base.transform((b) => b);
    expect(Object.keys(toPublishableShape(refined)!)).toEqual(["prospect_id", "organization_id"]);
    expect(Object.keys(toPublishableShape(transformed)!)).toEqual(["prospect_id", "organization_id"]);
  });
});

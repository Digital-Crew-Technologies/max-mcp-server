// Make a Zod schema something the MCP SDK will actually PUBLISH.
//
// ── THE SILENT FAILURE THIS EXISTS FOR ────────────────────────────────────
// @modelcontextprotocol/sdk 1.26 serializes a tool's inputSchema through
// `normalizeObjectSchema` (server/zod-compat.js). That function accepts only:
//   • a raw shape — Record<string, ZodType>
//   • a Zod object — anything exposing `.shape`
// ANYTHING ELSE returns undefined, and mcp.js then publishes
// `EMPTY_OBJECT_JSON_SCHEMA` — `{"type":"object","properties":{}}` — with no
// error, no warning, and a tool that still appears in tools/list.
//
// Two of our schema styles hit that path:
//   • z.discriminatedUnion(...)  — every grouped domain tool
//   • z.object({...}).refine(...) — wraps in ZodEffects, which has no `.shape`
//                                   (bulk_enrich, get_enrichment_status)
//
// The consequence is severe and invisible: the model is handed a tool with NO
// arguments at all. No action enum, no field names, no types, no required
// list. It can only guess from the description prose. Verified against a real
// MCP client over the SDK's own transport: 21 of 23 tools published an empty
// schema. Calls still worked, because the SDK's CALL path falls back to the
// original schema (mcp.js:172) — so nothing ever surfaced as an error.
//
// This module converts those shapes into something publishable. Strict
// validation is NOT lost: callers keep the original schema and re-validate
// against it before dispatching (see registerGroupedTool).

import { z } from "zod";

/** A raw Zod shape — the form the SDK reliably serializes. */
export type ZodShape = Record<string, z.ZodTypeAny>;

/** Unwrap ZodEffects / ZodDefault / ZodOptional down to the schema underneath. */
function unwrap(schema: z.ZodTypeAny): z.ZodTypeAny {
  let current: z.ZodTypeAny = schema;
  // Bounded: a pathological chain must not spin here.
  for (let i = 0; i < 10; i += 1) {
    const def = (current as { _def?: Record<string, unknown> })._def;
    const inner = (def?.schema ?? def?.innerType) as z.ZodTypeAny | undefined;
    if (!inner) return current;
    current = inner;
  }
  return current;
}

/** Is this a bare shape record rather than a Zod schema? */
function isShapeRecord(value: unknown): value is ZodShape {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (v._def !== undefined) return false;
  const entries = Object.values(v);
  return (
    entries.length > 0 &&
    entries.every(
      (e) => !!e && typeof e === "object" && (e as { _def?: unknown })._def !== undefined,
    )
  );
}

/**
 * Merge every branch of a discriminated union into one flat, publishable shape.
 *
 * `action` becomes an enum of the branch literals; every other field across all
 * branches is carried through as OPTIONAL, because a field required by one
 * action is not required by the others. Per-action requirements are enforced by
 * re-validating against the original union before dispatch, so nothing is
 * actually loosened — the flattening is about what can be DESCRIBED to the
 * model, not about what the server accepts.
 *
 * A field name used by more than one action keeps its first definition and is
 * annotated with the actions that use it, rather than being dropped.
 */
function flattenUnion(union: z.ZodTypeAny): ZodShape | null {
  const options = (
    (union as { _def?: { options?: unknown } })._def?.options ??
    (union as { options?: unknown }).options
  ) as z.ZodTypeAny[] | undefined;
  if (!Array.isArray(options) || options.length === 0) return null;

  const actionNames: string[] = [];
  const merged: ZodShape = {};
  const usedBy = new Map<string, string[]>();

  for (const option of options) {
    const shape = (option as { shape?: ZodShape }).shape;
    if (!shape) continue;

    const actionField = shape.action as z.ZodTypeAny | undefined;
    const literal = (actionField as { _def?: { value?: unknown } } | undefined)?._def?.value;
    const actionName = typeof literal === "string" ? literal : null;
    if (actionName) actionNames.push(actionName);

    for (const [key, def] of Object.entries(shape)) {
      if (key === "action") continue;
      if (actionName) {
        usedBy.set(key, [...(usedBy.get(key) ?? []), actionName]);
      }
      // First definition wins; the strict per-action parse still governs.
      if (!(key in merged)) merged[key] = def.optional();
    }
  }

  if (actionNames.length === 0) return null;

  // Annotate each field with the actions that take it, so a flat arg list is
  // still navigable — this is the information the union's branches carried.
  for (const [key, actions] of usedBy.entries()) {
    const existing = merged[key];
    if (!existing) continue;
    const current =
      (existing as { description?: string }).description ??
      (existing as { _def?: { description?: string } })._def?.description ??
      "";
    const scope =
      actions.length === actionNames.length
        ? "all actions"
        : actions.join(", ");
    merged[key] = existing.describe(
      current ? `${current} (${scope})` : `Used by: ${scope}`,
    );
  }

  return {
    action: z
      .enum(actionNames as [string, ...string[]])
      .describe("Which action to run. Required."),
    ...merged,
  };
}

/**
 * Convert `schema` into a shape the MCP SDK will publish, or null if it cannot
 * be represented. Null is the caller's cue to shout — a null here becomes an
 * empty schema on the wire, which is the failure this module exists to catch.
 */
export function toPublishableShape(schema: unknown): ZodShape | null {
  if (!schema) return null;
  if (isShapeRecord(schema)) return schema;

  const zod = schema as z.ZodTypeAny;
  if (!(zod as { _def?: unknown })._def) return null;

  // Already an object: hand back its shape.
  const direct = (zod as { shape?: ZodShape }).shape;
  if (direct) return direct;

  // .refine()/.transform()/.default() wrap the object — unwrap to reach it.
  const unwrapped = unwrap(zod);
  const inner = (unwrapped as { shape?: ZodShape }).shape;
  if (inner) return inner;

  // A discriminated (or plain) union of objects — flatten it.
  return flattenUnion(unwrapped);
}

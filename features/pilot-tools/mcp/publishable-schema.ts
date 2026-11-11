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
//   • z.object({...}).refine(...) — under zod 3, wrapped in ZodEffects, which
//                                   has no `.shape` (bulk_enrich,
//                                   get_enrichment_status). Zod 4 keeps it a
//                                   ZodObject; .transform() still wraps (pipe).
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

/** A schema's definition object (zod 4: `type`, `innerType`, `in`, `shape`…). */
function defOf(schema: unknown): Record<string, unknown> | undefined {
  return (schema as { _def?: Record<string, unknown> } | undefined)?._def;
}

/** Is this value a Zod schema? */
function isSchema(value: unknown): value is z.ZodTypeAny {
  return !!value && typeof value === "object" && defOf(value) !== undefined;
}

/** Unwrap a pipe (.transform()) / ZodDefault / ZodOptional down to the schema underneath. */
function unwrap(schema: z.ZodTypeAny): z.ZodTypeAny {
  let current: z.ZodTypeAny = schema;
  // Bounded: a pathological chain must not spin here.
  for (let i = 0; i < 10; i += 1) {
    const def = defOf(current);
    const inner = (def?.in ?? def?.innerType) as z.ZodTypeAny | undefined;
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
  return entries.length > 0 && entries.every(isSchema);
}

/**
 * A schema's own description, if it has one. Zod 3's .optional()/.nullable()
 * copied the description onto the wrapper; zod 4 leaves it on the schema
 * inside, so look through the wrappers to find it.
 */
function describedAs(schema: z.ZodTypeAny): string {
  let current: unknown = schema;
  // Bounded, like unwrap().
  for (let i = 0; i < 10 && isSchema(current); i += 1) {
    if (current.description) return current.description;
    current = defOf(current)?.innerType;
  }
  return "";
}

/**
 * The comparable part of a check: its kind, format, bounds and pattern. The
 * functions zod 4 keeps on a check (`when`, a refinement's `fn`) are left out,
 * except an overwrite's `tx`: it is what tells .trim() from .toLowerCase().
 */
function checkIdentity(check: unknown): Record<string, unknown> {
  const def =
    (check as { _zod?: { def?: Record<string, unknown> } })._zod?.def ?? {};
  const identity: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(def)) {
    if (v instanceof RegExp || (k === "tx" && typeof v === "function")) identity[k] = String(v);
    else if (v === null || ["string", "number", "boolean"].includes(typeof v)) identity[k] = v;
  }
  return identity;
}

/**
 * Structural identity of a field's schema: type, enum/literal values, checks
 * and nested shapes — but not its description, and not whether it is optional
 * (every published field is optional anyway). Two actions whose fields share a
 * fingerprint accept the same values.
 */
function fingerprint(schema: z.ZodTypeAny, depth = 0): string {
  const def = defOf(schema);
  if (!def || depth > 8) return "?";
  if (depth === 0 && (def.type === "optional" || def.type === "default")) {
    return fingerprint(def.innerType as z.ZodTypeAny, depth);
  }
  const parts: unknown[] = [def.type];
  // Literal values (an array) and enum entries (an object).
  if (def.values !== undefined) parts.push(def.values);
  if (def.entries !== undefined) parts.push(def.entries);
  if (Array.isArray(def.checks)) parts.push(def.checks.map(checkIdentity));
  for (const k of ["innerType", "element", "in", "out", "valueType", "keyType"]) {
    const inner = def[k];
    if (isSchema(inner)) parts.push(k, fingerprint(inner, depth + 1));
  }
  const shape = def.shape as ZodShape | undefined;
  if (shape && typeof shape === "object") {
    parts.push(
      Object.entries(shape).map(([k, v]) => [k, fingerprint(v, depth + 1)]),
    );
  }
  if (Array.isArray(def.options)) {
    parts.push(def.options.map((o: z.ZodTypeAny) => fingerprint(o, depth + 1)));
  }
  return JSON.stringify(parts);
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
 * A field name used by more than one action is annotated with the actions that
 * use it. When those actions define it the SAME way, one definition is
 * published. When they DIFFER (a deal `status` of open/won/lost next to a
 * catalog `status` of draft/active/archived), every distinct definition is
 * published as a union, each tagged with its actions — publishing only the
 * first would show the model one action's enum and hide the others', and a
 * client that validates against the published schema would reject valid calls.
 */
function flattenUnion(union: z.ZodTypeAny): ZodShape | null {
  const options = (
    (union as { _def?: { options?: unknown } })._def?.options ??
    (union as { options?: unknown }).options
  ) as z.ZodTypeAny[] | undefined;
  if (!Array.isArray(options) || options.length === 0) return null;

  const actionNames: string[] = [];
  const usedBy = new Map<string, string[]>();
  // key → distinct definitions, in first-seen order, with the actions using each.
  const variants = new Map<string, Array<{ fp: string; def: z.ZodTypeAny; actions: string[] }>>();

  for (const option of options) {
    const shape = (option as { shape?: ZodShape }).shape;
    if (!shape) continue;

    const actionField = shape.action as z.ZodTypeAny | undefined;
    // Zod 4 keeps a literal's value(s) in an array.
    const literal = (defOf(actionField)?.values as unknown[] | undefined)?.[0];
    const actionName = typeof literal === "string" ? literal : null;
    if (actionName) actionNames.push(actionName);

    for (const [key, def] of Object.entries(shape)) {
      if (key === "action") continue;
      if (actionName) {
        usedBy.set(key, [...(usedBy.get(key) ?? []), actionName]);
      }
      const fp = fingerprint(def);
      const seen = variants.get(key) ?? [];
      const match = seen.find((v) => v.fp === fp);
      if (match) {
        if (actionName) match.actions.push(actionName);
      } else {
        seen.push({ fp, def, actions: actionName ? [actionName] : [] });
      }
      variants.set(key, seen);
    }
  }

  if (actionNames.length === 0) return null;

  // Nothing here loosens what the server accepts — the strict per-action parse
  // still governs dispatch. This only decides what the model is SHOWN.
  const merged: ZodShape = {};
  for (const [key, seen] of variants.entries()) {
    if (seen.length === 1) {
      merged[key] = seen[0].def.optional();
      continue;
    }
    const tagged = seen.map(({ def, actions }) => {
      const own = describedAs(def);
      const scope = `for ${actions.join(", ")}`;
      return def.describe(own ? `${own} (${scope})` : scope);
    });
    merged[key] = z
      .union(tagged as unknown as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]])
      .optional();
  }

  // Annotate each field with the actions that take it, so a flat arg list is
  // still navigable — this is the information the union's branches carried.
  for (const [key, actions] of usedBy.entries()) {
    const existing = merged[key];
    if (!existing) continue;
    const current = describedAs(existing);
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

import { z } from "zod";

// String formats whose zod 4 versions accept or return different values than
// zod 3's did. Each keeps zod 3's behaviour, so moving to zod 4 neither rejects
// an input the tools used to accept nor changes what they forward, and the
// published JSON Schema keeps its `format`.

// Zod 3's ISO datetime patterns (`z.string().datetime()`, no precision set).
// Zod 4's own pattern requires seconds and a `±hh:mm` offset, so it would
// reject inputs the tools have always accepted, such as `2026-01-01T09:30Z`
// or `2026-01-01T09:30:00+0200`.
const DATE = String.raw`((\d\d[2468][048]|\d\d[13579][26]|\d\d0[48]|[02468][048]00|[13579][26]00)-02-29|\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\d|3[01])|(0[469]|11)-(0[1-9]|[12]\d|30)|(02)-(0[1-9]|1\d|2[0-8])))`;
const TIME = String.raw`([01]\d|2[0-3]):[0-5]\d(:[0-5]\d(\.\d+)?)?`;

export const ISO_DATETIME_UTC = new RegExp(String.raw`^${DATE}T${TIME}(Z)$`);
export const ISO_DATETIME_WITH_OFFSET = new RegExp(
  String.raw`^${DATE}T${TIME}(Z|([+-]\d{2}:?\d{2}))$`,
);

/** An ISO 8601 datetime string, UTC (`Z`) only unless `offset` is set. */
export function isoDateTime(options: { offset?: boolean } = {}) {
  return z.stringFormat(
    "date-time",
    options.offset ? ISO_DATETIME_WITH_OFFSET : ISO_DATETIME_UTC,
  );
}

function parsesAsUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Any string `new URL()` accepts, returned unchanged: zod 3's `.url()`.
 * Zod 4's z.url() returns the value trimmed, so a padded URL would reach the
 * API altered, and could pass a later `^https?://` check it used to fail.
 */
export function urlString(error = "Invalid url") {
  return z.stringFormat("uri", parsesAsUrl, { error });
}

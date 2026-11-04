import { describe, it, expect } from "vitest";
import { z } from "zod";
// Zod 4 still ships zod 3 under this path: it is the reference these formats
// must keep matching.
import { z as z3, datetimeRegex } from "zod/v3";
import {
  ISO_DATETIME_UTC,
  ISO_DATETIME_WITH_OFFSET,
  isoDateTime,
  urlString,
} from "./string-formats";

const DATETIMES = [
  "2026-01-01T00:00:00Z",
  "2026-01-01T09:30Z",
  "2026-01-01T00:00:00.123456789Z",
  "2026-01-01T00:00:00+02:00",
  "2026-01-01T00:00:00+0200",
  "2026-01-01T00:00:00-05:30",
  "2026-01-01T00:00:00",
  "2026-01-01",
  "2028-02-29T00:00:00Z",
  "2026-02-29T00:00:00Z",
  "2026-02-30T00:00:00Z",
  "2026-13-01T00:00:00Z",
  "2026-01-01T24:00:00Z",
  "2026-01-01 00:00:00Z",
  "",
];

const URLS = [
  "https://example.com/x",
  "  https://example.com  ",
  "\thttps://example.com\n",
  "ftp://example.com",
  "mailto:a@b.co",
  "http://[::1]/",
  "a:b",
  "example.com",
  "//example.com",
  "https://",
  "https://exa mple.com",
  "",
];

/** Accepted value (or null when rejected), for a schema and an input. */
const outcome = (schema: { safeParse: (v: unknown) => { success: boolean; data?: unknown } }, v: unknown) => {
  const r = schema.safeParse(v);
  return r.success ? r.data : null;
};

describe("isoDateTime", () => {
  it("uses zod 3's datetime patterns, character for character", () => {
    expect(String(ISO_DATETIME_UTC)).toBe(
      String(datetimeRegex({ precision: null, offset: false, local: false })),
    );
    expect(String(ISO_DATETIME_WITH_OFFSET)).toBe(
      String(datetimeRegex({ precision: null, offset: true, local: false })),
    );
  });

  it("accepts and rejects exactly what zod 3's .datetime() did", () => {
    for (const v of DATETIMES) {
      expect(outcome(isoDateTime(), v), v).toEqual(outcome(z3.string().datetime(), v));
      expect(outcome(isoDateTime({ offset: true }), v), v).toEqual(
        outcome(z3.string().datetime({ offset: true }), v),
      );
    }
  });

  it("still accepts minutes without seconds and a colon-less offset, which zod 4's own format rejects", () => {
    expect(isoDateTime().safeParse("2026-01-01T09:30Z").success).toBe(true);
    expect(isoDateTime({ offset: true }).safeParse("2026-01-01T09:30:00+0200").success).toBe(true);
    expect(isoDateTime().safeParse("2026-01-01T00:00:00+02:00").success).toBe(false);
  });

  it("publishes format date-time", () => {
    expect(z.toJSONSchema(isoDateTime())).toMatchObject({ type: "string", format: "date-time" });
  });
});

describe("urlString", () => {
  it("accepts, rejects and returns exactly what zod 3's .url() did", () => {
    for (const v of URLS) {
      expect(outcome(urlString(), v), JSON.stringify(v)).toEqual(outcome(z3.string().url(), v));
    }
  });

  it("returns a padded URL unchanged, where zod 4's z.url() would trim it", () => {
    expect(urlString().parse("  https://example.com  ")).toBe("  https://example.com  ");
  });

  it("keeps a later https check meaningful: a padded URL still fails it", () => {
    const meetingUrl = urlString().max(2000).regex(/^https?:\/\//);
    expect(meetingUrl.safeParse("https://example.com").success).toBe(true);
    expect(meetingUrl.safeParse("  https://example.com").success).toBe(false);
  });

  it("keeps zod 3's message and a custom one", () => {
    expect(urlString().safeParse("example.com").error?.issues[0].message).toBe("Invalid url");
    expect(urlString("Valid website URL is required").safeParse("x").error?.issues[0].message).toBe(
      "Valid website URL is required",
    );
  });

  it("publishes format uri", () => {
    expect(z.toJSONSchema(urlString())).toMatchObject({ type: "string", format: "uri" });
  });
});

import { describe, it, expect } from "vitest";
import { buildQuery, strip } from "@/features/pilot-tools/shared";

describe("buildQuery", () => {
  it("skips undefined, null, and empty-string values", () => {
    expect(buildQuery({ a: 1, b: undefined, c: null, d: "" })).toBe("?a=1");
  });

  it("repeats array values as multiple params", () => {
    expect(buildQuery({ ids: ["x", "y"] })).toBe("?ids=x&ids=y");
  });

  it("returns an empty string when there is nothing to encode", () => {
    expect(buildQuery({})).toBe("");
    expect(buildQuery({ a: undefined })).toBe("");
  });
});

describe("strip", () => {
  it("removes the given keys and does NOT mutate the input", () => {
    const input = { id: "1", name: "x", bearer_token: "secret" };
    const out = strip(input, "bearer_token");
    expect(out).toEqual({ id: "1", name: "x" });
    expect(input).toHaveProperty("bearer_token"); // original is untouched
  });
});

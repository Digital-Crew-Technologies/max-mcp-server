import { afterEach, describe, expect, it, vi } from "vitest";
import { VERIFIED_HERMES_CALLER_HEADER } from "@/shared/auth/hermes-caller";

// The workspace-profile tools used to build their own headers, so the verified
// Hermes caller never reached max-agent and update_workspace_profile skipped
// the tenant cross-check every other tool gets.
const caller = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock("@/shared/auth/request-context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/auth/request-context")>();
  return { ...actual, getVerifiedHermesCallerHeader: () => caller.value };
});

const { getWorkspaceProfileSettings, putWorkspaceProfileSettings } = await import("./repository");

afterEach(() => {
  vi.unstubAllGlobals();
  caller.value = undefined;
});

describe("workspace-profile requests", () => {
  it("forward the verified Hermes caller on reads and writes", async () => {
    process.env.DIGITALCREW_API_BASE_URL = "https://max.example.com";
    delete process.env.APP_ENV;
    caller.value = '{"tenantId":"ws-1"}';
    const seen: Headers[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        seen.push(new Headers(init.headers));
        return new Response("{}", { status: 200 });
      }),
    );

    await getWorkspaceProfileSettings("tok");
    await putWorkspaceProfileSettings("tok", { company_name: "Acme" });

    expect(seen).toHaveLength(2);
    for (const h of seen) {
      expect(h.get("authorization")).toBe("Bearer tok");
      expect(h.get(VERIFIED_HERMES_CALLER_HEADER)).toBe('{"tenantId":"ws-1"}');
    }
  });
});

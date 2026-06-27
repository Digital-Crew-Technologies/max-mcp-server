import { defineConfig } from "vitest/config";

// Vitest 4 resolves the repo's `@/*` import alias (from tsconfig.json) natively
// via resolve.tsconfigPaths, so no extra plugin is needed.
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    // This gateway is almost entirely pure Node logic — no DOM needed.
    environment: "node",
  },
});

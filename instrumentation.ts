/**
 * Next.js instrumentation hook — runs once at server startup.
 *
 * The MCP server emits structured JSON span logs to stdout via
 * features/pilot-tools/tracing.ts. A log shipper (Vector, Fluent Bit,
 * OTel Collector, Datadog Agent) can pick these up and turn them into
 * traces or metrics in your observability backend.
 *
 * Schema:
 *   { "timestamp", "service", "span", "status", "duration_ms", ...attrs }
 *
 * Disable with OBSERVABILITY=off.
 *
 * It also enforces APP_ENV (STG-02.3i): outside production, the server refuses
 * to start with a production host (*.digitalcrew.tech) in its environment, and
 * every outgoing fetch() to a production host is refused. This runs in both the
 * Node.js and Edge runtimes, and is a no-op when APP_ENV=production (default).
 *
 * See: https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation
 */

import { assertNoProductionHostsInEnv, installProductionHostGuard } from "./shared/env/app-env";

export async function register(): Promise<void> {
  assertNoProductionHostsInEnv();
  installProductionHostGuard();
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const enabled = process.env.OBSERVABILITY !== "off";
  console.log(`[observability] ${enabled ? "structured span logs enabled (stdout)" : "disabled"}`);
}

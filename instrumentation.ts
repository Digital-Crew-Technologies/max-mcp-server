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
 * See: https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation
 */

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const enabled = process.env.OBSERVABILITY !== "off";
  console.log(`[observability] ${enabled ? "structured span logs enabled (stdout)" : "disabled"}`);
}

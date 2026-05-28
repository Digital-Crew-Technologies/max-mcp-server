/**
 * Structured span logging.
 *
 * Emits one JSON line per outbound API call (and one per tool invocation)
 * to stdout. Any log shipper (Vector, Fluent Bit, Datadog Agent, OTel
 * Collector) can pick these up and convert to traces / metrics. No SDK
 * deps, no bundler issues, no runtime overhead beyond JSON.stringify.
 *
 * Schema follows OpenTelemetry naming conventions so it's easy to
 * promote to a real OTel exporter later if needed.
 *
 * Enabled by default. Set OBSERVABILITY=off to silence.
 */

const ENABLED = process.env.OBSERVABILITY !== "off";

export async function withSpan<T>(
  name: string,
  attrs: Record<string, string | number | boolean>,
  fn: () => Promise<T>,
): Promise<T> {
  if (!ENABLED) return fn();

  const started = Date.now();
  try {
    const result = await fn();
    emit({
      span: name,
      status: "ok",
      duration_ms: Date.now() - started,
      ...attrs,
    });
    return result;
  } catch (e) {
    emit({
      span: name,
      status: "error",
      duration_ms: Date.now() - started,
      error: e instanceof Error ? e.message : String(e),
      ...attrs,
    });
    throw e;
  }
}

function emit(entry: Record<string, unknown>): void {
  // stdout is the trace/log sink; process.stdout.write avoids the
  // "console:" prefix that hosted runtimes sometimes add.
  process.stdout.write(JSON.stringify({
    timestamp: new Date().toISOString(),
    service: "max-mcp-server",
    ...entry,
  }) + "\n");
}

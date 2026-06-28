import { z } from "zod";
import { withToken, type McpServer } from "../shared";
import { requireAdmin } from "@/shared/auth/gateway-scope";
import { breakerStatus } from "../circuit-breaker";
import { clearDeadLetters, listDeadLetters } from "../dead-letter";

const listFailedRequestsSchema = z.object({
  ...withToken,
  limit: z.number().int().min(1).max(500).optional().describe("Max entries to return (default 50)"),
});

const clearFailedRequestsSchema = z.object({ ...withToken });

const circuitStatusSchema = z.object({ ...withToken });

function adminError(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  return { content: [{ type: "text" as const, text: msg }], isError: true };
}

export function registerAdminTools(server: McpServer): void {
  server.registerTool("list_failed_requests", {
    title: "List failed write requests",
    description: "Inspect the dead-letter queue — write requests (POST/PATCH/DELETE) that exhausted all retries. Useful for forensics or manual replay. Backed by Redis if REDIS_URL is set, otherwise an in-memory ring buffer of up to 500 entries.",
    inputSchema: listFailedRequestsSchema,
    annotations: { readOnlyHint: true },
  }, async (input) => {
    try {
      requireAdmin();
      const entries = await listDeadLetters(input.limit ?? 50);
      return { content: [{ type: "text", text: JSON.stringify({ count: entries.length, entries }, null, 2) }] };
    } catch (e) {
      return adminError(e);
    }
  });

  server.registerTool("clear_failed_requests", {
    title: "Clear failed requests queue",
    description: "Drain the dead-letter queue. Returns the number of entries removed. Use after manually replaying or after resolving the upstream issue.",
    inputSchema: clearFailedRequestsSchema,
    annotations: { destructiveHint: true },
  }, async () => {
    try {
      requireAdmin();
      const removed = await clearDeadLetters();
      return { content: [{ type: "text", text: JSON.stringify({ removed }) }] };
    } catch (e) {
      return adminError(e);
    }
  });

  server.registerTool("get_circuit_status", {
    title: "Get circuit breaker status",
    description: "Inspect the circuit-breaker state for each upstream host the MCP server has called. Shows whether requests are being fast-failed (state=open), probing (half-open), or flowing normally (closed).",
    inputSchema: circuitStatusSchema,
    annotations: { readOnlyHint: true },
  }, async () => {
    try {
      requireAdmin();
      const status = await breakerStatus();
      return { content: [{ type: "text", text: JSON.stringify(status, null, 2) }] };
    } catch (e) {
      return adminError(e);
    }
  });
}

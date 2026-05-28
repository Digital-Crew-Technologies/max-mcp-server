import { z } from "zod";
import { withToken, type McpServer } from "../shared";
import { breakerStatus } from "../circuit-breaker";
import { clearDeadLetters, listDeadLetters } from "../dead-letter";

const listFailedRequestsSchema = z.object({
  ...withToken,
  limit: z.number().int().min(1).max(500).optional().describe("Max entries to return (default 50)"),
});

const clearFailedRequestsSchema = z.object({ ...withToken });

const circuitStatusSchema = z.object({ ...withToken });

export function registerAdminTools(server: McpServer): void {
  server.registerTool("list_failed_requests", {
    title: "List failed write requests",
    description: "Inspect the dead-letter queue — write requests (POST/PATCH/DELETE) that exhausted all retries. Useful for forensics or manual replay. Backed by Redis if REDIS_URL is set, otherwise an in-memory ring buffer of up to 500 entries.",
    inputSchema: listFailedRequestsSchema,
  }, async (input) => {
    const entries = await listDeadLetters(input.limit ?? 50);
    return { content: [{ type: "text", text: JSON.stringify({ count: entries.length, entries }, null, 2) }] };
  });

  server.registerTool("clear_failed_requests", {
    title: "Clear failed requests queue",
    description: "Drain the dead-letter queue. Returns the number of entries removed. Use after manually replaying or after resolving the upstream issue.",
    inputSchema: clearFailedRequestsSchema,
  }, async () => {
    const removed = await clearDeadLetters();
    return { content: [{ type: "text", text: JSON.stringify({ removed }) }] };
  });

  server.registerTool("get_circuit_status", {
    title: "Get circuit breaker status",
    description: "Inspect the circuit-breaker state for each upstream host the MCP server has called. Shows whether requests are being fast-failed (state=open), probing (half-open), or flowing normally (closed).",
    inputSchema: circuitStatusSchema,
  }, async () => {
    return { content: [{ type: "text", text: JSON.stringify(breakerStatus(), null, 2) }] };
  });
}

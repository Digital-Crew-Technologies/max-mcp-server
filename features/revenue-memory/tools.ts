import type { McpServer } from "../pilot-tools/shared";
import {
  revenueMemoryRecentSchema,
  revenueMemorySearchSchema,
  revenueMemoryWriteSchema,
} from "./schema";
import {
  recentRevenueMemory,
  searchRevenueMemory,
  writeRevenueMemory,
} from "./repository";

export function registerRevenueMemoryTools(server: McpServer): void {
  server.registerTool(
    "revenue_memory_write",
    {
      title: "Write revenue memory",
      description:
        "Persist durable sales memory in CockroachDB. Use for prospect/company facts, buying signals, decisions, objections, experiment outcomes, successful patterns, failures, and relationship context that should influence future outreach.",
      inputSchema: revenueMemoryWriteSchema,
    },
    async (input) => ({
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(await writeRevenueMemory(input)),
        },
      ],
    }),
  );

  server.registerTool(
    "revenue_memory_search",
    {
      title: "Search revenue memory",
      description:
        "Semantic search over durable CockroachDB revenue memory using cosine similarity. Retrieve the most relevant prior objections, successful outreach patterns, experiments, decisions, signals, and relationship context before choosing the next sales action.",
      inputSchema: revenueMemorySearchSchema,
    },
    async (input) => ({
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(await searchRevenueMemory(input)),
        },
      ],
    }),
  );

  server.registerTool(
    "revenue_memory_recent",
    {
      title: "Read recent revenue memory",
      description:
        "Read recent durable memories for a workspace, company, or prospect. Useful when reconstructing the latest sales context before enrichment, email drafting, calls, replies, or follow-ups.",
      inputSchema: revenueMemoryRecentSchema,
    },
    async (input) => ({
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(await recentRevenueMemory(input)),
        },
      ],
    }),
  );
}

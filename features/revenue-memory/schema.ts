import { z } from "zod";

export const memoryTypeSchema = z.enum([
  "fact",
  "preference",
  "decision",
  "objection",
  "success",
  "failure",
  "experiment",
  "relationship",
  "signal",
]);

const embeddingSchema = z.array(z.number()).length(1536);

export const revenueMemoryWriteSchema = z.object({
  bearer_token: z.string().optional(),
  workspace_id: z.string().uuid(),
  entity_type: z.string().min(1).max(64),
  entity_id: z.string().min(1).max(200),
  memory_type: memoryTypeSchema,
  content: z.string().min(1).max(12_000),
  source_agent: z.string().min(1).max(64),
  source_ref: z.string().max(500).optional(),
  importance: z.number().min(0).max(1).default(0.5),
  confidence: z.number().min(0).max(1).default(1),
  embedding: embeddingSchema,
  metadata: z.record(z.unknown()).default({}),
});

export const revenueMemorySearchSchema = z.object({
  bearer_token: z.string().optional(),
  workspace_id: z.string().uuid(),
  embedding: embeddingSchema,
  entity_type: z.string().min(1).max(64).optional(),
  entity_id: z.string().min(1).max(200).optional(),
  memory_types: z.array(memoryTypeSchema).max(9).optional(),
  limit: z.number().int().min(1).max(50).default(10),
});

export const revenueMemoryRecentSchema = z.object({
  bearer_token: z.string().optional(),
  workspace_id: z.string().uuid(),
  entity_type: z.string().min(1).max(64).optional(),
  entity_id: z.string().min(1).max(200).optional(),
  limit: z.number().int().min(1).max(100).default(20),
});

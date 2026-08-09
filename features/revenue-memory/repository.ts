import { getRevenueMemoryPool, vectorLiteral } from "./db";
import type { z } from "zod";
import type {
  revenueMemoryRecentSchema,
  revenueMemorySearchSchema,
  revenueMemoryWriteSchema,
} from "./schema";

type WriteInput = z.infer<typeof revenueMemoryWriteSchema>;
type SearchInput = z.infer<typeof revenueMemorySearchSchema>;
type RecentInput = z.infer<typeof revenueMemoryRecentSchema>;

export async function writeRevenueMemory(input: WriteInput) {
  const db = getRevenueMemoryPool();
  const result = await db.query(
    `INSERT INTO revenue_memories (
       workspace_id, entity_type, entity_id, memory_type, content,
       source_agent, source_ref, importance, confidence, embedding, metadata
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::VECTOR(1536),$11::JSONB)
     RETURNING id, created_at`,
    [
      input.workspace_id,
      input.entity_type,
      input.entity_id,
      input.memory_type,
      input.content,
      input.source_agent,
      input.source_ref ?? null,
      input.importance,
      input.confidence,
      vectorLiteral(input.embedding),
      JSON.stringify(input.metadata),
    ],
  );
  return result.rows[0];
}

export async function searchRevenueMemory(input: SearchInput) {
  const db = getRevenueMemoryPool();
  const where: string[] = ["workspace_id = $1"];
  const params: unknown[] = [input.workspace_id];

  if (input.entity_type) {
    params.push(input.entity_type);
    where.push(`entity_type = $${params.length}`);
  }
  if (input.entity_id) {
    params.push(input.entity_id);
    where.push(`entity_id = $${params.length}`);
  }
  if (input.memory_types?.length) {
    params.push(input.memory_types);
    where.push(`memory_type = ANY($${params.length}::STRING[])`);
  }

  params.push(vectorLiteral(input.embedding));
  const vectorParam = `$${params.length}`;
  params.push(input.limit);
  const limitParam = `$${params.length}`;

  const result = await db.query(
    `SELECT id, entity_type, entity_id, memory_type, content, source_agent,
            source_ref, importance, confidence, metadata, created_at,
            1 - (embedding <=> ${vectorParam}::VECTOR(1536)) AS similarity
       FROM revenue_memories
      WHERE ${where.join(" AND ")}
      ORDER BY embedding <=> ${vectorParam}::VECTOR(1536)
      LIMIT ${limitParam}`,
    params,
  );
  return result.rows;
}

export async function recentRevenueMemory(input: RecentInput) {
  const db = getRevenueMemoryPool();
  const where: string[] = ["workspace_id = $1"];
  const params: unknown[] = [input.workspace_id];

  if (input.entity_type) {
    params.push(input.entity_type);
    where.push(`entity_type = $${params.length}`);
  }
  if (input.entity_id) {
    params.push(input.entity_id);
    where.push(`entity_id = $${params.length}`);
  }

  params.push(input.limit);
  const result = await db.query(
    `SELECT id, entity_type, entity_id, memory_type, content, source_agent,
            source_ref, importance, confidence, metadata, created_at
       FROM revenue_memories
      WHERE ${where.join(" AND ")}
      ORDER BY created_at DESC
      LIMIT $${params.length}`,
    params,
  );
  return result.rows;
}

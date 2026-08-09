CREATE TABLE IF NOT EXISTS revenue_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  entity_type STRING NOT NULL,
  entity_id STRING NOT NULL,
  memory_type STRING NOT NULL CHECK (memory_type IN (
    'fact','preference','decision','objection','success','failure',
    'experiment','relationship','signal'
  )),
  content STRING NOT NULL,
  source_agent STRING NOT NULL,
  source_ref STRING NULL,
  importance FLOAT8 NOT NULL DEFAULT 0.5 CHECK (importance >= 0 AND importance <= 1),
  confidence FLOAT8 NOT NULL DEFAULT 1 CHECK (confidence >= 0 AND confidence <= 1),
  embedding VECTOR(1536) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_accessed_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS revenue_memories_workspace_created_idx
  ON revenue_memories (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS revenue_memories_entity_idx
  ON revenue_memories (workspace_id, entity_type, entity_id, created_at DESC);

-- CockroachDB distributed vector index. Prefixing by workspace_id keeps
-- semantic retrieval isolated and efficient per tenant.
CREATE VECTOR INDEX IF NOT EXISTS revenue_memories_embedding_idx
  ON revenue_memories (workspace_id, embedding);

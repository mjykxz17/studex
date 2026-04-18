ALTER TABLE canvas_files ADD COLUMN IF NOT EXISTS ai_summary TEXT;
ALTER TABLE canvas_files ADD COLUMN IF NOT EXISTS content_hash TEXT;
ALTER TABLE canvas_files ADD COLUMN IF NOT EXISTS source_updated_at TIMESTAMPTZ;

ALTER TABLE announcements ADD COLUMN IF NOT EXISTS content_hash TEXT;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS source_updated_at TIMESTAMPTZ;

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS description_hash TEXT;

ALTER TABLE embeddings ADD COLUMN IF NOT EXISTS source_label TEXT;
ALTER TABLE embeddings ADD COLUMN IF NOT EXISTS module_code TEXT;

DROP FUNCTION IF EXISTS match_chunks(vector(384), uuid, uuid, int);

CREATE FUNCTION match_chunks(
 query_embedding vector(384),
 match_user_id uuid,
 match_module_id uuid,
 match_count int
)
RETURNS TABLE(
 id uuid,
 source_id uuid,
 chunk_text text,
 source_type text,
 source_label text,
 module_code text,
 similarity float
)
LANGUAGE sql AS $$
 SELECT
  id,
  source_id,
  chunk_text,
  source_type,
  source_label,
  module_code,
  1 - (embedding <=> query_embedding) AS similarity
 FROM embeddings
 WHERE user_id = match_user_id
 AND (match_module_id IS NULL OR module_id = match_module_id)
 ORDER BY embedding <=> query_embedding
 LIMIT match_count;
$$;

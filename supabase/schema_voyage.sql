CREATE EXTENSION IF NOT EXISTS vector;
DROP TABLE IF EXISTS sync_log;
DROP TABLE IF EXISTS embeddings;
DROP TABLE IF EXISTS tasks;
DROP TABLE IF EXISTS announcements;
DROP TABLE IF EXISTS canvas_files;
DROP TABLE IF EXISTS modules;
DROP TABLE IF EXISTS users;
DROP FUNCTION IF EXISTS match_chunks;

create table users (
 id uuid default gen_random_uuid() primary key,
 email text unique,
 canvas_token_enc text,
 ai_provider text,
 ai_key_enc text,
 ai_model text,
 created_at timestamptz default now(),
 last_synced_at timestamptz
);

create table modules (
 id uuid default gen_random_uuid() primary key,
 user_id uuid references users(id),
 canvas_course_id text,
 code text,
 title text,
 last_canvas_sync timestamptz,
 sync_enabled bool default true
);

create table canvas_files (
 id uuid default gen_random_uuid() primary key,
 module_id uuid references modules(id),
 user_id uuid references users(id),
 canvas_file_id text unique,
 filename text,
 file_type text,
 canvas_url text,
 extracted_text text,
 processed bool default false,
 week_number int,
 uploaded_at timestamptz
);

create table announcements (
 id uuid default gen_random_uuid() primary key,
 module_id uuid references modules(id),
 user_id uuid references users(id),
 canvas_announcement_id text unique,
 title text,
 body_raw text,
 ai_summary text,
 importance text,
 detected_deadlines jsonb,
 posted_at timestamptz
);

create table tasks (
 id uuid default gen_random_uuid() primary key,
 module_id uuid references modules(id),
 user_id uuid references users(id),
 title text,
 due_at timestamptz,
 source text,
 source_ref_id text,
 completed bool default false,
 weight float
);

create table embeddings (
 id uuid default gen_random_uuid() primary key,
 user_id uuid references users(id),
 module_id uuid references modules(id),
 source_type text,
 source_id uuid,
 chunk_index int,
 chunk_text text,
 embedding vector(1024),
 created_at timestamptz default now()
);

create table sync_log (
 id uuid default gen_random_uuid() primary key,
 user_id uuid references users(id),
 sync_type text,
 status text,
 items_processed int,
 error_message text,
 ran_at timestamptz default now()
);

create function match_chunks(
 query_embedding vector(1024),
 match_user_id uuid,
 match_module_id uuid,
 match_count int
)
returns table(id uuid, chunk_text text, source_type text, similarity float)
language sql as $$
 select id, chunk_text, source_type,
 1 - (embedding <=> query_embedding) as similarity
 from embeddings
 where user_id = match_user_id
 and (match_module_id is null or module_id = match_module_id)
 order by embedding <=> query_embedding
 limit match_count;
$$;
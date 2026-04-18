CREATE EXTENSION IF NOT EXISTS vector;
DROP TABLE IF EXISTS sync_log CASCADE;
DROP TABLE IF EXISTS embeddings CASCADE;
DROP TABLE IF EXISTS tasks CASCADE;
DROP TABLE IF EXISTS announcements CASCADE;
DROP TABLE IF EXISTS canvas_files CASCADE;
DROP TABLE IF EXISTS modules CASCADE;
DROP TABLE IF EXISTS users CASCADE;
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
 user_id uuid references users(id) not null,
 canvas_course_id text not null,
 code text,
 title text,
 last_canvas_sync timestamptz,
 sync_enabled bool default true,
 unique(user_id, canvas_course_id)
);

create table canvas_files (
 id uuid default gen_random_uuid() primary key,
 module_id uuid references modules(id) not null,
 user_id uuid references users(id) not null,
 canvas_file_id text not null,
 filename text,
 file_type text,
 canvas_url text,
 extracted_text text,
 ai_summary text,
 content_hash text,
 processed bool default false,
 week_number int,
 uploaded_at timestamptz,
 source_updated_at timestamptz,
 unique(user_id, canvas_file_id)
);

create table announcements (
 id uuid default gen_random_uuid() primary key,
 module_id uuid references modules(id) not null,
 user_id uuid references users(id) not null,
 canvas_announcement_id text not null,
 title text,
 body_raw text,
 ai_summary text,
 importance text,
 detected_deadlines jsonb,
 posted_at timestamptz,
 content_hash text,
 source_updated_at timestamptz,
 unique(user_id, canvas_announcement_id)
);

create table tasks (
 id uuid default gen_random_uuid() primary key,
 module_id uuid references modules(id) not null,
 user_id uuid references users(id) not null,
 title text,
 due_at timestamptz,
 source text,
 source_ref_id text,
 completed bool default false,
 description_hash text,
 weight float,
 unique(user_id, source, source_ref_id)
);

create table embeddings (
 id uuid default gen_random_uuid() primary key,
 user_id uuid references users(id) not null,
 module_id uuid references modules(id) not null,
 source_type text not null,
 source_id uuid not null,
 source_label text,
 module_code text,
 chunk_index int not null,
 chunk_text text,
 embedding vector(384),
 created_at timestamptz default now()
);

create table sync_log (
 id uuid default gen_random_uuid() primary key,
 user_id uuid references users(id) not null,
 sync_type text,
 status text,
 items_processed int,
 error_message text,
 ran_at timestamptz default now()
);

create function match_chunks(
 query_embedding vector(384),
 match_user_id uuid,
 match_module_id uuid,
 match_count int
)
returns table(
 id uuid,
 source_id uuid,
 chunk_text text,
 source_type text,
 source_label text,
 module_code text,
 similarity float
)
language sql as $$
 select id, source_id, chunk_text, source_type, source_label, module_code,
 1 - (embedding <=> query_embedding) as similarity
 from embeddings
 where user_id = match_user_id
 and (match_module_id is null or module_id = match_module_id)
 order by embedding <=> query_embedding
 limit match_count;
$$;

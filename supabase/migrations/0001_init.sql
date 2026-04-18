-- Studex canonical schema (post-Phase-A, pre-Phase-B).
-- This is the source of truth for the current DB shape.
-- For fresh projects, run this file once. For in-place upgrades from
-- a pre-pivot DB, apply migrations in order from supabase/migrations/.

create table users (
  id uuid default gen_random_uuid() primary key,
  email text unique,
  created_at timestamptz default now(),
  last_synced_at timestamptz
);

-- Note: this table will be renamed to `courses` in Phase B.
create table modules (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references users(id),
  canvas_course_id text,
  code text,
  title text,
  last_canvas_sync timestamptz,
  sync_enabled bool default true,
  unique (user_id, canvas_course_id)
);

create table canvas_files (
  id uuid default gen_random_uuid() primary key,
  module_id uuid references modules(id),
  user_id uuid references users(id),
  canvas_file_id text,
  filename text,
  file_type text,
  canvas_url text,
  extracted_text text,
  content_hash text,
  processed bool default false,
  week_number int,
  uploaded_at timestamptz,
  source_updated_at timestamptz,
  unique (user_id, canvas_file_id)
);

create table announcements (
  id uuid default gen_random_uuid() primary key,
  module_id uuid references modules(id),
  user_id uuid references users(id),
  canvas_announcement_id text,
  title text,
  body_raw text,
  importance text,
  detected_deadlines jsonb,
  posted_at timestamptz,
  content_hash text,
  source_updated_at timestamptz,
  unique (user_id, canvas_announcement_id)
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
  description_hash text,
  weight float,
  unique (user_id, source, source_ref_id)
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

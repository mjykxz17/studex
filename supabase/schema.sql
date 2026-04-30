-- Studex canonical schema (Phase B, ongoing).
-- This is the source of truth for the current DB shape.
-- For fresh projects, apply migrations 0001..NNNN in order.

create table users (
  id uuid default gen_random_uuid() primary key,
  email text unique,
  created_at timestamptz default now(),
  last_synced_at timestamptz
);

create table courses (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references users(id),
  canvas_course_id text,
  code text,
  title text,
  last_canvas_sync timestamptz,
  sync_enabled bool default true,
  panopto_tab_url text,
  unique (user_id, canvas_course_id)
);

create table canvas_files (
  id uuid default gen_random_uuid() primary key,
  course_id uuid references courses(id),
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
  course_id uuid references courses(id),
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
  course_id uuid references courses(id),
  user_id uuid references users(id),
  title text,
  due_at timestamptz,
  source text,
  source_ref_id text,
  completed bool default false,
  description_hash text,
  description_html text,
  description_text text,
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

create table grades (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references users(id),
  assignment_id uuid references tasks(id),
  score numeric,
  grade_text text,
  points_possible numeric,
  submitted_at timestamptz,
  graded_at timestamptz,
  state text,
  unique (user_id, assignment_id)
);

create table canvas_pages (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references users(id),
  course_id uuid references courses(id),
  page_url text,
  title text,
  body_html text,
  updated_at timestamptz,
  published bool default true,
  front_page bool default false,
  unique (course_id, page_url)
);

create table course_modules (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references users(id),
  course_id uuid references courses(id),
  canvas_module_id text,
  name text,
  position int,
  unlock_at timestamptz,
  state text,
  items_count int,
  unique (course_id, canvas_module_id)
);

create table course_module_items (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references users(id),
  course_module_id uuid references course_modules(id),
  canvas_item_id text,
  title text,
  item_type text,
  position int,
  indent int,
  content_ref text,
  external_url text,
  unique (course_module_id, canvas_item_id)
);

-- Agentic cheatsheet pipeline (added by migration 0007).
create table cheatsheets (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references users(id) on delete cascade,
  course_id uuid not null references courses(id) on delete cascade,
  title text not null,
  source_file_ids uuid[] not null,
  markdown text,
  citations jsonb,
  status text not null check (status in ('streaming','complete','failed')),
  failure_reason text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index cheatsheets_user_course_idx on cheatsheets (user_id, course_id, created_at desc);

create table cheatsheet_runs (
  id uuid default gen_random_uuid() primary key,
  cheatsheet_id uuid not null references cheatsheets(id) on delete cascade,
  stage text not null check (stage in ('ingest','detect-gaps','web-search','synthesize')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  tokens_in int,
  tokens_out int,
  metadata jsonb,
  error text
);

create index cheatsheet_runs_cheatsheet_idx on cheatsheet_runs (cheatsheet_id, started_at);

create table web_search_usage (
  user_id uuid not null references users(id) on delete cascade,
  date date not null,
  count int not null default 0,
  primary key (user_id, date)
);

-- Phase A: NUSMods catalog cache. Lazily populated by lib/nus-catalog.ts.
create table if not exists nus_modules (
  code text primary key,
  title text not null,
  mc numeric(4,1) not null default 0,
  module_credit_text text,
  level int,
  prefix text,
  faculty text,
  department text,
  description text,
  prereq_tree jsonb,
  semesters int[],
  fetched_at timestamptz default now()
);

create index if not exists nus_modules_prefix_level_idx on nus_modules (prefix, level);

-- Phase A: per-user module history that powers the degree audit.
create table if not exists module_takings (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references users(id),
  module_code text not null,
  status text not null check (status in ('completed', 'in_progress', 'planning', 'dropped')),
  semester text,
  grade text,
  bucket_override text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, module_code)
);

-- Phase A: user's program selection. Multi-program-ready; only is_primary=true
-- is used today.
create table if not exists user_programs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references users(id),
  program_id text not null,
  matriculation_year int,
  is_primary bool default true,
  created_at timestamptz default now(),
  unique (user_id, program_id)
);

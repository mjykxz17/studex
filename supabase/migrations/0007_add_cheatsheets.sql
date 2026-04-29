-- supabase/migrations/0007_add_cheatsheets.sql
-- Adds tables for the agentic cheatsheet pipeline.

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

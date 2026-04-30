-- 0010: degree audit phase A — NUSMods catalog cache, user module history,
-- and program selection. The audit engine joins these three to produce the
-- per-bucket progress shown in the Progress tab.

create table if not exists nus_modules (
  code text primary key,
  title text not null,
  mc numeric(4,1) not null default 0,
  module_credit_text text,         -- raw "4 MC" string from NUSMods, kept for fidelity
  level int,                        -- derived from code (CS3235 -> 3000)
  prefix text,                      -- derived from code ("CS")
  faculty text,
  department text,
  description text,
  prereq_tree jsonb,                -- raw prereqTree from NUSMods (nullable)
  semesters int[],                  -- which semesters offered
  fetched_at timestamptz default now()
);

create index if not exists nus_modules_prefix_level_idx on nus_modules (prefix, level);

create table if not exists module_takings (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references users(id),
  module_code text not null,
  status text not null check (status in ('completed', 'in_progress', 'planning', 'dropped')),
  semester text,                    -- e.g., 'AY24/25 Sem 2' (free-form for now)
  grade text,                       -- 'A+', 'A', ..., 'F', 'S', 'U' or null
  bucket_override text,             -- user-chosen bucket id; null means greedy
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, module_code)
);

create table if not exists user_programs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references users(id),
  program_id text not null,         -- e.g., 'bcomp-isc-2024'
  matriculation_year int,
  is_primary bool default true,
  created_at timestamptz default now(),
  unique (user_id, program_id)
);

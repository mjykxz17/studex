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

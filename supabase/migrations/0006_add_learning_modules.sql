-- Phase B: add Canvas "Modules" (ordered learning units within a course) and
-- their items. Canvas's Modules tab is the single most-used tab in NUS Canvas.

create table if not exists course_modules (
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

create table if not exists course_module_items (
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

-- Phase B: add the canvas_pages table. Stores Canvas wiki-style pages.
-- Metadata is populated first during sync; body is fetched lazily only when
-- Canvas's updated_at is newer than the cached copy.

create table if not exists canvas_pages (
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

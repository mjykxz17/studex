-- Phase B: add the grades table. One row per (user, assignment) submission.
-- Populated from Canvas's ?include[]=submission field alongside assignment
-- upserts in the sync pipeline.

create table if not exists grades (
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

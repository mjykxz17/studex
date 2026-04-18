-- Rename the pre-pivot `modules` table (which stored Canvas courses) to `courses`,
-- clearing the naming clash with Canvas's own "Modules" concept (ordered learning
-- units inside a course). Cascade-renames the `module_id` FK column across the
-- three child tables.
--
-- Idempotent via pg_catalog introspection; safe to re-run.

do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'modules') then
    alter table modules rename to courses;
  end if;

  if exists (select 1 from information_schema.columns where table_name = 'canvas_files' and column_name = 'module_id') then
    alter table canvas_files rename column module_id to course_id;
  end if;

  if exists (select 1 from information_schema.columns where table_name = 'announcements' and column_name = 'module_id') then
    alter table announcements rename column module_id to course_id;
  end if;

  if exists (select 1 from information_schema.columns where table_name = 'tasks' and column_name = 'module_id') then
    alter table tasks rename column module_id to course_id;
  end if;
end $$;

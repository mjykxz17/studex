-- 0008: persist assignment descriptions so they can be rendered in-app.
-- Previously only description_hash was stored (for change detection).
-- description_html is sanitized server-side before storage; description_text
-- is the stripped plain-text version used by AI / cheatsheet pipelines.

alter table tasks add column if not exists description_html text;
alter table tasks add column if not exists description_text text;

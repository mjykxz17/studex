-- Idempotent cleanup: drops AI-era artifacts from a pre-pivot Studex DB.
-- Safe to run on a fresh DB (no-op on missing objects).

drop function if exists match_chunks(vector(384), uuid, uuid, int);
drop table if exists embeddings;
drop extension if exists vector;

alter table canvas_files drop column if exists ai_summary;
alter table announcements drop column if exists ai_summary;
alter table users drop column if exists canvas_token_enc;
alter table users drop column if exists ai_provider;
alter table users drop column if exists ai_key_enc;
alter table users drop column if exists ai_model;

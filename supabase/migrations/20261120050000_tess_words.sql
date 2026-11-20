-- Tess's word list: names and words John wants her to hear right.
--
-- A list of short strings on his profile row, sent to the transcription
-- service with every recording of his voice. Read by admins, written only by
-- the server (the table's existing rules cover the new column).
--
-- Safe to run more than once.

alter table public.ai_tess_profile add column if not exists words jsonb not null default '[]'::jsonb;

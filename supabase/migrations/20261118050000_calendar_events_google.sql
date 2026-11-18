-- Two-way Google Calendar: an event made here can be mirrored to Google.
-- The Google event id is kept so edits, moves and deletes follow it there.
alter table public.calendar_events
  add column if not exists google_event_id text;

create index if not exists calendar_events_google_event_id_idx
  on public.calendar_events (google_event_id)
  where google_event_id is not null;

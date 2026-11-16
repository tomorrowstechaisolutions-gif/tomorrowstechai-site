-- Field Notes: remember which Content Studio item an article draft came from
-- ("Send to Blog"), so the studio can link to it and an item is never sent
-- twice. Additive and nullable; existing articles are unaffected.

alter table public.field_notes_articles
  add column if not exists source_content_id uuid
    references public.content_items(id) on delete set null;

create unique index if not exists field_notes_articles_source_content_key
  on public.field_notes_articles (source_content_id)
  where source_content_id is not null;

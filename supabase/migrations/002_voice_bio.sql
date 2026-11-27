alter table public.messages drop constraint messages_check, drop constraint messages_kind_check;
alter table public.messages add column dur_ms integer check (dur_ms is null or dur_ms between 0 and 61000);
alter table public.messages add constraint messages_kind_check check (kind in ('text','image','voice'));
alter table public.messages add constraint messages_body_check check (
  (kind = 'text'  and char_length(body) between 1 and 4000) or
  (kind = 'image' and char_length(body) between 1 and 600000 and body like 'data:image/%') or
  (kind = 'voice' and char_length(body) between 1 and 400000 and body like 'data:audio/%' and dur_ms is not null));
grant insert (dur_ms) on public.messages to authenticated;
alter table public.profiles add column if not exists bio text check (bio is null or char_length(bio) <= 160);
grant update (bio) on public.profiles to authenticated;

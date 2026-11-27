create table if not exists public.wallpapers(
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  chat_id uuid not null default '00000000-0000-0000-0000-000000000000',
  value text not null check (char_length(value) <= 350000 and (value ~ '^p:[a-z0-9_-]{1,20}$' or value like 'data:image/%')),
  updated_at timestamptz not null default now(),
  primary key (user_id, chat_id));
alter table public.wallpapers enable row level security;
alter table public.wallpapers force row level security;
revoke all on public.wallpapers from anon, authenticated, public;
grant select, delete on public.wallpapers to authenticated;
grant insert (chat_id, value) on public.wallpapers to authenticated;
grant update (value, updated_at) on public.wallpapers to authenticated;
drop policy if exists wp_select on public.wallpapers; drop policy if exists wp_insert on public.wallpapers; drop policy if exists wp_update on public.wallpapers; drop policy if exists wp_delete on public.wallpapers;
create policy wp_select on public.wallpapers for select to authenticated using (user_id = (select auth.uid()));
create policy wp_insert on public.wallpapers for insert to authenticated with check (user_id = (select auth.uid()));
create policy wp_update on public.wallpapers for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy wp_delete on public.wallpapers for delete to authenticated using (user_id = (select auth.uid()));
grant update (chat_id, value, updated_at) on public.wallpapers to authenticated;

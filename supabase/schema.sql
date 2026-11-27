create table public.profiles(
  id uuid primary key references auth.users(id) on delete cascade,
  wanas_id text unique not null check (wanas_id ~ '^[a-z0-9_.]{3,20}$'),
  name text not null check (char_length(name) between 1 and 40),
  photo text check (photo is null or (char_length(photo) < 400000 and photo like 'data:image/%')),
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now());
create table public.contacts(
  user_id uuid not null references public.profiles(id) on delete cascade,
  contact_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(user_id, contact_id), check (user_id <> contact_id));
create table public.messages(
  id bigint generated always as identity primary key,
  from_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  to_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null default 'text' check (kind in ('text','image')),
  body text not null check (char_length(body) between 1 and 600000 and (kind = 'image' or char_length(body) <= 4000)),
  created_at timestamptz not null default now(),
  read_at timestamptz);
create index messages_pair on public.messages(from_id, to_id, id);
create index messages_to on public.messages(to_id, read_at);

alter table public.profiles enable row level security;
alter table public.contacts enable row level security;
alter table public.messages enable row level security;
alter table public.profiles force row level security;
alter table public.contacts force row level security;
alter table public.messages force row level security;

revoke all on public.profiles, public.contacts, public.messages from anon, authenticated, public;
grant select on public.profiles, public.contacts, public.messages to authenticated;
grant update (name, photo, last_seen) on public.profiles to authenticated;
grant insert (to_id, kind, body) on public.messages to authenticated;
grant update (read_at) on public.messages to authenticated;

create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or exists (select 1 from public.contacts c where c.user_id = (select auth.uid()) and c.contact_id = profiles.id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy contacts_select on public.contacts for select to authenticated
  using (user_id = (select auth.uid()));
create policy messages_select on public.messages for select to authenticated
  using (from_id = (select auth.uid()) or to_id = (select auth.uid()));
create policy messages_insert on public.messages for insert to authenticated
  with check (from_id = (select auth.uid()) and exists (select 1 from public.contacts c where c.user_id = (select auth.uid()) and c.contact_id = messages.to_id));
create policy messages_mark_read on public.messages for update to authenticated
  using (to_id = (select auth.uid())) with check (to_id = (select auth.uid()));

-- profile row is created by a trigger when the Edge Function creates the auth user
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, wanas_id, name) values (new.id, new.raw_user_meta_data->>'wanas_id', new.raw_user_meta_data->>'name');
  return new;
end $$;
revoke all on function public.handle_new_user() from public, anon, authenticated;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.find_user(p_wanas_id text) returns table(id uuid, wanas_id text, name text, photo text)
language sql stable security definer set search_path = public as $$
  select p.id, p.wanas_id, p.name, p.photo from public.profiles p where p.wanas_id = lower(trim(p_wanas_id)) and auth.uid() is not null $$;
create or replace function public.add_contact(p_wanas_id text) returns uuid
language plpgsql security definer set search_path = public as $$
declare t uuid; me uuid := auth.uid();
begin
  if me is null then raise exception 'unauthorized'; end if;
  select id into t from public.profiles where wanas_id = lower(trim(p_wanas_id));
  if t is null then raise exception 'not_found'; end if;
  if t = me then raise exception 'self'; end if;
  insert into public.contacts(user_id, contact_id) values (me, t), (t, me) on conflict do nothing;
  return t;
end $$;
create or replace function public.my_conversations() returns table(contact_id uuid, last_id bigint, last_from uuid, last_kind text, last_body text, last_at timestamptz, last_read timestamptz, unread int)
language sql stable security invoker set search_path = public as $$
  select c.contact_id, m.id, m.from_id, m.kind, case when m.kind = 'text' then m.body else '' end, m.created_at, m.read_at,
    (select count(*)::int from public.messages u where u.from_id = c.contact_id and u.to_id = auth.uid() and u.read_at is null)
  from public.contacts c
  left join lateral (select * from public.messages x where (x.from_id = c.contact_id and x.to_id = auth.uid()) or (x.from_id = auth.uid() and x.to_id = c.contact_id) order by x.id desc limit 1) m on true
  where c.user_id = auth.uid() $$;
revoke all on function public.find_user(text), public.add_contact(text), public.my_conversations() from public, anon;
grant execute on function public.find_user(text), public.add_contact(text), public.my_conversations() to authenticated;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='messages') then alter publication supabase_realtime add table public.messages; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='profiles') then alter publication supabase_realtime add table public.profiles; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='contacts') then alter publication supabase_realtime add table public.contacts; end if;
end $$;

create table if not exists public.app_admins(user_id uuid primary key references public.profiles(id) on delete cascade, created_at timestamptz not null default now());
alter table public.app_admins enable row level security;
alter table public.app_admins force row level security;
revoke all on public.app_admins from anon, authenticated, public;

create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.app_admins a where a.user_id = auth.uid()) $$;

create or replace function public.admin_stats() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if auth.uid() is null or not exists (select 1 from public.app_admins a where a.user_id = auth.uid()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'generated_at', now(),
    'users_total', (select count(*) from public.profiles),
    'online_now', (select count(*) from public.profiles where last_seen > now() - interval '45 seconds'),
    'active_24h', (select count(*) from public.profiles where last_seen > now() - interval '24 hours'),
    'active_7d', (select count(*) from public.profiles where last_seen > now() - interval '7 days'),
    'signups_today', (select count(*) from public.profiles where created_at >= date_trunc('day', now())),
    'signups_7d', (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'signups_per_day', coalesce((select jsonb_agg(jsonb_build_object('day', d::date, 'n', (select count(*) from public.profiles p where p.created_at::date = d::date)) order by d) from generate_series(date_trunc('day', now()) - interval '13 days', date_trunc('day', now()), interval '1 day') d), '[]'::jsonb),
    'messages_total', (select count(*) from public.messages),
    'messages_today', (select count(*) from public.messages where created_at >= date_trunc('day', now())),
    'messages_7d', (select count(*) from public.messages where created_at > now() - interval '7 days'),
    'messages_text', (select count(*) from public.messages where kind = 'text'),
    'messages_image', (select count(*) from public.messages where kind = 'image'),
    'messages_voice', (select count(*) from public.messages where kind = 'voice'),
    'messages_per_day', coalesce((select jsonb_agg(jsonb_build_object('day', d::date, 'n', (select count(*) from public.messages m where m.created_at::date = d::date)) order by d) from generate_series(date_trunc('day', now()) - interval '13 days', date_trunc('day', now()), interval '1 day') d), '[]'::jsonb),
    'conversations', (select count(*) from public.contacts where user_id < contact_id),
    'users_with_contact', (select count(distinct user_id) from public.contacts),
    'users_who_sent', (select count(distinct from_id) from public.messages),
    'with_photo', (select count(*) from public.profiles where photo is not null),
    'with_bio', (select count(*) from public.profiles where bio is not null and bio <> ''),
    'with_wallpaper', (select count(distinct user_id) from public.wallpapers),
    'avg_msgs_per_sender', (select coalesce(round(count(*)::numeric / nullif(count(distinct from_id), 0), 1), 0) from public.messages),
    'media_mb', (select round(coalesce(sum(char_length(body)) filter (where kind <> 'text'), 0) / 1048576.0, 2) from public.messages),
    'db_mb', (select round(pg_database_size(current_database()) / 1048576.0, 1)),
    'db_cap_mb', 500
  ) into r;
  return r;
end $$;
revoke all on function public.is_admin(), public.admin_stats() from public, anon;
grant execute on function public.is_admin(), public.admin_stats() to authenticated;

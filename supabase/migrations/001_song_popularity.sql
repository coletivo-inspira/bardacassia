create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists public.catalog_codes (
  code text primary key,
  title text not null default '',
  artist text not null default '',
  active boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.catalog_codes add column if not exists title text not null default '';
alter table public.catalog_codes add column if not exists artist text not null default '';

create table if not exists public.song_interactions (
  user_id uuid not null references auth.users(id) on delete cascade,
  code text not null references public.catalog_codes(code),
  first_open_at timestamptz,
  favorited boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, code)
);

create table if not exists private.write_limits (
  user_id uuid not null,
  window_start timestamptz not null,
  writes integer not null,
  primary key (user_id, window_start)
);

alter table public.catalog_codes enable row level security;
alter table public.song_interactions enable row level security;
alter table private.write_limits enable row level security;
revoke all on public.catalog_codes, public.song_interactions from anon, authenticated;
revoke all on private.write_limits from public, anon, authenticated;

create or replace function private.consume_write()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_window timestamptz := date_trunc('minute', now());
  v_count integer;
begin
  if v_user is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is not true then
    raise exception 'anonymous session required' using errcode = '42501';
  end if;
  insert into private.write_limits(user_id, window_start, writes)
  values (v_user, v_window, 1)
  on conflict (user_id, window_start)
  do update set writes = private.write_limits.writes + 1
  returning writes into v_count;
  if v_count > 120 then
    raise exception 'write limit exceeded' using errcode = 'P0001';
  end if;
end;
$$;
revoke all on function private.consume_write() from public, anon, authenticated;

create or replace function public.record_song_open(p_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.consume_write();
  if not exists(select 1 from public.catalog_codes where code = p_code and active) then
    raise exception 'unknown song code' using errcode = '22023';
  end if;
  insert into public.song_interactions(user_id, code, first_open_at)
  values (auth.uid(), p_code, now())
  on conflict (user_id, code)
  do update set first_open_at = coalesce(public.song_interactions.first_open_at, excluded.first_open_at);
end;
$$;

create or replace function public.set_song_favorite(p_code text, p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.consume_write();
  if not exists(select 1 from public.catalog_codes where code = p_code and active) then
    raise exception 'unknown song code' using errcode = '22023';
  end if;
  insert into public.song_interactions(user_id, code, favorited, updated_at)
  values (auth.uid(), p_code, coalesce(p_active, false), now())
  on conflict (user_id, code)
  do update set favorited = excluded.favorited, updated_at = now();
end;
$$;

create or replace function public.get_popular_songs(p_limit integer default 40)
returns table(code text, score bigint, favorite_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select c.code,
    (count(i.first_open_at) + 3 * count(*) filter (where i.favorited))::bigint as score,
    count(*) filter (where i.favorited)::bigint as favorite_count
  from public.catalog_codes c
  join public.song_interactions i on i.code = c.code
  where c.active
  group by c.code
  having count(i.first_open_at) > 0 or count(*) filter (where i.favorited) > 0
  order by score desc, favorite_count desc, c.title asc, c.artist asc, c.code asc
  limit least(greatest(coalesce(p_limit, 40), 1), 40);
$$;

create or replace function public.sync_catalog_codes(p_codes jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  update public.catalog_codes set active = false, updated_at = now()
  where active and not exists (
    select 1 from jsonb_to_recordset(p_codes) as codes(code text) where codes.code = catalog_codes.code
  );
  insert into public.catalog_codes(code, title, artist, active, updated_at)
  select distinct codes.code, codes.title, codes.artist, true, now()
  from jsonb_to_recordset(p_codes) as codes(code text, title text, artist text)
  on conflict (code) do update set title = excluded.title, artist = excluded.artist, active = true, updated_at = now();
end;
$$;

revoke all on function public.record_song_open(text) from public, anon;
revoke all on function public.set_song_favorite(text, boolean) from public, anon;
revoke all on function public.get_popular_songs(integer) from public, anon;
revoke all on function public.sync_catalog_codes(jsonb) from public, anon, authenticated;
grant execute on function public.record_song_open(text) to authenticated;
grant execute on function public.set_song_favorite(text, boolean) to authenticated;
grant execute on function public.get_popular_songs(integer) to authenticated;
grant execute on function public.sync_catalog_codes(jsonb) to service_role;

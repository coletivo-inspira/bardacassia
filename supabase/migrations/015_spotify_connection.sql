-- Spotify linked to the account: the refresh token stays encrypted in the
-- private schema (Vault key from 002/009) and only the Edge Function
-- `spotify-connect` (service role) reads or writes it. The listening summary
-- lives in public.music_profiles, readable only by its owner.

create table if not exists private.spotify_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  spotify_user_id text not null check (char_length(spotify_user_id) <= 128),
  refresh_token_encrypted bytea not null,
  scopes text not null default '' check (char_length(scopes) <= 500),
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz
);
alter table private.spotify_connections enable row level security;
revoke all on private.spotify_connections from public, anon, authenticated;

create table if not exists public.music_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  source text not null default 'spotify' check (source in ('spotify')),
  source_display_name text not null default '' check (char_length(source_display_name) <= 120),
  top_tracks jsonb not null default '{}'::jsonb,
  top_artists jsonb not null default '{}'::jsonb,
  recent_tracks jsonb not null default '[]'::jsonb,
  synced_at timestamptz not null default now()
);

alter table public.music_profiles enable row level security;
revoke all on public.music_profiles from public, anon, authenticated;
grant select on public.music_profiles to authenticated;

drop policy if exists "music_profiles_select_own" on public.music_profiles;
create policy "music_profiles_select_own" on public.music_profiles
  for select to authenticated
  using ((select auth.uid()) = user_id and coalesce((select auth.jwt() ->> 'is_anonymous')::boolean, false) is false);

-- Service-role helpers for the Edge Function. PostgREST only exposes the
-- public schema, so these live there but are executable by service_role only.
create or replace function public.spotify_save_connection(
  p_user uuid,
  p_spotify_user_id text,
  p_refresh_token text,
  p_scopes text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user is null or coalesce(p_refresh_token, '') = '' then
    raise exception 'invalid connection' using errcode = '22023';
  end if;
  insert into private.spotify_connections(user_id, spotify_user_id, refresh_token_encrypted, scopes, connected_at)
  values (
    p_user,
    left(coalesce(p_spotify_user_id, ''), 128),
    extensions.pgp_sym_encrypt(p_refresh_token, private.profile_key()),
    left(coalesce(p_scopes, ''), 500),
    now()
  )
  on conflict (user_id) do update set
    spotify_user_id = excluded.spotify_user_id,
    refresh_token_encrypted = excluded.refresh_token_encrypted,
    scopes = excluded.scopes;
end;
$$;

create or replace function public.spotify_rotate_token(p_user uuid, p_refresh_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(p_refresh_token, '') = '' then
    return;
  end if;
  update private.spotify_connections
  set refresh_token_encrypted = extensions.pgp_sym_encrypt(p_refresh_token, private.profile_key())
  where user_id = p_user;
end;
$$;

create or replace function public.spotify_get_connection(p_user uuid)
returns table (spotify_user_id text, refresh_token text, last_synced_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return query
  select c.spotify_user_id,
         extensions.pgp_sym_decrypt(c.refresh_token_encrypted, private.profile_key()),
         c.last_synced_at
  from private.spotify_connections c
  where c.user_id = p_user;
end;
$$;

create or replace function public.spotify_save_profile(
  p_user uuid,
  p_display_name text,
  p_top_tracks jsonb,
  p_top_artists jsonb,
  p_recent_tracks jsonb
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
begin
  if not exists (select 1 from private.spotify_connections where user_id = p_user) then
    raise exception 'spotify not connected' using errcode = 'P0002';
  end if;
  if pg_column_size(p_top_tracks) + pg_column_size(p_top_artists) + pg_column_size(p_recent_tracks) > 1048576 then
    raise exception 'profile too large' using errcode = '54000';
  end if;
  insert into public.music_profiles(user_id, source, source_display_name, top_tracks, top_artists, recent_tracks, synced_at)
  values (
    p_user,
    'spotify',
    left(coalesce(p_display_name, ''), 120),
    coalesce(p_top_tracks, '{}'::jsonb),
    coalesce(p_top_artists, '{}'::jsonb),
    coalesce(p_recent_tracks, '[]'::jsonb),
    v_now
  )
  on conflict (user_id) do update set
    source = excluded.source,
    source_display_name = excluded.source_display_name,
    top_tracks = excluded.top_tracks,
    top_artists = excluded.top_artists,
    recent_tracks = excluded.recent_tracks,
    synced_at = excluded.synced_at;
  update private.spotify_connections set last_synced_at = v_now where user_id = p_user;
  return v_now;
end;
$$;

create or replace function public.spotify_disconnect(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from private.spotify_connections where user_id = p_user;
  delete from public.music_profiles where user_id = p_user and source = 'spotify';
end;
$$;

revoke all on function public.spotify_save_connection(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.spotify_rotate_token(uuid, text) from public, anon, authenticated;
revoke all on function public.spotify_get_connection(uuid) from public, anon, authenticated;
revoke all on function public.spotify_save_profile(uuid, text, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.spotify_disconnect(uuid) from public, anon, authenticated;
grant execute on function public.spotify_save_connection(uuid, text, text, text) to service_role;
grant execute on function public.spotify_rotate_token(uuid, text) to service_role;
grant execute on function public.spotify_get_connection(uuid) to service_role;
grant execute on function public.spotify_save_profile(uuid, text, jsonb, jsonb, jsonb) to service_role;
grant execute on function public.spotify_disconnect(uuid) to service_role;

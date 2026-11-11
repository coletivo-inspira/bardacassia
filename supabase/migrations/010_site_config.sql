-- Papel no perfil e interruptores do site. O painel admin grava site_features;
-- o navegador lê por RPC. As variáveis VITE_* continuam o padrão quando esta
-- leitura falta. Busca e "código ao DJ" não têm interruptor.

alter table public.profiles
  add column if not exists role text not null default 'cliente';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_role_check' and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_role_check
      check (role in ('cliente', 'garcom', 'dono', 'admin'));
  end if;
end $$;

-- Quem já opera o bar ganha o papel no perfil. staff.role continua para o nome na fila.
-- Dono configura o site (admin). Não rebaixa um perfil que já é admin, dono ou garçom.
update public.profiles p
set role = 'admin'
from public.staff s
where s.user_id = p.id
  and s.role = 'dono'
  and p.role is distinct from 'admin';

update public.profiles p
set role = 'garcom'
from public.staff s
where s.user_id = p.id
  and s.role = 'garcom'
  and p.role = 'cliente';

-- Fila: linha em staff OU papel garcom/dono/admin no perfil.
create or replace function private.require_staff()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'staff only' using errcode = '42501';
  end if;
  if exists (select 1 from public.staff where user_id = auth.uid()) then
    return;
  end if;
  if exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('garcom', 'dono', 'admin')
  ) then
    return;
  end if;
  raise exception 'staff only' using errcode = '42501';
end;
$$;
revoke all on function private.require_staff() from public, anon, authenticated;

-- Resultados: staff.role = dono OU perfil dono/admin.
create or replace function private.require_owner()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'owner only' using errcode = '42501';
  end if;
  if exists (select 1 from public.staff where user_id = auth.uid() and role = 'dono') then
    return;
  end if;
  if exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('dono', 'admin')
  ) then
    return;
  end if;
  raise exception 'owner only' using errcode = '42501';
end;
$$;
revoke all on function private.require_owner() from public, anon, authenticated;

-- A aba Resultados lê este papel. Admin no perfil aparece mesmo se staff.role for garcom.
create or replace function public.staff_whoami()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_staff_name text;
  v_staff_role text;
  v_profile_name text;
  v_profile_role text;
  v_role text;
begin
  perform private.require_staff();
  select s.name, s.role into v_staff_name, v_staff_role
  from public.staff s where s.user_id = auth.uid();
  select p.display_name, p.role into v_profile_name, v_profile_role
  from public.profiles p where p.id = auth.uid();
  v_role := case
    when v_profile_role = 'admin' then 'admin'
    when v_staff_role = 'dono' or v_profile_role = 'dono' then 'dono'
    else coalesce(v_staff_role, v_profile_role, 'garcom')
  end;
  return jsonb_build_object(
    'name', coalesce(nullif(btrim(v_staff_name), ''), nullif(btrim(v_profile_name), ''), ''),
    'role', v_role
  );
end;
$$;

create or replace function private.require_admin()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  ) then
    raise exception 'admin only' using errcode = '42501';
  end if;
end;
$$;
revoke all on function private.require_admin() from public, anon, authenticated;

create table if not exists public.site_features (
  id boolean primary key default true check (id),
  discovery boolean not null default true,
  favorites boolean not null default true,
  favorites_sync boolean not null default true,
  popularity boolean not null default true,
  spotify boolean not null default true,
  deezer boolean not null default true,
  auth_public boolean not null default true,
  requests boolean not null default true,
  staff_panel boolean not null default true,
  page_evento boolean not null default true,
  page_o_bar boolean not null default true,
  page_cartaz boolean not null default true,
  theme boolean not null default true,
  analytics boolean not null default true,
  request_mode text not null default 'qr' check (request_mode in ('qr', 'remoto')),
  auth_providers text not null default '' check (char_length(auth_providers) <= 80),
  updated_at timestamptz not null default now()
);
insert into public.site_features (id) values (true) on conflict (id) do nothing;

alter table public.site_features enable row level security;
revoke all on public.site_features from anon, authenticated;

create or replace function public.get_site_features()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'discovery', discovery,
    'favorites', favorites,
    'favorites_sync', favorites_sync,
    'popularity', popularity,
    'spotify', spotify,
    'deezer', deezer,
    'auth_public', auth_public,
    'requests', requests,
    'staff_panel', staff_panel,
    'page_evento', page_evento,
    'page_o_bar', page_o_bar,
    'page_cartaz', page_cartaz,
    'theme', theme,
    'analytics', analytics,
    'request_mode', request_mode,
    'auth_providers', auth_providers
  )
  from public.site_features
  where id;
$$;

create or replace function public.set_site_features(
  p_discovery boolean,
  p_favorites boolean,
  p_favorites_sync boolean,
  p_popularity boolean,
  p_spotify boolean,
  p_deezer boolean,
  p_auth_public boolean,
  p_requests boolean,
  p_staff_panel boolean,
  p_page_evento boolean,
  p_page_o_bar boolean,
  p_page_cartaz boolean,
  p_theme boolean,
  p_analytics boolean,
  p_request_mode text,
  p_auth_providers text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mode text := lower(btrim(coalesce(p_request_mode, '')));
  v_raw text := lower(btrim(coalesce(p_auth_providers, '')));
  v_providers text;
begin
  perform private.require_admin();
  if v_mode not in ('qr', 'remoto') then
    raise exception 'invalid request mode' using errcode = '22023';
  end if;
  if v_raw = '' then
    v_providers := '';
  else
    select string_agg(name, ',' order by name) into v_providers
    from (
      select distinct btrim(token) as name
      from regexp_split_to_table(v_raw, ',') as token
      where btrim(token) in ('google', 'facebook', 'apple', 'spotify')
    ) known;
    if v_providers is null or v_providers = '' then
      v_providers := '-';
    end if;
  end if;

  update public.site_features set
    discovery = p_discovery,
    favorites = p_favorites,
    favorites_sync = p_favorites_sync,
    popularity = p_popularity,
    spotify = p_spotify,
    deezer = p_deezer,
    auth_public = p_auth_public,
    requests = p_requests,
    staff_panel = p_staff_panel,
    page_evento = p_page_evento,
    page_o_bar = p_page_o_bar,
    page_cartaz = p_page_cartaz,
    theme = p_theme,
    analytics = p_analytics,
    request_mode = v_mode,
    auth_providers = v_providers,
    updated_at = now()
  where id;
  return public.get_site_features();
end;
$$;

create or replace function public.admin_list_profiles()
returns table (id uuid, display_name text, role text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return query
  select p.id, p.display_name, p.role
  from public.profiles p
  order by lower(p.display_name), p.id;
end;
$$;

create or replace function public.admin_set_profile_role(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  if p_role not in ('cliente', 'garcom', 'dono', 'admin') then
    raise exception 'invalid role' using errcode = '22023';
  end if;
  if p_role is distinct from 'admin'
    and exists (select 1 from public.profiles where id = p_user_id and role = 'admin')
    and (select count(*) from public.profiles where role = 'admin') <= 1 then
    raise exception 'last admin' using errcode = 'P0001', hint = 'ultimo_admin';
  end if;
  update public.profiles set role = p_role where id = p_user_id;
  if not found then
    raise exception 'profile not found' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.get_site_features() from public;
grant execute on function public.get_site_features() to anon, authenticated;

revoke all on function public.set_site_features(boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, text, text) from public, anon;
grant execute on function public.set_site_features(boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean, text, text) to authenticated;

revoke all on function public.admin_list_profiles() from public, anon;
grant execute on function public.admin_list_profiles() to authenticated;

revoke all on function public.admin_set_profile_role(uuid, text) from public, anon;
grant execute on function public.admin_set_profile_role(uuid, text) to authenticated;

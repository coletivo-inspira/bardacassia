-- Console de administração: parâmetros operacionais em tempo real sem deploy,
-- trilha de auditoria em admin_audit_logs, sincronização integrada de papéis/equipe,
-- monitor de pedidos e inspeção segura somente-leitura das tabelas.

alter table public.site_features
  add column if not exists manager_panel boolean not null default true,
  add column if not exists default_theme text not null default 'auto',
  add column if not exists site_notice text not null default '',
  add column if not exists popular_limit integer not null default 40,
  add column if not exists pending_expire_minutes integer not null default 30,
  add column if not exists max_pending_per_user integer not null default 3,
  add column if not exists max_pending_total integer not null default 40,
  add column if not exists write_limit_per_minute integer not null default 120;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'site_features_default_theme_check'
      and conrelid = 'public.site_features'::regclass
  ) then
    alter table public.site_features
      add constraint site_features_default_theme_check
      check (default_theme in ('auto', 'light', 'dark'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'site_features_site_notice_check'
      and conrelid = 'public.site_features'::regclass
  ) then
    alter table public.site_features
      add constraint site_features_site_notice_check
      check (char_length(site_notice) <= 240);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'site_features_popular_limit_check'
      and conrelid = 'public.site_features'::regclass
  ) then
    alter table public.site_features
      add constraint site_features_popular_limit_check
      check (popular_limit between 5 and 100);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'site_features_pending_expire_check'
      and conrelid = 'public.site_features'::regclass
  ) then
    alter table public.site_features
      add constraint site_features_pending_expire_check
      check (pending_expire_minutes between 5 and 240);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'site_features_max_pending_user_check'
      and conrelid = 'public.site_features'::regclass
  ) then
    alter table public.site_features
      add constraint site_features_max_pending_user_check
      check (max_pending_per_user between 1 and 20);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'site_features_max_pending_total_check'
      and conrelid = 'public.site_features'::regclass
  ) then
    alter table public.site_features
      add constraint site_features_max_pending_total_check
      check (max_pending_total between 5 and 500);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'site_features_write_limit_check'
      and conrelid = 'public.site_features'::regclass
  ) then
    alter table public.site_features
      add constraint site_features_write_limit_check
      check (write_limit_per_minute between 20 and 1000);
  end if;
end;
$$;

create table if not exists public.admin_audit_logs (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  actor_id uuid references auth.users(id) on delete set null,
  actor_name text not null default '',
  category text not null check (category in ('config', 'aparencia', 'acesso', 'fila', 'pedido', 'sistema')),
  action text not null,
  target text not null default '',
  details jsonb not null default '{}'::jsonb
);

create index if not exists admin_audit_logs_created_idx
  on public.admin_audit_logs(created_at desc, id desc);
create index if not exists admin_audit_logs_category_idx
  on public.admin_audit_logs(category, created_at desc);

alter table public.admin_audit_logs enable row level security;
revoke all on public.admin_audit_logs from public, anon, authenticated;

create or replace function private.mask_phone(p_phone text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_digits text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
begin
  if v_digits = '' then
    return '';
  end if;
  if char_length(v_digits) > 11 and left(v_digits, 2) = '55' then
    v_digits := substr(v_digits, 3);
  end if;
  if char_length(v_digits) >= 11 then
    return '(' || substr(v_digits, 1, 2) || ') *****-' || right(v_digits, 4);
  end if;
  if char_length(v_digits) = 10 then
    return '(' || substr(v_digits, 1, 2) || ') ****-' || right(v_digits, 4);
  end if;
  if char_length(v_digits) > 4 then
    return '****-' || right(v_digits, 4);
  end if;
  return '****';
end;
$$;
revoke all on function private.mask_phone(text) from public, anon, authenticated;

create or replace function private.log_admin_event(
  p_category text,
  p_action text,
  p_target text default '',
  p_details jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_staff_name text;
  v_profile_name text;
  v_email_name text;
  v_actor_name text := '';
begin
  if v_actor is not null then
    select s.name into v_staff_name from public.staff s where s.user_id = v_actor;
    select p.display_name into v_profile_name from public.profiles p where p.id = v_actor;
    select split_part(coalesce(u.email, ''), '@', 1) into v_email_name from auth.users u where u.id = v_actor;
    v_actor_name := coalesce(
      nullif(btrim(v_staff_name), ''),
      nullif(btrim(v_profile_name), ''),
      nullif(btrim(v_email_name), ''),
      ''
    );
  end if;

  insert into public.admin_audit_logs(actor_id, actor_name, category, action, target, details)
  values (
    v_actor,
    left(v_actor_name, 80),
    p_category,
    left(btrim(coalesce(p_action, 'evento')), 120),
    left(btrim(coalesce(p_target, '')), 120),
    coalesce(p_details, '{}'::jsonb)
  );
end;
$$;
revoke all on function private.log_admin_event(text, text, text, jsonb) from public, anon, authenticated;

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
    'manager_panel', manager_panel,
    'page_evento', page_evento,
    'page_o_bar', page_o_bar,
    'page_cartaz', page_cartaz,
    'theme', theme,
    'analytics', analytics,
    'request_mode', request_mode,
    'auth_providers', auth_providers,
    'palette', coalesce(palette, '{}'::jsonb),
    'default_theme', default_theme,
    'site_notice', site_notice,
    'popular_limit', popular_limit,
    'pending_expire_minutes', pending_expire_minutes,
    'max_pending_per_user', max_pending_per_user,
    'max_pending_total', max_pending_total,
    'write_limit_per_minute', write_limit_per_minute
  )
  from public.site_features
  where id;
$$;

drop function if exists public.set_site_features(
  boolean, boolean, boolean, boolean, boolean, boolean, boolean,
  boolean, boolean, boolean, boolean, boolean, boolean, boolean,
  text, text
);

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
  p_auth_providers text,
  p_manager_panel boolean default null
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
  v_before jsonb;
  v_after jsonb;
  v_changes jsonb;
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

  v_before := public.get_site_features() - 'palette';

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
    manager_panel = coalesce(p_manager_panel, manager_panel),
    page_evento = p_page_evento,
    page_o_bar = p_page_o_bar,
    page_cartaz = p_page_cartaz,
    theme = p_theme,
    analytics = p_analytics,
    request_mode = v_mode,
    auth_providers = v_providers,
    updated_at = now()
  where id;

  v_after := public.get_site_features();
  select coalesce(
    jsonb_object_agg(a.key, jsonb_build_object('de', v_before -> a.key, 'para', a.value)),
    '{}'::jsonb
  ) into v_changes
  from jsonb_each(v_after - 'palette') a
  where (v_before -> a.key) is distinct from a.value;

  perform private.log_admin_event(
    'config',
    'salvar_funcionalidades',
    'site_features',
    jsonb_build_object('request_mode', v_mode, 'changes', v_changes)
  );
  return v_after;
end;
$$;

create or replace function public.admin_set_runtime_params(
  p_default_theme text default null,
  p_site_notice text default null,
  p_popular_limit integer default null,
  p_pending_expire_minutes integer default null,
  p_max_pending_per_user integer default null,
  p_max_pending_total integer default null,
  p_write_limit_per_minute integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_theme text := case when p_default_theme is null then null else lower(btrim(p_default_theme)) end;
  v_notice text := case when p_site_notice is null then null else btrim(regexp_replace(p_site_notice, '\s+', ' ', 'g')) end;
  v_before jsonb;
  v_after jsonb;
  v_changes jsonb;
  v_only_theme boolean;
begin
  perform private.require_admin();

  if v_theme is not null and v_theme not in ('auto', 'light', 'dark') then
    raise exception 'invalid default theme' using errcode = '22023';
  end if;
  if v_notice is not null and char_length(v_notice) > 240 then
    raise exception 'site notice too long' using errcode = '22023';
  end if;
  if p_popular_limit is not null and (p_popular_limit < 5 or p_popular_limit > 100) then
    raise exception 'invalid popular limit' using errcode = '22023';
  end if;
  if p_pending_expire_minutes is not null and (p_pending_expire_minutes < 5 or p_pending_expire_minutes > 240) then
    raise exception 'invalid pending expire minutes' using errcode = '22023';
  end if;
  if p_max_pending_per_user is not null and (p_max_pending_per_user < 1 or p_max_pending_per_user > 20) then
    raise exception 'invalid max pending per user' using errcode = '22023';
  end if;
  if p_max_pending_total is not null and (p_max_pending_total < 5 or p_max_pending_total > 500) then
    raise exception 'invalid max pending total' using errcode = '22023';
  end if;
  if p_write_limit_per_minute is not null and (p_write_limit_per_minute < 20 or p_write_limit_per_minute > 1000) then
    raise exception 'invalid write limit' using errcode = '22023';
  end if;

  v_before := public.get_site_features() - 'palette';

  update public.site_features set
    default_theme = coalesce(v_theme, default_theme),
    site_notice = coalesce(v_notice, site_notice),
    popular_limit = coalesce(p_popular_limit, popular_limit),
    pending_expire_minutes = coalesce(p_pending_expire_minutes, pending_expire_minutes),
    max_pending_per_user = coalesce(p_max_pending_per_user, max_pending_per_user),
    max_pending_total = coalesce(p_max_pending_total, max_pending_total),
    write_limit_per_minute = coalesce(p_write_limit_per_minute, write_limit_per_minute),
    updated_at = now()
  where id;

  v_after := public.get_site_features();
  select coalesce(
    jsonb_object_agg(a.key, jsonb_build_object('de', v_before -> a.key, 'para', a.value)),
    '{}'::jsonb
  ) into v_changes
  from jsonb_each(v_after - 'palette') a
  where (v_before -> a.key) is distinct from a.value;

  v_only_theme := v_theme is not null
    and v_notice is null
    and p_popular_limit is null
    and p_pending_expire_minutes is null
    and p_max_pending_per_user is null
    and p_max_pending_total is null
    and p_write_limit_per_minute is null;

  perform private.log_admin_event(
    case when v_only_theme then 'aparencia' else 'config' end,
    case when v_only_theme then 'alterar_tema_padrao' else 'salvar_parametros' end,
    'site_features',
    jsonb_build_object('changes', v_changes)
  );
  return v_after;
end;
$$;

create or replace function public.set_site_palette(p_palette jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clean jsonb := '{}'::jsonb;
  v_theme text;
  v_token text;
  v_value text;
  v_theme_obj jsonb;
  v_clean_theme jsonb;
begin
  perform private.require_admin();
  if p_palette is null or jsonb_typeof(p_palette) <> 'object' then
    raise exception 'invalid palette' using errcode = '22023';
  end if;

  for v_theme in select jsonb_object_keys(p_palette)
  loop
    if v_theme not in ('dark', 'light') then
      continue;
    end if;
    if jsonb_typeof(p_palette -> v_theme) <> 'object' then
      raise exception 'invalid palette' using errcode = '22023';
    end if;
    v_theme_obj := p_palette -> v_theme;
    v_clean_theme := '{}'::jsonb;
    for v_token in select jsonb_object_keys(v_theme_obj)
    loop
      if v_token not in ('bg', 'bg-elev', 'bg-soft', 'text', 'muted', 'amber', 'sky', 'coral', 'swipe-like') then
        continue;
      end if;
      if jsonb_typeof(v_theme_obj -> v_token) <> 'string' then
        raise exception 'invalid palette' using errcode = '22023';
      end if;
      v_value := btrim(v_theme_obj ->> v_token);
      if v_value !~ '^#[0-9a-fA-F]{6}$' then
        raise exception 'invalid palette' using errcode = '22023';
      end if;
      v_clean_theme := v_clean_theme || jsonb_build_object(v_token, lower(v_value));
    end loop;
    if v_clean_theme <> '{}'::jsonb then
      v_clean := v_clean || jsonb_build_object(v_theme, v_clean_theme);
    end if;
  end loop;

  update public.site_features
  set palette = v_clean,
      updated_at = now()
  where id;

  perform private.log_admin_event(
    'aparencia',
    'salvar_paleta',
    'site_features.palette',
    jsonb_build_object(
      'reset', v_clean = '{}'::jsonb,
      'palette', v_clean
    )
  );
  return public.get_site_features();
end;
$$;

-- Mantém suporte às contas autenticadas e sessões anônimas (migração 002),
-- lendo write_limit_per_minute em tempo real de site_features.
create or replace function private.consume_write()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_window timestamptz := date_trunc('minute', now());
  v_limit integer;
  v_count integer;
begin
  if v_user is null then
    raise exception 'session required' using errcode = '42501';
  end if;
  select coalesce(write_limit_per_minute, 120) into v_limit
  from public.site_features where id;
  v_limit := least(greatest(coalesce(v_limit, 120), 20), 1000);

  insert into private.write_limits(user_id, window_start, writes)
  values (v_user, v_window, 1)
  on conflict (user_id, window_start)
  do update set writes = private.write_limits.writes + 1
  returning writes into v_count;

  if v_count > v_limit then
    raise exception 'write limit exceeded' using errcode = 'P0001';
  end if;
end;
$$;
revoke all on function private.consume_write() from public, anon, authenticated;

create or replace function public.get_popular_songs(p_limit integer default null)
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
  limit least(
    greatest(
      coalesce(p_limit, (select popular_limit from public.site_features where id), 40),
      1
    ),
    100
  );
$$;

create or replace function public.create_song_request(
  p_code text,
  p_name text,
  p_phone text,
  p_night_code text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_night_code text := upper(regexp_replace(coalesce(p_night_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_song public.catalog_codes%rowtype;
  v_settings public.bar_settings%rowtype;
  v_expire_mins integer := 30;
  v_max_per_user integer := 3;
  v_max_total integer := 40;
  v_id bigint;
begin
  perform private.consume_write();

  select
    coalesce(pending_expire_minutes, 30),
    coalesce(max_pending_per_user, 3),
    coalesce(max_pending_total, 40)
  into v_expire_mins, v_max_per_user, v_max_total
  from public.site_features
  where id;

  v_expire_mins := coalesce(v_expire_mins, 30);
  v_max_per_user := coalesce(v_max_per_user, 3);
  v_max_total := coalesce(v_max_total, 40);

  update public.song_requests
  set status = 'cancelado', cancelled_at = now()
  where status = 'aguardando_pagamento'
    and created_at < now() - make_interval(mins => v_expire_mins);

  select * into v_settings from public.bar_settings;
  if not v_settings.queue_open then
    raise exception 'queue closed' using errcode = 'P0001', hint = 'fila_fechada';
  end if;
  if v_settings.require_night_code and v_settings.night_code <> '' and v_night_code <> v_settings.night_code then
    raise exception 'wrong night code' using errcode = '22023', hint = 'codigo_noite_invalido';
  end if;
  select * into v_song from public.catalog_codes where code = p_code and active;
  if not found then
    raise exception 'unknown song code' using errcode = '22023', hint = 'codigo_invalido';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 60 then
    raise exception 'invalid name' using errcode = '22023', hint = 'nome_invalido';
  end if;
  if v_phone !~ '^[0-9]{10,13}$' then
    raise exception 'invalid phone' using errcode = '22023', hint = 'telefone_invalido';
  end if;
  if (select count(*) from public.song_requests
      where user_id = auth.uid() and status = 'aguardando_pagamento') >= v_max_per_user then
    raise exception 'too many pending requests' using errcode = 'P0001', hint = 'muitos_pendentes';
  end if;
  if (select count(*) from public.song_requests where status = 'aguardando_pagamento') >= v_max_total then
    raise exception 'too many pending overall' using errcode = 'P0001', hint = 'pendentes_lotado';
  end if;

  insert into public.song_requests(user_id, code, title, artist, customer_name, customer_phone)
  values (auth.uid(), v_song.code, v_song.title, v_song.artist, v_name, v_phone)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'status', 'aguardando_pagamento');
end;
$$;

create or replace function public.staff_list_requests(p_search text default '')
returns table(id bigint, code text, title text, artist text, customer_name text,
  customer_phone text, status text, created_at timestamptz, paid_at timestamptz, staff_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_search text := '%' || lower(btrim(coalesce(p_search, ''))) || '%';
  v_expire_mins integer;
begin
  perform private.require_staff();
  select coalesce(pending_expire_minutes, 30) into v_expire_mins from public.site_features where id;
  v_expire_mins := coalesce(v_expire_mins, 30);

  return query
  select r.id, r.code, r.title, r.artist, r.customer_name, r.customer_phone, r.status, r.created_at, r.paid_at,
    s.name as staff_name
  from public.song_requests r
  left join public.staff s on s.user_id = r.created_by
  where (r.status = 'na_fila' or (r.status = 'aguardando_pagamento' and r.created_at > now() - make_interval(mins => v_expire_mins)))
    and r.created_at > now() - interval '18 hours'
    and (lower(r.customer_name) like v_search or coalesce(r.customer_phone, '') like v_search or r.code like v_search)
  order by case r.status when 'na_fila' then 0 else 1 end, r.paid_at nulls last, r.created_at, r.id
  limit 200;
end;
$$;

-- Instrumentação das RPCs de fila, rodada e pedidos para registrar auditoria.
create or replace function public.staff_update_settings(
  p_queue_open boolean,
  p_round_limit integer,
  p_next_round_at timestamptz,
  p_message text,
  p_new_round boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_open boolean;
  v_limit integer;
  v_msg text;
begin
  perform private.require_staff();
  update public.bar_settings set
    queue_open = coalesce(p_queue_open, queue_open),
    round_limit = least(greatest(coalesce(p_round_limit, round_limit), 0), 200),
    next_round_at = p_next_round_at,
    message = left(coalesce(p_message, ''), 200),
    round_started_at = case when coalesce(p_new_round, false) then now() else round_started_at end,
    updated_at = now()
  returning queue_open, round_limit, message into v_open, v_limit, v_msg;

  perform private.log_admin_event(
    'fila',
    case when coalesce(p_new_round, false) then 'nova_rodada' else 'atualizar_rodada' end,
    'bar_settings',
    jsonb_build_object(
      'queue_open', v_open,
      'round_limit', v_limit,
      'next_round_at', p_next_round_at,
      'message', v_msg,
      'new_round', coalesce(p_new_round, false)
    )
  );
  return private.round_state();
end;
$$;

create or replace function public.staff_set_night_code(p_required boolean, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := left(upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')), 12);
begin
  perform private.require_staff();
  if coalesce(p_required, false) and v_code = '' then
    raise exception 'night code required' using errcode = '22023', hint = 'codigo_noite_vazio';
  end if;
  update public.bar_settings
  set require_night_code = coalesce(p_required, false),
      night_code = v_code,
      updated_at = now();

  perform private.log_admin_event(
    'fila',
    'configurar_codigo_noite',
    'bar_settings',
    jsonb_build_object(
      'required', coalesce(p_required, false),
      'has_code', v_code <> ''
    )
  );
  return public.staff_get_night_code();
end;
$$;

create or replace function public.staff_add_request(p_code text, p_name text, p_ticket uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := left(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), 60);
  v_song public.catalog_codes%rowtype;
  v_existing public.song_requests%rowtype;
  v_limit integer;
  v_id bigint;
begin
  perform private.require_staff();
  if p_ticket is null then
    raise exception 'ticket required' using errcode = '22023', hint = 'qr_invalido';
  end if;
  select * into v_existing from public.song_requests where ticket = p_ticket;
  if found then
    return private.round_state() || jsonb_build_object('id', v_existing.id, 'status', v_existing.status, 'duplicate', true);
  end if;
  select * into v_song from public.catalog_codes where code = p_code and active;
  if not found then
    raise exception 'unknown song code' using errcode = '22023', hint = 'codigo_invalido';
  end if;
  if char_length(v_name) < 2 then v_name := 'Cliente'; end if;
  insert into public.song_requests(user_id, code, title, artist, customer_name, customer_phone,
    status, paid_at, ticket, created_by)
  values (null, v_song.code, v_song.title, v_song.artist, v_name, null,
    'na_fila', now(), p_ticket, auth.uid())
  on conflict (ticket) do nothing
  returning id into v_id;
  if v_id is null then
    select * into v_existing from public.song_requests where ticket = p_ticket;
    return private.round_state() || jsonb_build_object('id', v_existing.id, 'status', v_existing.status, 'duplicate', true);
  end if;
  select round_limit into v_limit from public.bar_settings;
  if v_limit > 0 and private.round_used() >= v_limit then
    update public.bar_settings set queue_open = false, updated_at = now();
  end if;

  perform private.log_admin_event(
    'pedido',
    'adicionar_pedido_qr',
    '#' || v_id::text || ' · ' || v_song.code,
    jsonb_build_object(
      'request_id', v_id,
      'code', v_song.code,
      'title', v_song.title,
      'customer_name', v_name
    )
  );
  return private.round_state() || jsonb_build_object('id', v_id, 'status', 'na_fila', 'duplicate', false);
end;
$$;

create or replace function public.staff_mark_paid(p_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer;
  v_req public.song_requests%rowtype;
begin
  perform private.require_staff();
  update public.song_requests
  set status = 'na_fila', paid_at = now()
  where id = p_id and status = 'aguardando_pagamento'
  returning * into v_req;
  if not found then
    raise exception 'request not pending' using errcode = '22023', hint = 'pedido_nao_pendente';
  end if;
  select round_limit into v_limit from public.bar_settings;
  if v_limit > 0 and private.round_used() >= v_limit then
    update public.bar_settings set queue_open = false, updated_at = now();
  end if;

  perform private.log_admin_event(
    'pedido',
    'confirmar_pagamento',
    '#' || p_id::text || ' · ' || v_req.code,
    jsonb_build_object(
      'request_id', p_id,
      'code', v_req.code,
      'title', v_req.title,
      'customer_name', v_req.customer_name
    )
  );
  return private.round_state();
end;
$$;

create or replace function public.staff_mark_played(p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.song_requests%rowtype;
begin
  perform private.require_staff();
  update public.song_requests
  set status = 'tocou', played_at = now()
  where id = p_id and status = 'na_fila'
  returning * into v_req;
  if not found then
    raise exception 'request not queued' using errcode = '22023', hint = 'pedido_fora_da_fila';
  end if;

  perform private.log_admin_event(
    'pedido',
    'marcar_tocou',
    '#' || p_id::text || ' · ' || v_req.code,
    jsonb_build_object(
      'request_id', p_id,
      'code', v_req.code,
      'title', v_req.title,
      'customer_name', v_req.customer_name
    )
  );
end;
$$;

create or replace function public.staff_cancel(p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prev_status text;
  v_req public.song_requests%rowtype;
begin
  perform private.require_staff();
  select status into v_prev_status
  from public.song_requests
  where id = p_id and status in ('aguardando_pagamento', 'na_fila');
  if not found then
    raise exception 'request not active' using errcode = '22023', hint = 'pedido_inativo';
  end if;

  update public.song_requests
  set status = 'cancelado', cancelled_at = now()
  where id = p_id and status in ('aguardando_pagamento', 'na_fila')
  returning * into v_req;
  if not found then
    raise exception 'request not active' using errcode = '22023', hint = 'pedido_inativo';
  end if;

  perform private.log_admin_event(
    'pedido',
    'cancelar_pedido',
    '#' || p_id::text || ' · ' || v_req.code,
    jsonb_build_object(
      'request_id', p_id,
      'code', v_req.code,
      'title', v_req.title,
      'customer_name', v_req.customer_name,
      'previous_status', v_prev_status
    )
  );
end;
$$;

-- Gestão integrada de acessos e equipe (profiles.role + public.staff).
create or replace function public.admin_update_user_access(
  p_user_id uuid,
  p_role text,
  p_staff_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := lower(btrim(coalesce(p_role, '')));
  v_old_role text;
  v_display_name text;
  v_email text;
  v_existing_staff_name text;
  v_staff_role text := null;
  v_resolved_name text := '';
begin
  perform private.require_admin();
  if p_user_id is null or v_role not in ('cliente', 'garcom', 'dono', 'admin') then
    raise exception 'invalid role' using errcode = '22023';
  end if;

  select p.role, p.display_name, u.email, s.name
  into v_old_role, v_display_name, v_email, v_existing_staff_name
  from public.profiles p
  left join auth.users u on u.id = p.id
  left join public.staff s on s.user_id = p.id
  where p.id = p_user_id;

  if not found then
    raise exception 'profile not found' using errcode = '22023';
  end if;

  if v_role is distinct from 'admin'
    and v_old_role = 'admin'
    and (select count(*) from public.profiles where role = 'admin') <= 1 then
    raise exception 'last admin' using errcode = 'P0001', hint = 'ultimo_admin';
  end if;

  update public.profiles set role = v_role where id = p_user_id;

  if v_role in ('garcom', 'dono', 'admin') then
    v_staff_role := case when v_role in ('dono', 'admin') then 'dono' else 'garcom' end;
    v_resolved_name := left(
      coalesce(
        nullif(btrim(p_staff_name), ''),
        nullif(btrim(v_existing_staff_name), ''),
        nullif(btrim(v_display_name), ''),
        nullif(split_part(coalesce(v_email, ''), '@', 1), ''),
        'Equipe'
      ),
      60
    );
    insert into public.staff(user_id, name, role)
    values (p_user_id, v_resolved_name, v_staff_role)
    on conflict (user_id) do update
      set name = excluded.name,
          role = excluded.role;
  else
    delete from public.staff where user_id = p_user_id;
  end if;

  perform private.log_admin_event(
    'acesso',
    'atualizar_acesso',
    coalesce(nullif(btrim(v_display_name), ''), nullif(btrim(v_email), ''), p_user_id::text),
    jsonb_build_object(
      'user_id', p_user_id,
      'old_role', v_old_role,
      'new_role', v_role,
      'staff_name', v_resolved_name,
      'staff_role', v_staff_role
    )
  );

  return jsonb_build_object(
    'id', p_user_id,
    'role', v_role,
    'staff_name', v_resolved_name,
    'staff_role', v_staff_role
  );
end;
$$;

create or replace function public.admin_set_profile_role(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.admin_update_user_access(p_user_id, p_role, null);
end;
$$;

-- RPCs exclusivas de administrador para visão do banco, contas, requests, tabelas e logs.
create or replace function public.admin_db_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  perform private.require_admin();

  select jsonb_build_object(
    'catalog_codes', (
      select jsonb_build_object(
        'total', count(*),
        'active', count(*) filter (where active)
      ) from public.catalog_codes
    ),
    'song_interactions', (
      select jsonb_build_object(
        'total', count(*),
        'opens', count(*) filter (where first_open_at is not null),
        'favorites', count(*) filter (where favorited)
      ) from public.song_interactions
    ),
    'song_requests', (
      select jsonb_build_object(
        'total', count(*),
        'aguardando_pagamento', count(*) filter (where status = 'aguardando_pagamento'),
        'na_fila', count(*) filter (where status = 'na_fila'),
        'tocou', count(*) filter (where status = 'tocou'),
        'cancelado', count(*) filter (where status = 'cancelado')
      ) from public.song_requests
    ),
    'profiles', (
      select jsonb_build_object(
        'total', count(*),
        'cliente', count(*) filter (where role = 'cliente'),
        'garcom', count(*) filter (where role = 'garcom'),
        'dono', count(*) filter (where role = 'dono'),
        'admin', count(*) filter (where role = 'admin')
      ) from public.profiles
    ),
    'staff', (
      select jsonb_build_object('total', count(*)) from public.staff
    ),
    'admin_audit_logs', (
      select jsonb_build_object(
        'total', count(*),
        'last_24h', count(*) filter (where created_at >= now() - interval '24 hours')
      ) from public.admin_audit_logs
    ),
    'write_limits', (
      select jsonb_build_object(
        'active_10m', count(*),
        'writes_10m', coalesce(sum(writes), 0)
      ) from private.write_limits
      where window_start >= now() - interval '10 minutes'
    ),
    'bar_settings', (
      select jsonb_build_object(
        'queue_open', s.queue_open,
        'round_limit', s.round_limit,
        'round_used', private.round_used(),
        'round_started_at', s.round_started_at,
        'next_round_at', s.next_round_at,
        'message', s.message,
        'require_night_code', s.require_night_code,
        'night_code_required', s.require_night_code and s.night_code <> '',
        'night_code', s.night_code,
        'updated_at', s.updated_at
      ) from public.bar_settings s limit 1
    )
  ) into v_result;

  return v_result;
end;
$$;

create or replace function public.admin_list_users(
  p_search text default '',
  p_role text default '',
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_search text := lower(btrim(coalesce(p_search, '')));
  v_role text := lower(btrim(coalesce(p_role, '')));
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_counts jsonb;
  v_total bigint;
  v_rows jsonb;
begin
  perform private.require_admin();
  if v_role <> '' and v_role not in ('cliente', 'garcom', 'dono', 'admin') then
    raise exception 'invalid role filter' using errcode = '22023';
  end if;

  select jsonb_build_object(
    'all', count(*),
    'admin', count(*) filter (where role = 'admin'),
    'dono', count(*) filter (where role = 'dono'),
    'garcom', count(*) filter (where role = 'garcom'),
    'cliente', count(*) filter (where role = 'cliente')
  ) into v_counts
  from public.profiles;

  with filtered as (
    select
      p.id,
      p.display_name,
      coalesce(u.email, '') as email,
      p.role,
      coalesce(s.name, '') as staff_name,
      s.role as staff_role,
      p.avatar_url,
      p.data_consent_at,
      p.data_consent_version,
      coalesce(p.created_at, u.created_at) as created_at,
      u.last_sign_in_at
    from public.profiles p
    left join auth.users u on u.id = p.id
    left join public.staff s on s.user_id = p.id
    where (v_role = '' or p.role = v_role)
      and (
        v_search = ''
        or lower(p.display_name) like '%' || v_search || '%'
        or lower(coalesce(u.email, '')) like '%' || v_search || '%'
        or lower(coalesce(s.name, '')) like '%' || v_search || '%'
        or lower(p.id::text) like '%' || v_search || '%'
      )
  )
  select
    (select count(*) from filtered),
    coalesce((
      select jsonb_agg(to_jsonb(page))
      from (
        select *
        from filtered
        order by
          case role
            when 'admin' then 0
            when 'dono' then 1
            when 'garcom' then 2
            else 3
          end,
          created_at desc nulls last,
          id
        limit v_limit offset v_offset
      ) page
    ), '[]'::jsonb)
  into v_total, v_rows;

  return jsonb_build_object(
    'total', coalesce(v_total, 0),
    'counts_by_role', coalesce(v_counts, '{}'::jsonb),
    'rows', v_rows
  );
end;
$$;

create or replace function public.admin_list_requests(
  p_status text default '',
  p_search text default '',
  p_origin text default '',
  p_limit integer default 40,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_status text := lower(btrim(coalesce(p_status, '')));
  v_search text := lower(btrim(coalesce(p_search, '')));
  v_origin text := lower(btrim(coalesce(p_origin, '')));
  v_limit integer := least(greatest(coalesce(p_limit, 40), 1), 200);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_total bigint;
  v_rows jsonb;
begin
  perform private.require_admin();
  if v_status <> '' and v_status not in ('aguardando_pagamento', 'na_fila', 'tocou', 'cancelado') then
    raise exception 'invalid request status' using errcode = '22023';
  end if;
  if v_origin <> '' and v_origin not in ('qr', 'remoto') then
    raise exception 'invalid request origin' using errcode = '22023';
  end if;

  with filtered as (
    select
      r.id,
      r.code,
      r.title,
      r.artist,
      r.customer_name,
      private.mask_phone(r.customer_phone) as customer_phone_masked,
      r.status,
      case when r.ticket is not null then 'qr' else 'remoto' end as origin,
      coalesce(s.name, '') as staff_name,
      coalesce(p.display_name, '') as profile_name,
      r.created_at,
      r.paid_at,
      r.played_at,
      r.cancelled_at
    from public.song_requests r
    left join public.staff s on s.user_id = r.created_by
    left join public.profiles p on p.id = r.user_id
    where (v_status = '' or r.status = v_status)
      and (
        v_origin = ''
        or (v_origin = 'qr' and r.ticket is not null)
        or (v_origin = 'remoto' and r.ticket is null)
      )
      and (
        v_search = ''
        or lower(r.code) like '%' || v_search || '%'
        or lower(r.title) like '%' || v_search || '%'
        or lower(r.artist) like '%' || v_search || '%'
        or lower(r.customer_name) like '%' || v_search || '%'
        or r.id::text = v_search
      )
  )
  select
    (select count(*) from filtered),
    coalesce((
      select jsonb_agg(to_jsonb(page))
      from (
        select *
        from filtered
        order by created_at desc, id desc
        limit v_limit offset v_offset
      ) page
    ), '[]'::jsonb)
  into v_total, v_rows;

  return jsonb_build_object(
    'total', coalesce(v_total, 0),
    'rows', v_rows
  );
end;
$$;

create or replace function public.admin_inspect_table(
  p_table text,
  p_search text default '',
  p_limit integer default 30,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_table text := lower(btrim(coalesce(p_table, '')));
  v_search text := lower(btrim(coalesce(p_search, '')));
  v_limit integer := least(greatest(coalesce(p_limit, 30), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_total bigint := 0;
  v_columns jsonb := '[]'::jsonb;
  v_rows jsonb := '[]'::jsonb;
begin
  perform private.require_admin();

  case v_table
    when 'song_requests' then
      v_columns := jsonb_build_array(
        'id', 'code', 'title', 'artist', 'customer_name', 'customer_phone',
        'status', 'origin', 'created_at', 'paid_at', 'played_at', 'cancelled_at'
      );
      with q as (
        select
          r.id,
          r.code,
          r.title,
          r.artist,
          r.customer_name,
          private.mask_phone(r.customer_phone) as customer_phone,
          r.status,
          case when r.ticket is not null then 'qr' else 'remoto' end as origin,
          r.created_at,
          r.paid_at,
          r.played_at,
          r.cancelled_at
        from public.song_requests r
        where v_search = ''
          or lower(r.code) like '%' || v_search || '%'
          or lower(r.title) like '%' || v_search || '%'
          or lower(r.artist) like '%' || v_search || '%'
          or lower(r.customer_name) like '%' || v_search || '%'
          or lower(r.status) like '%' || v_search || '%'
      )
      select
        (select count(*) from q),
        coalesce((select jsonb_agg(to_jsonb(p)) from (select * from q order by created_at desc, id desc limit v_limit offset v_offset) p), '[]'::jsonb)
      into v_total, v_rows;

    when 'song_interactions' then
      v_columns := jsonb_build_array(
        'user_id', 'code', 'title', 'artist', 'favorited', 'first_open_at', 'updated_at'
      );
      with q as (
        select
          i.user_id,
          i.code,
          coalesce(c.title, '') as title,
          coalesce(c.artist, '') as artist,
          i.favorited,
          i.first_open_at,
          i.updated_at
        from public.song_interactions i
        left join public.catalog_codes c on c.code = i.code
        where v_search = ''
          or lower(i.code) like '%' || v_search || '%'
          or lower(coalesce(c.title, '')) like '%' || v_search || '%'
          or lower(coalesce(c.artist, '')) like '%' || v_search || '%'
          or lower(i.user_id::text) like '%' || v_search || '%'
      )
      select
        (select count(*) from q),
        coalesce((select jsonb_agg(to_jsonb(p)) from (select * from q order by updated_at desc nulls last, code asc limit v_limit offset v_offset) p), '[]'::jsonb)
      into v_total, v_rows;

    when 'profiles' then
      v_columns := jsonb_build_array(
        'id', 'display_name', 'role', 'birth_date', 'data_consent_version',
        'data_consent_at', 'created_at', 'updated_at'
      );
      with q as (
        select
          p.id,
          p.display_name,
          p.role,
          p.birth_date,
          p.data_consent_version,
          p.data_consent_at,
          p.created_at,
          p.updated_at
        from public.profiles p
        where v_search = ''
          or lower(p.display_name) like '%' || v_search || '%'
          or lower(p.role) like '%' || v_search || '%'
          or lower(p.id::text) like '%' || v_search || '%'
      )
      select
        (select count(*) from q),
        coalesce((select jsonb_agg(to_jsonb(p)) from (select * from q order by created_at desc, id limit v_limit offset v_offset) p), '[]'::jsonb)
      into v_total, v_rows;

    when 'staff' then
      v_columns := jsonb_build_array('user_id', 'name', 'role', 'created_at');
      with q as (
        select s.user_id, s.name, s.role, s.created_at
        from public.staff s
        where v_search = ''
          or lower(s.name) like '%' || v_search || '%'
          or lower(s.role) like '%' || v_search || '%'
          or lower(s.user_id::text) like '%' || v_search || '%'
      )
      select
        (select count(*) from q),
        coalesce((select jsonb_agg(to_jsonb(p)) from (select * from q order by created_at desc, user_id limit v_limit offset v_offset) p), '[]'::jsonb)
      into v_total, v_rows;

    when 'catalog_codes' then
      v_columns := jsonb_build_array('code', 'title', 'artist', 'active', 'updated_at');
      with q as (
        select c.code, c.title, c.artist, c.active, c.updated_at
        from public.catalog_codes c
        where v_search = ''
          or lower(c.code) like '%' || v_search || '%'
          or lower(c.title) like '%' || v_search || '%'
          or lower(c.artist) like '%' || v_search || '%'
      )
      select
        (select count(*) from q),
        coalesce((select jsonb_agg(to_jsonb(p)) from (select * from q order by active desc, title asc, code asc limit v_limit offset v_offset) p), '[]'::jsonb)
      into v_total, v_rows;

    when 'bar_settings' then
      v_columns := jsonb_build_array(
        'queue_open', 'round_limit', 'round_started_at', 'next_round_at',
        'message', 'require_night_code', 'night_code', 'updated_at'
      );
      with q as (
        select
          b.queue_open,
          b.round_limit,
          b.round_started_at,
          b.next_round_at,
          b.message,
          b.require_night_code,
          b.night_code,
          b.updated_at
        from public.bar_settings b
        where v_search = ''
          or lower(b.message) like '%' || v_search || '%'
          or lower(b.night_code) like '%' || v_search || '%'
      )
      select
        (select count(*) from q),
        coalesce((select jsonb_agg(to_jsonb(p)) from (select * from q limit v_limit offset v_offset) p), '[]'::jsonb)
      into v_total, v_rows;

    when 'site_features' then
      v_columns := jsonb_build_array(
        'request_mode', 'default_theme', 'site_notice', 'popular_limit',
        'pending_expire_minutes', 'max_pending_per_user', 'max_pending_total',
        'write_limit_per_minute', 'discovery', 'favorites', 'favorites_sync',
        'popularity', 'spotify', 'deezer', 'auth_public', 'requests',
        'staff_panel', 'manager_panel', 'page_evento', 'page_o_bar',
        'page_cartaz', 'theme', 'analytics', 'auth_providers', 'updated_at'
      );
      with q as (
        select
          f.request_mode,
          f.default_theme,
          f.site_notice,
          f.popular_limit,
          f.pending_expire_minutes,
          f.max_pending_per_user,
          f.max_pending_total,
          f.write_limit_per_minute,
          f.discovery,
          f.favorites,
          f.favorites_sync,
          f.popularity,
          f.spotify,
          f.deezer,
          f.auth_public,
          f.requests,
          f.staff_panel,
          f.manager_panel,
          f.page_evento,
          f.page_o_bar,
          f.page_cartaz,
          f.theme,
          f.analytics,
          f.auth_providers,
          f.updated_at
        from public.site_features f
        where f.id
      )
      select
        (select count(*) from q),
        coalesce((select jsonb_agg(to_jsonb(p)) from (select * from q limit v_limit offset v_offset) p), '[]'::jsonb)
      into v_total, v_rows;

    when 'write_limits' then
      v_columns := jsonb_build_array('user_id', 'window_start', 'writes');
      with q as (
        select w.user_id, w.window_start, w.writes
        from private.write_limits w
        where v_search = ''
          or lower(w.user_id::text) like '%' || v_search || '%'
      )
      select
        (select count(*) from q),
        coalesce((select jsonb_agg(to_jsonb(p)) from (select * from q order by window_start desc, writes desc limit v_limit offset v_offset) p), '[]'::jsonb)
      into v_total, v_rows;

    when 'admin_audit_logs' then
      v_columns := jsonb_build_array(
        'id', 'created_at', 'category', 'action', 'actor_name', 'target', 'details'
      );
      with q as (
        select l.id, l.created_at, l.category, l.action, l.actor_name, l.target, l.details
        from public.admin_audit_logs l
        where v_search = ''
          or lower(l.category) like '%' || v_search || '%'
          or lower(l.action) like '%' || v_search || '%'
          or lower(l.actor_name) like '%' || v_search || '%'
          or lower(l.target) like '%' || v_search || '%'
      )
      select
        (select count(*) from q),
        coalesce((select jsonb_agg(to_jsonb(p)) from (select * from q order by created_at desc, id desc limit v_limit offset v_offset) p), '[]'::jsonb)
      into v_total, v_rows;

    else
      raise exception 'invalid table' using errcode = '22023';
  end case;

  return jsonb_build_object(
    'table', v_table,
    'total', coalesce(v_total, 0),
    'columns', v_columns,
    'rows', v_rows
  );
end;
$$;

create or replace function public.admin_list_audit_logs(
  p_category text default '',
  p_search text default '',
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_category text := lower(btrim(coalesce(p_category, '')));
  v_search text := lower(btrim(coalesce(p_search, '')));
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_total bigint;
  v_rows jsonb;
begin
  perform private.require_admin();
  if v_category <> '' and v_category not in ('config', 'aparencia', 'acesso', 'fila', 'pedido', 'sistema') then
    raise exception 'invalid audit category' using errcode = '22023';
  end if;

  with filtered as (
    select
      l.id,
      l.created_at,
      l.actor_id,
      l.actor_name,
      l.category,
      l.action,
      l.target,
      l.details
    from public.admin_audit_logs l
    where (v_category = '' or l.category = v_category)
      and (
        v_search = ''
        or lower(l.action) like '%' || v_search || '%'
        or lower(l.actor_name) like '%' || v_search || '%'
        or lower(l.target) like '%' || v_search || '%'
        or lower(l.category) like '%' || v_search || '%'
        or lower(l.details::text) like '%' || v_search || '%'
      )
  )
  select
    (select count(*) from filtered),
    coalesce((
      select jsonb_agg(to_jsonb(page))
      from (
        select *
        from filtered
        order by created_at desc, id desc
        limit v_limit offset v_offset
      ) page
    ), '[]'::jsonb)
  into v_total, v_rows;

  return jsonb_build_object(
    'total', coalesce(v_total, 0),
    'rows', v_rows
  );
end;
$$;

revoke all on function public.get_site_features() from public;
grant execute on function public.get_site_features() to anon, authenticated;

revoke all on function public.set_site_features(
  boolean, boolean, boolean, boolean, boolean, boolean, boolean,
  boolean, boolean, boolean, boolean, boolean, boolean, boolean,
  text, text, boolean
) from public, anon;
grant execute on function public.set_site_features(
  boolean, boolean, boolean, boolean, boolean, boolean, boolean,
  boolean, boolean, boolean, boolean, boolean, boolean, boolean,
  text, text, boolean
) to authenticated;

revoke all on function public.admin_set_runtime_params(
  text, text, integer, integer, integer, integer, integer
) from public, anon;
grant execute on function public.admin_set_runtime_params(
  text, text, integer, integer, integer, integer, integer
) to authenticated;

revoke all on function public.set_site_palette(jsonb) from public, anon;
grant execute on function public.set_site_palette(jsonb) to authenticated;

revoke all on function public.get_popular_songs(integer) from public, anon;
grant execute on function public.get_popular_songs(integer) to authenticated;

revoke all on function public.create_song_request(text, text, text, text) from public, anon;
grant execute on function public.create_song_request(text, text, text, text) to authenticated;

revoke all on function public.staff_list_requests(text) from public, anon;
grant execute on function public.staff_list_requests(text) to authenticated;

revoke all on function public.staff_update_settings(boolean, integer, timestamptz, text, boolean) from public, anon;
grant execute on function public.staff_update_settings(boolean, integer, timestamptz, text, boolean) to authenticated;

revoke all on function public.staff_set_night_code(boolean, text) from public, anon;
grant execute on function public.staff_set_night_code(boolean, text) to authenticated;

revoke all on function public.staff_add_request(text, text, uuid) from public, anon;
grant execute on function public.staff_add_request(text, text, uuid) to authenticated;

revoke all on function public.staff_mark_paid(bigint) from public, anon;
grant execute on function public.staff_mark_paid(bigint) to authenticated;

revoke all on function public.staff_mark_played(bigint) from public, anon;
grant execute on function public.staff_mark_played(bigint) to authenticated;

revoke all on function public.staff_cancel(bigint) from public, anon;
grant execute on function public.staff_cancel(bigint) to authenticated;

revoke all on function public.admin_set_profile_role(uuid, text) from public, anon;
grant execute on function public.admin_set_profile_role(uuid, text) to authenticated;

revoke all on function public.admin_update_user_access(uuid, text, text) from public, anon;
grant execute on function public.admin_update_user_access(uuid, text, text) to authenticated;

revoke all on function public.admin_db_overview() from public, anon;
grant execute on function public.admin_db_overview() to authenticated;

revoke all on function public.admin_list_users(text, text, integer, integer) from public, anon;
grant execute on function public.admin_list_users(text, text, integer, integer) to authenticated;

revoke all on function public.admin_list_requests(text, text, text, integer, integer) from public, anon;
grant execute on function public.admin_list_requests(text, text, text, integer, integer) to authenticated;

revoke all on function public.admin_inspect_table(text, text, integer, integer) from public, anon;
grant execute on function public.admin_inspect_table(text, text, integer, integer) to authenticated;

revoke all on function public.admin_list_audit_logs(text, text, integer, integer) from public, anon;
grant execute on function public.admin_list_audit_logs(text, text, integer, integer) to authenticated;

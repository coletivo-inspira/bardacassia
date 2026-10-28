-- Pedidos de música: o cliente (sessão anônima) pede, paga no bar, o garçom
-- (usuário com e-mail e senha cadastrado em public.staff) confirma e controla a fila.

create table if not exists public.staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.bar_settings (
  id boolean primary key default true check (id),
  queue_open boolean not null default true,
  round_limit integer not null default 13 check (round_limit >= 0 and round_limit <= 200),
  round_started_at timestamptz not null default now(),
  next_round_at timestamptz,
  message text not null default '' check (char_length(message) <= 200),
  updated_at timestamptz not null default now()
);
insert into public.bar_settings(id) values (true) on conflict (id) do nothing;

create table if not exists public.song_requests (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  code text not null references public.catalog_codes(code),
  title text not null default '',
  artist text not null default '',
  customer_name text not null check (char_length(customer_name) between 2 and 60),
  customer_phone text not null check (customer_phone ~ '^[0-9]{10,13}$'),
  status text not null default 'aguardando_pagamento'
    check (status in ('aguardando_pagamento', 'na_fila', 'tocou', 'cancelado')),
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  played_at timestamptz,
  cancelled_at timestamptz
);
create index if not exists song_requests_status_idx on public.song_requests(status, paid_at, id);
create index if not exists song_requests_user_idx on public.song_requests(user_id, created_at desc);

alter table public.staff enable row level security;
alter table public.bar_settings enable row level security;
alter table public.song_requests enable row level security;
revoke all on public.staff, public.bar_settings, public.song_requests from anon, authenticated;

create or replace function private.require_staff()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists(select 1 from public.staff where user_id = auth.uid()) then
    raise exception 'staff only' using errcode = '42501';
  end if;
end;
$$;
revoke all on function private.require_staff() from public, anon, authenticated;

-- Pedidos de rodada já confirmados contam como vagas usadas.
create or replace function private.round_used()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.song_requests r, public.bar_settings s
  where r.status in ('na_fila', 'tocou') and r.paid_at >= s.round_started_at;
$$;
revoke all on function private.round_used() from public, anon, authenticated;

create or replace function private.round_state()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'queue_open', s.queue_open,
    'round_limit', s.round_limit,
    'round_used', private.round_used(),
    'next_round_at', s.next_round_at,
    'message', s.message
  ) from public.bar_settings s;
$$;
revoke all on function private.round_state() from public, anon, authenticated;

create or replace function public.create_song_request(p_code text, p_name text, p_phone text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_song public.catalog_codes%rowtype;
  v_settings public.bar_settings%rowtype;
  v_id bigint;
begin
  perform private.consume_write();
  select * into v_settings from public.bar_settings;
  if not v_settings.queue_open then
    raise exception 'queue closed' using errcode = 'P0001', hint = 'fila_fechada';
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
      where user_id = auth.uid() and status = 'aguardando_pagamento') >= 3 then
    raise exception 'too many pending requests' using errcode = 'P0001', hint = 'muitos_pendentes';
  end if;
  insert into public.song_requests(user_id, code, title, artist, customer_name, customer_phone)
  values (auth.uid(), v_song.code, v_song.title, v_song.artist, v_name, v_phone)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'status', 'aguardando_pagamento');
end;
$$;

-- Posição conta quantas músicas confirmadas estão antes desta na fila (0 = é a próxima).
create or replace function public.get_my_requests()
returns table(id bigint, code text, title text, artist text, status text,
  created_at timestamptz, played_at timestamptz, ahead integer)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.code, r.title, r.artist, r.status, r.created_at, r.played_at,
    case when r.status = 'na_fila' then (
      select count(*)::integer from public.song_requests q
      where q.status = 'na_fila' and (q.paid_at, q.id) < (r.paid_at, r.id)
    ) end as ahead
  from public.song_requests r
  where r.user_id = auth.uid() and r.created_at > now() - interval '18 hours'
  order by r.created_at desc
  limit 20;
$$;

create or replace function public.get_public_queue()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.round_state() || jsonb_build_object(
    'last_played', (
      select jsonb_build_object('title', r.title, 'artist', r.artist,
        'first_name', split_part(r.customer_name, ' ', 1), 'played_at', r.played_at)
      from public.song_requests r
      where r.status = 'tocou' and r.played_at > now() - interval '30 minutes'
      order by r.played_at desc limit 1
    ),
    'queue', coalesce((
      select jsonb_agg(jsonb_build_object('id', q.id, 'title', q.title, 'artist', q.artist,
        'first_name', split_part(q.customer_name, ' ', 1)) order by q.paid_at, q.id)
      from (
        select * from public.song_requests where status = 'na_fila'
        order by paid_at, id limit 50
      ) q
    ), '[]'::jsonb)
  );
$$;

create or replace function public.staff_list_requests(p_search text default '')
returns table(id bigint, code text, title text, artist text, customer_name text,
  customer_phone text, status text, created_at timestamptz, paid_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_search text := '%' || lower(btrim(coalesce(p_search, ''))) || '%';
begin
  perform private.require_staff();
  return query
  select r.id, r.code, r.title, r.artist, r.customer_name, r.customer_phone, r.status, r.created_at, r.paid_at
  from public.song_requests r
  where r.status in ('aguardando_pagamento', 'na_fila')
    and r.created_at > now() - interval '18 hours'
    and (lower(r.customer_name) like v_search or r.customer_phone like v_search or r.code like v_search)
  order by case r.status when 'na_fila' then 0 else 1 end, r.paid_at nulls last, r.created_at, r.id
  limit 200;
end;
$$;

create or replace function public.staff_get_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_staff();
  return private.round_state();
end;
$$;

-- Ao preencher a última vaga da rodada, a fila fecha sozinha.
create or replace function public.staff_mark_paid(p_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer;
begin
  perform private.require_staff();
  update public.song_requests set status = 'na_fila', paid_at = now()
  where id = p_id and status = 'aguardando_pagamento';
  if not found then
    raise exception 'request not pending' using errcode = '22023', hint = 'pedido_nao_pendente';
  end if;
  select round_limit into v_limit from public.bar_settings;
  if v_limit > 0 and private.round_used() >= v_limit then
    update public.bar_settings set queue_open = false, updated_at = now();
  end if;
  return private.round_state();
end;
$$;

create or replace function public.staff_mark_played(p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_staff();
  update public.song_requests set status = 'tocou', played_at = now()
  where id = p_id and status = 'na_fila';
  if not found then
    raise exception 'request not queued' using errcode = '22023', hint = 'pedido_fora_da_fila';
  end if;
end;
$$;

create or replace function public.staff_cancel(p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_staff();
  update public.song_requests set status = 'cancelado', cancelled_at = now()
  where id = p_id and status in ('aguardando_pagamento', 'na_fila');
  if not found then
    raise exception 'request not active' using errcode = '22023', hint = 'pedido_inativo';
  end if;
end;
$$;

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
begin
  perform private.require_staff();
  update public.bar_settings set
    queue_open = coalesce(p_queue_open, queue_open),
    round_limit = least(greatest(coalesce(p_round_limit, round_limit), 0), 200),
    next_round_at = p_next_round_at,
    message = left(coalesce(p_message, ''), 200),
    round_started_at = case when p_new_round then now() else round_started_at end,
    updated_at = now();
  return private.round_state();
end;
$$;

revoke all on function public.create_song_request(text, text, text) from public, anon;
revoke all on function public.get_my_requests() from public, anon;
revoke all on function public.get_public_queue() from public, anon;
revoke all on function public.staff_list_requests(text) from public, anon;
revoke all on function public.staff_get_settings() from public, anon;
revoke all on function public.staff_mark_paid(bigint) from public, anon;
revoke all on function public.staff_mark_played(bigint) from public, anon;
revoke all on function public.staff_cancel(bigint) from public, anon;
revoke all on function public.staff_update_settings(boolean, integer, timestamptz, text, boolean) from public, anon;
grant execute on function public.create_song_request(text, text, text) to authenticated;
grant execute on function public.get_my_requests() to authenticated;
grant execute on function public.get_public_queue() to authenticated;
grant execute on function public.staff_list_requests(text) to authenticated;
grant execute on function public.staff_get_settings() to authenticated;
grant execute on function public.staff_mark_paid(bigint) to authenticated;
grant execute on function public.staff_mark_played(bigint) to authenticated;
grant execute on function public.staff_cancel(bigint) to authenticated;
grant execute on function public.staff_update_settings(boolean, integer, timestamptz, text, boolean) to authenticated;

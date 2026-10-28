-- Pedido pelo QR: o cliente só mostra um QR na tela (nada é gravado do aparelho dele);
-- o garçom lê, cobra e o pedido já nasce pago, na fila. Pedidos feitos de casa não existem.

alter table public.song_requests alter column user_id drop not null;
alter table public.song_requests alter column customer_phone drop not null;
alter table public.song_requests add column if not exists ticket uuid unique;
alter table public.song_requests add column if not exists created_by uuid references auth.users(id) on delete set null;
create index if not exists song_requests_played_idx on public.song_requests(status, played_at desc);

alter table public.staff add column if not exists role text not null default 'garcom';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'staff_role_check') then
    alter table public.staff add constraint staff_role_check check (role in ('garcom', 'dono'));
  end if;
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
  return private.round_state() || jsonb_build_object('id', v_id, 'status', 'na_fila', 'duplicate', false);
end;
$$;

drop function if exists public.staff_list_requests(text);
create function public.staff_list_requests(p_search text default '')
returns table(id bigint, code text, title text, artist text, customer_name text,
  customer_phone text, status text, created_at timestamptz, paid_at timestamptz, staff_name text)
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
  select r.id, r.code, r.title, r.artist, r.customer_name, r.customer_phone, r.status, r.created_at, r.paid_at,
    s.name as staff_name
  from public.song_requests r
  left join public.staff s on s.user_id = r.created_by
  where (r.status = 'na_fila' or (r.status = 'aguardando_pagamento' and r.created_at > now() - interval '30 minutes'))
    and r.created_at > now() - interval '18 hours'
    and (lower(r.customer_name) like v_search or coalesce(r.customer_phone, '') like v_search or r.code like v_search)
  order by case r.status when 'na_fila' then 0 else 1 end, r.paid_at nulls last, r.created_at, r.id
  limit 200;
end;
$$;

create or replace function public.staff_list_played()
returns table(id bigint, code text, title text, artist text, customer_name text, played_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_staff();
  return query
  select r.id, r.code, r.title, r.artist, r.customer_name, r.played_at
  from public.song_requests r
  where r.status = 'tocou' and r.played_at > now() - interval '18 hours'
  order by r.played_at desc
  limit 100;
end;
$$;

create or replace function public.staff_whoami()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_staff();
  return (select jsonb_build_object('name', s.name, 'role', s.role) from public.staff s where s.user_id = auth.uid());
end;
$$;

-- O ticket é um UUID aleatório que só existe no aparelho do cliente; sem ele não há o que consultar.
create or replace function public.get_ticket_status(p_ticket uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'status', r.status,
    'ahead', case when r.status = 'na_fila' then (
      select count(*)::integer from public.song_requests q
      where q.status = 'na_fila' and (q.paid_at, q.id) < (r.paid_at, r.id)
    ) end
  )
  from public.song_requests r
  where r.ticket = p_ticket and r.created_at > now() - interval '18 hours';
$$;

revoke all on function public.staff_add_request(text, text, uuid) from public, anon;
revoke all on function public.staff_list_requests(text) from public, anon;
revoke all on function public.staff_list_played() from public, anon;
revoke all on function public.staff_whoami() from public, anon;
revoke all on function public.get_ticket_status(uuid) from public;
grant execute on function public.staff_add_request(text, text, uuid) to authenticated;
grant execute on function public.staff_list_requests(text) to authenticated;
grant execute on function public.staff_list_played() to authenticated;
grant execute on function public.staff_whoami() to authenticated;
grant execute on function public.get_ticket_status(uuid) to anon, authenticated;

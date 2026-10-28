-- Só vale para o modo remoto (VITE_REQUEST_MODE=remoto), em que o cliente pede sozinho.
-- Código da noite: o garçom mostra no balcão ou na tela do karaokê; quem está em casa
-- pelo link do Instagram não sabe. Pedidos não pagos expiram em 30 minutos e há um teto
-- global de pendentes, para um bot com várias sessões anônimas não lotar a lista.

alter table public.bar_settings add column if not exists require_night_code boolean not null default false;
alter table public.bar_settings add column if not exists night_code text not null default '';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'bar_settings_night_code_check') then
    alter table public.bar_settings add constraint bar_settings_night_code_check check (night_code ~ '^[A-Z0-9]{0,12}$');
  end if;
end;
$$;

-- O código em si nunca sai daqui para o público; só se ele é exigido.
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
    'message', s.message,
    'night_code_required', s.require_night_code and s.night_code <> ''
  ) from public.bar_settings s;
$$;
revoke all on function private.round_state() from public, anon, authenticated;

drop function if exists public.create_song_request(text, text, text);
create function public.create_song_request(p_code text, p_name text, p_phone text, p_night_code text default '')
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
  v_id bigint;
begin
  perform private.consume_write();
  update public.song_requests set status = 'cancelado', cancelled_at = now()
  where status = 'aguardando_pagamento' and created_at < now() - interval '30 minutes';
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
      where user_id = auth.uid() and status = 'aguardando_pagamento') >= 3 then
    raise exception 'too many pending requests' using errcode = 'P0001', hint = 'muitos_pendentes';
  end if;
  if (select count(*) from public.song_requests where status = 'aguardando_pagamento') >= 40 then
    raise exception 'too many pending overall' using errcode = 'P0001', hint = 'pendentes_lotado';
  end if;
  insert into public.song_requests(user_id, code, title, artist, customer_name, customer_phone)
  values (auth.uid(), v_song.code, v_song.title, v_song.artist, v_name, v_phone)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'status', 'aguardando_pagamento');
end;
$$;

create or replace function public.staff_get_night_code()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_staff();
  return (select jsonb_build_object('required', require_night_code, 'code', night_code) from public.bar_settings);
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
  update public.bar_settings set require_night_code = coalesce(p_required, false), night_code = v_code, updated_at = now();
  return public.staff_get_night_code();
end;
$$;

revoke all on function public.create_song_request(text, text, text, text) from public, anon;
revoke all on function public.staff_get_night_code() from public, anon;
revoke all on function public.staff_set_night_code(boolean, text) from public, anon;
grant execute on function public.create_song_request(text, text, text, text) to authenticated;
grant execute on function public.staff_get_night_code() to authenticated;
grant execute on function public.staff_set_night_code(boolean, text) to authenticated;

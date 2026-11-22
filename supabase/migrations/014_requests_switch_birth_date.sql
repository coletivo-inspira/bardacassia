-- Pedidos: a RPC passa a respeitar o interruptor site_features.requests do
-- painel admin (antes só queue_open barrava pedidos feitos direto pela API).
-- Perfil: profiles_birth_date_range usava `current_date - 10` (10 dias); agora
-- exige 10 anos, a mesma idade mínima do cliente (src/lib/profile.js).

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
  v_requests_on boolean := true;
  v_expire_mins integer := 30;
  v_max_per_user integer := 3;
  v_max_total integer := 40;
  v_id bigint;
begin
  perform private.consume_write();

  select
    coalesce(f.requests, true),
    coalesce(f.pending_expire_minutes, 30),
    coalesce(f.max_pending_per_user, 3),
    coalesce(f.max_pending_total, 40)
  into v_requests_on, v_expire_mins, v_max_per_user, v_max_total
  from public.site_features f
  where f.id;

  if not coalesce(v_requests_on, true) then
    raise exception 'Os pedidos de música estão desligados no momento.'
      using errcode = 'P0001', hint = 'pedidos_desligados';
  end if;

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

revoke all on function public.create_song_request(text, text, text, text) from public, anon;
grant execute on function public.create_song_request(text, text, text, text) to authenticated;

-- A nova regra entra NOT VALID: vale para todo insert/update a partir de agora,
-- sem falhar o deploy por linhas antigas. Só valida a tabela inteira quando
-- nenhuma linha existente viola a regra; senão deixa um aviso no log.
alter table public.profiles drop constraint if exists profiles_birth_date_range;
alter table public.profiles
  add constraint profiles_birth_date_range
  check (
    birth_date is null
    or (birth_date >= date '1900-01-01' and birth_date <= (current_date - interval '10 years')::date)
  ) not valid;

do $$
declare
  v_bad integer;
begin
  select count(*) into v_bad
  from public.profiles
  where birth_date is not null
    and (birth_date < date '1900-01-01' or birth_date > (current_date - interval '10 years')::date);
  if v_bad = 0 then
    alter table public.profiles validate constraint profiles_birth_date_range;
  else
    raise notice 'profiles_birth_date_range ficou NOT VALID: % perfil(is) com data fora da faixa.', v_bad;
  end if;
end $$;

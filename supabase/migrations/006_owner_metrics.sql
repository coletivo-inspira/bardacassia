-- Resultados para o dono do bar (staff.role = 'dono'). A "noite" começa às 18h no horário
-- de Brasília: um pedido às 2h de quinta conta para a noite de quarta.

create or replace function private.require_owner()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists(select 1 from public.staff where user_id = auth.uid() and role = 'dono') then
    raise exception 'owner only' using errcode = '42501';
  end if;
end;
$$;
revoke all on function private.require_owner() from public, anon, authenticated;

create or replace function private.night_of(p_at timestamptz)
returns date
language sql
stable
set search_path = ''
as $$
  select ((p_at at time zone 'America/Sao_Paulo') - interval '18 hours')::date;
$$;
revoke all on function private.night_of(timestamptz) from public, anon, authenticated;

create or replace function public.owner_metrics(p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_from timestamptz := coalesce(p_from, now() - interval '30 days');
  v_to timestamptz := coalesce(p_to, now());
  v_result jsonb;
begin
  perform private.require_owner();
  if v_to - v_from > interval '400 days' then
    v_from := v_to - interval '400 days';
  end if;

  with req as (
    select * from public.song_requests where created_at >= v_from and created_at < v_to
  ), paid as (
    select * from req where paid_at is not null and status <> 'cancelado'
  )
  select jsonb_build_object(
    'from', v_from,
    'to', v_to,
    'requests', (select count(*) from paid),
    'played', (select count(*) from req where status = 'tocou'),
    'cancelled', (select count(*) from req where status = 'cancelado'),
    'unpaid', (select count(*) from req where paid_at is null and status <> 'cancelado'),
    'via_qr', (select count(*) from paid where ticket is not null),
    'nights', (select count(distinct private.night_of(paid_at)) from paid),
    'avg_wait_minutes', (
      select round(avg(extract(epoch from (played_at - paid_at)) / 60)::numeric, 1)
      from req where status = 'tocou' and played_at is not null and paid_at is not null
    ),
    'customers', (
      select count(distinct coalesce(user_id::text, lower(customer_name) || ':' || private.night_of(paid_at)::text)) from paid
    ),
    'visitors', (
      select count(distinct user_id) from public.song_interactions
      where first_open_at >= v_from and first_open_at < v_to
    ),
    'song_opens', (
      select count(*) from public.song_interactions
      where first_open_at >= v_from and first_open_at < v_to
    ),
    'accounts_total', (select count(*) from public.profiles),
    'accounts_new', (select count(*) from public.profiles where created_at >= v_from and created_at < v_to),
    'by_night', coalesce((
      select jsonb_agg(jsonb_build_object('night', night, 'requests', total) order by night)
      from (select private.night_of(paid_at) as night, count(*) as total from paid group by 1) n
    ), '[]'::jsonb),
    'by_weekday', coalesce((
      select jsonb_agg(jsonb_build_object('weekday', weekday, 'requests', total) order by weekday)
      from (select extract(dow from private.night_of(paid_at))::integer as weekday, count(*) as total from paid group by 1) w
    ), '[]'::jsonb),
    'top_songs', coalesce((
      select jsonb_agg(jsonb_build_object('code', code, 'title', title, 'artist', artist, 'requests', total) order by total desc, code)
      from (
        select code, max(title) as title, max(artist) as artist, count(*) as total
        from paid group by code order by count(*) desc, code limit 10
      ) t
    ), '[]'::jsonb),
    'by_staff', coalesce((
      select jsonb_agg(jsonb_build_object('name', name, 'requests', total) order by total desc)
      from (
        select coalesce(nullif(s.name, ''), 'Sem nome') as name, count(*) as total
        from paid p join public.staff s on s.user_id = p.created_by
        group by 1
      ) g
    ), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.owner_metrics(timestamptz, timestamptz) from public, anon;
grant execute on function public.owner_metrics(timestamptz, timestamptz) to authenticated;

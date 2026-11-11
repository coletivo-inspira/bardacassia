-- A 012 lia `site_features where id`, mas `id` também é coluna de saída desta
-- função: o PL/pgSQL recusava a referência ambígua (42702) e os painéis do
-- garçom e do gerente ficavam sem fila. A tabela agora vai com alias.

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
  select coalesce(f.pending_expire_minutes, 30) into v_expire_mins from public.site_features f where f.id;
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

revoke all on function public.staff_list_requests(text) from public, anon;
grant execute on function public.staff_list_requests(text) to authenticated;

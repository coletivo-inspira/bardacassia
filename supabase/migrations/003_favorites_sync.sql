-- Favorites sync for signed-in accounts. song_interactions already stores
-- favorited per user; this adds a single round-trip merge used on page load.

create or replace function public.sync_my_favorites(p_codes text[])
returns setof text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_account();
begin
  if coalesce(cardinality(p_codes), 0) > 1000 then
    raise exception 'too many codes' using errcode = '22023';
  end if;
  perform private.consume_write();

  insert into public.song_interactions(user_id, code, favorited, updated_at)
  select v_user, c.code, true, now()
  from public.catalog_codes c
  where c.active and c.code = any(coalesce(p_codes, '{}'))
  on conflict (user_id, code)
  do update set favorited = true, updated_at = now()
  where not public.song_interactions.favorited;

  return query
    select i.code
    from public.song_interactions i
    join public.catalog_codes c on c.code = i.code and c.active
    where i.user_id = v_user and i.favorited
    order by i.updated_at desc
    limit 1000;
end;
$$;

revoke all on function public.sync_my_favorites(text[]) from public, anon;
grant execute on function public.sync_my_favorites(text[]) to authenticated;

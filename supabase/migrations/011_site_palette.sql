-- Paleta do site. O painel admin grava cores em site_features.palette;
-- o navegador lê pelo mesmo get_site_features. Objeto vazio volta à logo do CSS.
-- Nada secreto entra aqui: só #rrggbb de fundo, texto e acento.

alter table public.site_features
  add column if not exists palette jsonb not null default '{}'::jsonb;

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
    'auth_providers', auth_providers,
    'palette', coalesce(palette, '{}'::jsonb)
  )
  from public.site_features
  where id;
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
  return public.get_site_features();
end;
$$;

revoke all on function public.get_site_features() from public;
grant execute on function public.get_site_features() to anon, authenticated;

revoke all on function public.set_site_palette(jsonb) from public, anon;
grant execute on function public.set_site_palette(jsonb) to authenticated;

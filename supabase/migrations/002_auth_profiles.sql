-- Accounts: profile per registered user, RLS-scoped to the owner, and
-- column-level encryption for sensitive fields with the key kept in Vault.
-- Passwords never touch these tables: Supabase Auth stores only bcrypt hashes.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id and coalesce((select auth.jwt() ->> 'is_anonymous')::boolean, false) is false);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id and coalesce((select auth.jwt() ->> 'is_anonymous')::boolean, false) is false)
  with check ((select auth.uid()) = id);

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function private.touch_updated_at();

-- Creates the profile when a permanent account appears, including an
-- anonymous visitor that converts by adding an e-mail.
create or replace function private.handle_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(new.is_anonymous, false) then
    return new;
  end if;
  insert into public.profiles(id, display_name)
  values (new.id, left(trim(coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'full_name', '')), 60))
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function private.handle_auth_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_saved on auth.users;
create trigger on_auth_user_saved
  after insert or update of is_anonymous, email on auth.users
  for each row execute function private.handle_auth_user();

insert into public.profiles(id, display_name)
select u.id, left(trim(coalesce(u.raw_user_meta_data ->> 'display_name', u.raw_user_meta_data ->> 'full_name', '')), 60)
from auth.users u
where not coalesce(u.is_anonymous, false)
on conflict (id) do nothing;

-- Ranking writes now accept signed-in accounts as well as anonymous visitors.
create or replace function private.consume_write()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_window timestamptz := date_trunc('minute', now());
  v_count integer;
begin
  if v_user is null then
    raise exception 'session required' using errcode = '42501';
  end if;
  insert into private.write_limits(user_id, window_start, writes)
  values (v_user, v_window, 1)
  on conflict (user_id, window_start)
  do update set writes = private.write_limits.writes + 1
  returning writes into v_count;
  if v_count > 120 then
    raise exception 'write limit exceeded' using errcode = 'P0001';
  end if;
end;
$$;
revoke all on function private.consume_write() from public, anon, authenticated;

-- Sensitive fields live outside the exposed schema and are encrypted with a
-- key stored in Supabase Vault. Create it once in the SQL editor:
--   select vault.create_secret(encode(extensions.gen_random_bytes(32), 'base64'), 'profile_encryption_key');
create table if not exists private.profile_secrets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  phone_encrypted bytea,
  updated_at timestamptz not null default now()
);
alter table private.profile_secrets enable row level security;
revoke all on private.profile_secrets from public, anon, authenticated;

create or replace function private.profile_key()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_key text;
begin
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'profile_encryption_key' limit 1;
  if v_key is null then
    raise exception 'profile encryption key not configured' using errcode = '55000';
  end if;
  return v_key;
end;
$$;
revoke all on function private.profile_key() from public, anon, authenticated;

create or replace function private.require_account()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'account required' using errcode = '42501';
  end if;
  return auth.uid();
end;
$$;
revoke all on function private.require_account() from public, anon, authenticated;

create or replace function public.set_my_phone(p_phone text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_account();
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g');
begin
  if v_phone = '' then
    delete from private.profile_secrets where user_id = v_user;
    return;
  end if;
  if v_phone !~ '^\+?[0-9]{10,15}$' then
    raise exception 'invalid phone' using errcode = '22023';
  end if;
  insert into private.profile_secrets(user_id, phone_encrypted, updated_at)
  values (v_user, extensions.pgp_sym_encrypt(v_phone, private.profile_key()), now())
  on conflict (user_id) do update set phone_encrypted = excluded.phone_encrypted, updated_at = now();
end;
$$;

create or replace function public.get_my_phone()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_account();
  v_cipher bytea;
begin
  select phone_encrypted into v_cipher from private.profile_secrets where user_id = v_user;
  if v_cipher is null then
    return null;
  end if;
  return extensions.pgp_sym_decrypt(v_cipher, private.profile_key());
end;
$$;

revoke all on function public.set_my_phone(text) from public, anon;
revoke all on function public.get_my_phone() from public, anon;
grant execute on function public.set_my_phone(text) to authenticated;
grant execute on function public.get_my_phone() to authenticated;

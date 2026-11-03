-- Profile extras: birthday, avatar URL, and LGPD consent versioning.
-- Avatar files live in the public `avatars` storage bucket (owner-scoped writes).

alter table public.profiles
  add column if not exists birth_date date,
  add column if not exists avatar_url text,
  add column if not exists data_consent_at timestamptz,
  add column if not exists data_consent_version text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_birth_date_range'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_birth_date_range
      check (
        birth_date is null
        or (birth_date >= date '1900-01-01' and birth_date <= (current_date - 10))
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_avatar_url_len'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_avatar_url_len
      check (avatar_url is null or char_length(avatar_url) <= 500);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_data_consent_version_len'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_data_consent_version_len
      check (data_consent_version is null or char_length(data_consent_version) <= 32);
  end if;
end $$;

grant update (
  display_name,
  birth_date,
  avatar_url,
  data_consent_at,
  data_consent_version
) on public.profiles to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  524288,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatars_select_public" on storage.objects;
create policy "avatars_select_public" on storage.objects
  for select to public
  using (bucket_id = 'avatars');

drop policy if exists "avatars_insert_own" on storage.objects;
create policy "avatars_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and coalesce((select auth.jwt() ->> 'is_anonymous')::boolean, false) is false
  );

drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and coalesce((select auth.jwt() ->> 'is_anonymous')::boolean, false) is false
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and coalesce((select auth.jwt() ->> 'is_anonymous')::boolean, false) is false
  );

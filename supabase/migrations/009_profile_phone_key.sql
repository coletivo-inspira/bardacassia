-- Minha conta now saves the phone through set_my_phone / get_my_phone (002).
-- Both read the Vault key `profile_encryption_key`, which 002 left as a manual
-- SQL Editor step. Create it here only when missing: replacing an existing key
-- would make phones already encrypted with it unreadable.

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'profile_encryption_key') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'base64'),
      'profile_encryption_key',
      'pgp_sym key for private.profile_secrets (account phone)'
    );
  end if;
end;
$$;

revoke all on function public.set_my_phone(text) from public, anon;
revoke all on function public.get_my_phone() from public, anon;
grant execute on function public.set_my_phone(text) to authenticated;
grant execute on function public.get_my_phone() to authenticated;

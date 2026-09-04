create or replace function private.register_account(p_email text, p_password text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid := gen_random_uuid();
  normalized_email text := lower(trim(p_email));
  hashed text;
begin
  if normalized_email is null or position('@' in normalized_email) = 0 then
    raise exception 'invalid_email' using errcode = '22023';
  end if;

  if p_password is null or char_length(p_password) < 6 then
    raise exception 'weak_password' using errcode = '22023';
  end if;

  if exists (
    select 1
    from auth.users as u
    where lower(u.email) = normalized_email
  ) then
    raise exception 'already_registered' using errcode = '23505';
  end if;

  hashed := extensions.crypt(p_password, extensions.gen_salt('bf'));

  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change
  ) values (
    '00000000-0000-0000-0000-000000000000',
    new_id,
    'authenticated',
    'authenticated',
    normalized_email,
    hashed,
    now(),
    jsonb_build_object('provider', 'email', 'providers', array['email']),
    '{}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    ''
  );

  insert into auth.identities (
    provider_id,
    user_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  ) values (
    new_id::text,
    new_id,
    jsonb_build_object(
      'sub', new_id::text,
      'email', normalized_email,
      'email_verified', true,
      'phone_verified', false
    ),
    'email',
    now(),
    now(),
    now()
  );
end;
$$;

create or replace function public.register_account(p_email text, p_password text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.register_account(p_email, p_password);
end;
$$;

revoke all on function private.register_account(text, text) from public;
revoke all on function public.register_account(text, text) from public;
grant execute on function private.register_account(text, text) to anon, authenticated;
grant execute on function public.register_account(text, text) to anon, authenticated;
grant usage on schema private to anon, authenticated;

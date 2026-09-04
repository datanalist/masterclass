-- Keep fail RPCs as invoker wrappers; ownership is enforced in private.fail_generation.

create or replace function private.fail_generation(
  p_generation_id uuid,
  p_error_message text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  jwt_role text := coalesce(auth.role(), '');
  gen public.generations%rowtype;
  new_balance integer;
  message text;
begin
  select *
  into gen
  from public.generations
  where id = p_generation_id
  for update;

  if not found then
    raise exception 'Generation not found' using errcode = 'P0002';
  end if;

  if uid is not null then
    if gen.user_id is distinct from uid then
      raise exception 'Generation not found' using errcode = 'P0002';
    end if;
  elsif jwt_role is distinct from 'service_role' then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if gen.status in ('succeeded', 'failed') then
    return;
  end if;

  message := nullif(trim(coalesce(p_error_message, '')), '');
  if message is not null and char_length(message) > 2000 then
    message := left(message, 2000);
  end if;

  update public.generations
  set
    status = 'failed',
    error_message = message,
    completed_at = now()
  where id = gen.id;

  if gen.cost_points > 0 then
    update public.profiles
    set points_balance = points_balance + gen.cost_points
    where id = gen.user_id
    returning points_balance into new_balance;

    insert into public.balance_transactions (
      user_id, kind, amount, balance_after, generation_id, note
    )
    values (
      gen.user_id,
      'refund',
      gen.cost_points,
      new_balance,
      gen.id,
      'Generation refund'
    );
  end if;
end;
$$;

drop function if exists public.fail_own_generation(uuid, text);

create function public.fail_own_generation(
  p_generation_id uuid,
  p_error_message text default null
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.fail_generation(p_generation_id, p_error_message);
$$;

revoke all on function public.fail_own_generation(uuid, text) from public, anon;
grant execute on function public.fail_own_generation(uuid, text) to authenticated, service_role;
grant execute on function private.fail_generation(uuid, text) to authenticated, service_role;

-- Partial refund on fail, and persist only while status = running.

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
  asset_count integer;
  refund_points integer;
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

  select count(*)
  into asset_count
  from public.generation_assets as a
  where a.generation_id = gen.id;

  if asset_count >= gen.object_count then
    update public.generations
    set
      status = 'succeeded',
      error_message = null,
      completed_at = now()
    where id = gen.id
      and status in ('queued', 'running');
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

  if gen.object_count > 0 then
    refund_points := (gen.cost_points / gen.object_count) * (gen.object_count - asset_count);
  else
    refund_points := gen.cost_points;
  end if;

  if refund_points > 0 then
    update public.profiles
    set points_balance = points_balance + refund_points
    where id = gen.user_id
    returning points_balance into new_balance;

    insert into public.balance_transactions (
      user_id, kind, amount, balance_after, generation_id, note
    )
    values (
      gen.user_id,
      'refund',
      refund_points,
      new_balance,
      gen.id,
      case
        when asset_count > 0 then 'Generation partial refund'
        else 'Generation refund'
      end
    );
  end if;
end;
$$;

create or replace function private.claim_generation_persist(p_generation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  jwt_role text := coalesce(auth.role(), '');
begin
  if jwt_role is distinct from 'service_role' then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  perform 1
  from public.generations as g
  where g.id = p_generation_id
    and g.status = 'running'
  for update;

  return found;
end;
$$;

create or replace function private.persist_generation_asset(
  p_generation_id uuid,
  p_user_id uuid,
  p_storage_path text,
  p_sort_order integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  jwt_role text := coalesce(auth.role(), '');
  gen public.generations%rowtype;
begin
  if jwt_role is distinct from 'service_role' then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select *
  into gen
  from public.generations as g
  where g.id = p_generation_id
  for update;

  if not found or gen.status is distinct from 'running' or gen.user_id is distinct from p_user_id then
    return jsonb_build_object(
      'accepted',
      false,
      'status',
      coalesce(gen.status, 'missing')
    );
  end if;

  insert into public.generation_assets (
    generation_id,
    user_id,
    storage_path,
    sort_order,
    kind
  )
  values (
    p_generation_id,
    p_user_id,
    p_storage_path,
    p_sort_order,
    'image'
  )
  on conflict (generation_id, sort_order) do update
  set storage_path = excluded.storage_path;

  return jsonb_build_object('accepted', true, 'status', gen.status);
end;
$$;

create or replace function public.claim_generation_persist(p_generation_id uuid)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.claim_generation_persist(p_generation_id);
$$;

create or replace function public.persist_generation_asset(
  p_generation_id uuid,
  p_user_id uuid,
  p_storage_path text,
  p_sort_order integer
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.persist_generation_asset(
    p_generation_id,
    p_user_id,
    p_storage_path,
    p_sort_order
  );
$$;

revoke all on function public.claim_generation_persist(uuid) from public, anon, authenticated;
revoke all on function public.persist_generation_asset(uuid, uuid, text, integer) from public, anon, authenticated;
revoke all on function private.claim_generation_persist(uuid) from public, anon, authenticated;
revoke all on function private.persist_generation_asset(uuid, uuid, text, integer) from public, anon, authenticated;

grant execute on function public.claim_generation_persist(uuid) to service_role;
grant execute on function public.persist_generation_asset(uuid, uuid, text, integer) to service_role;
grant execute on function private.claim_generation_persist(uuid) to service_role;
grant execute on function private.persist_generation_asset(uuid, uuid, text, integer) to service_role;

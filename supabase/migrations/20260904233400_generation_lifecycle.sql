-- Classify products (manual now, feature 3 can fill detected_label),
-- fail+refund a generation, and make asset sort_order idempotent.

alter table public.generation_assets
  add constraint generation_assets_generation_sort_unique unique (generation_id, sort_order);

create or replace function private.classify_product(
  p_product_id uuid,
  p_category_id text,
  p_detected_label text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  label text;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if p_category_id is null or not exists (
    select 1 from public.categories as c where c.id = p_category_id
  ) then
    raise exception 'Unknown category' using errcode = '22023';
  end if;

  label := nullif(trim(coalesce(p_detected_label, '')), '');
  if label is not null and char_length(label) > 200 then
    raise exception 'Detected label is too long' using errcode = '22023';
  end if;

  update public.products
  set
    category_id = p_category_id,
    detected_label = label,
    classification_status = 'succeeded'
  where id = p_product_id and user_id = uid;

  if not found then
    raise exception 'Product not found' using errcode = 'P0002';
  end if;
end;
$$;

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

create or replace function public.classify_product(
  p_product_id uuid,
  p_category_id text,
  p_detected_label text default null
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.classify_product(p_product_id, p_category_id, p_detected_label);
$$;

create or replace function public.fail_own_generation(
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

create or replace function public.fail_generation(
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

revoke all on function public.classify_product(uuid, text, text) from public, anon;
revoke all on function public.fail_own_generation(uuid, text) from public, anon;
revoke all on function public.fail_generation(uuid, text) from public, anon, authenticated;
revoke all on function private.classify_product(uuid, text, text) from public, anon;
revoke all on function private.fail_generation(uuid, text) from public, anon;

grant execute on function public.classify_product(uuid, text, text) to authenticated;
grant execute on function public.fail_own_generation(uuid, text) to authenticated, service_role;
grant execute on function private.classify_product(uuid, text, text) to authenticated;
grant execute on function private.fail_generation(uuid, text) to authenticated, service_role;
grant execute on function public.fail_generation(uuid, text) to service_role;

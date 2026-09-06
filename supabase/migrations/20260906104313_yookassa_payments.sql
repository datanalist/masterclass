-- YooKassa top-ups: catalog prices, payment ledger, atomic credit.

insert into public.credit_packages (id, title, points, amount_rub, is_active, sort_order)
values
  ('starter', '100 баллов', 100, 490, true, 1),
  ('growth', '300 баллов', 300, 1290, true, 2),
  ('pro', '750 баллов', 750, 2790, true, 3)
on conflict (id) do update
set
  title = excluded.title,
  points = excluded.points,
  amount_rub = excluded.amount_rub,
  is_active = excluded.is_active,
  sort_order = excluded.sort_order;

update public.credit_packages
set is_active = false
where id in ('s', 'm', 'l');

create table public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  provider text not null default 'yookassa',
  provider_payment_id text not null unique,
  idempotence_key text not null unique,
  package_id text not null references public.credit_packages (id),
  amount_rub integer not null check (amount_rub > 0),
  points integer not null check (points > 0),
  status text not null check (status in ('pending', 'succeeded', 'canceled', 'failed')),
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index payment_tx_user_created_idx
  on public.payment_transactions (user_id, created_at desc);

create trigger payment_transactions_set_updated_at
  before update on public.payment_transactions
  for each row execute function private.set_updated_at();

alter table public.payment_transactions enable row level security;

create policy "Users read own payment transactions"
  on public.payment_transactions for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.payment_transactions from public, anon, authenticated;
grant select on table public.payment_transactions to authenticated;

create or replace function private.finalize_yookassa_payment(
  p_provider_payment_id text,
  p_status text,
  p_raw_payload jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  pay public.payment_transactions%rowtype;
  new_balance integer;
begin
  if p_status not in ('succeeded', 'canceled', 'failed') then
    raise exception 'Invalid payment status' using errcode = '22023';
  end if;

  select *
  into pay
  from public.payment_transactions
  where provider_payment_id = p_provider_payment_id
  for update;

  if not found then
    raise exception 'Payment not found' using errcode = 'P0002';
  end if;

  if pay.status = 'succeeded' then
    select points_balance
    into new_balance
    from public.profiles
    where id = pay.user_id;
    return coalesce(new_balance, 0);
  end if;

  update public.payment_transactions
  set
    status = p_status,
    raw_payload = p_raw_payload,
    updated_at = now()
  where id = pay.id;

  if p_status <> 'succeeded' then
    select points_balance
    into new_balance
    from public.profiles
    where id = pay.user_id;
    return coalesce(new_balance, 0);
  end if;

  update public.profiles
  set points_balance = points_balance + pay.points
  where id = pay.user_id
  returning points_balance into new_balance;

  if not found then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;

  insert into public.balance_transactions (
    user_id, kind, amount, balance_after, package_id, note
  )
  values (
    pay.user_id,
    'topup',
    pay.points,
    new_balance,
    pay.package_id,
    'YooKassa payment ' || pay.provider_payment_id
  );

  return new_balance;
end;
$$;

revoke all on function private.finalize_yookassa_payment(text, text, jsonb)
  from public, anon, authenticated;
grant execute on function private.finalize_yookassa_payment(text, text, jsonb)
  to service_role;

create or replace function public.finalize_yookassa_payment(
  p_provider_payment_id text,
  p_status text,
  p_raw_payload jsonb
)
returns integer
language sql
security definer
set search_path = ''
as $$
  select private.finalize_yookassa_payment(p_provider_payment_id, p_status, p_raw_payload);
$$;

revoke all on function public.finalize_yookassa_payment(text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.finalize_yookassa_payment(text, text, jsonb)
  to service_role;

revoke execute on function public.redeem_package(text) from public, anon, authenticated;
revoke execute on function private.redeem_package(text) from public, anon, authenticated;
grant execute on function public.redeem_package(text) to service_role;
grant execute on function private.redeem_package(text) to service_role;

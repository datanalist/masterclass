-- App schema: profiles, catalog, generations, points ledger, storage, RPCs.

create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to postgres, service_role, authenticated, supabase_auth_admin;

create table public.categories (
  id text primary key,
  title text not null,
  has_presets boolean not null default true,
  sort_order integer not null
);

create table public.presentation_presets (
  id uuid primary key default gen_random_uuid(),
  category_id text not null references public.categories (id) on delete cascade,
  title text not null,
  prompt text not null,
  sort_order integer not null check (sort_order between 1 and 4),
  unique (category_id, sort_order)
);

create table public.credit_packages (
  id text primary key,
  title text not null,
  points integer not null check (points > 0),
  amount_rub integer check (amount_rub is null or amount_rub > 0),
  is_active boolean not null default true,
  sort_order integer not null default 0
);

create table public.generation_tariffs (
  generation_type text primary key check (generation_type in ('photo', 'card')),
  points_per_object integer not null check (points_per_object > 0)
);

create table public.app_settings (
  key text primary key,
  value text not null
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  points_balance integer not null default 0 check (points_balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  source_path text not null
    constraint products_source_path_owned
    check (source_path like user_id::text || '/%'),
  category_id text references public.categories (id),
  detected_label text,
  classification_status text not null default 'pending'
    check (classification_status in ('pending', 'succeeded', 'failed')),
  created_at timestamptz not null default now()
);

create table public.generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  generation_type text not null check (generation_type in ('photo', 'card')),
  presentation_preset_id uuid references public.presentation_presets (id),
  wishes text constraint generations_wishes_len_chk
    check (wishes is null or char_length(wishes) <= 2000),
  object_count integer not null
    constraint generations_object_count_check
    check (object_count between 1 and 20),
  cost_points integer not null check (cost_points >= 0),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'succeeded', 'failed')),
  title text,
  card_title text,
  card_description text,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.generation_assets (
  id uuid primary key default gen_random_uuid(),
  generation_id uuid not null references public.generations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  storage_path text not null,
  sort_order integer not null default 0,
  kind text not null default 'image' check (kind in ('image'))
);

create table public.balance_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('signup_bonus', 'topup', 'generation_spend', 'refund')),
  amount integer not null,
  balance_after integer not null,
  generation_id uuid references public.generations (id) on delete set null,
  package_id text references public.credit_packages (id),
  note text,
  created_at timestamptz not null default now()
);

create index products_user_created_idx on public.products (user_id, created_at desc);
create index products_category_id_idx on public.products (category_id);
create index generations_user_created_idx on public.generations (user_id, created_at desc);
create index generations_product_id_idx on public.generations (product_id);
create index generations_presentation_preset_id_idx on public.generations (presentation_preset_id);
create index generation_assets_generation_idx on public.generation_assets (generation_id, sort_order);
create index generation_assets_user_id_idx on public.generation_assets (user_id);
create index balance_tx_user_created_idx on public.balance_transactions (user_id, created_at desc);
create index balance_tx_generation_id_idx on public.balance_transactions (generation_id);
create index balance_tx_package_id_idx on public.balance_transactions (package_id);

insert into public.categories (id, title, has_presets, sort_order) values
  ('clothing_footwear', 'Одежда и обувь', true, 1),
  ('accessories', 'Аксессуары', true, 2),
  ('food_drinks', 'Еда и напитки', true, 3),
  ('cosmetics_care', 'Косметика и уход', true, 4),
  ('gadgets', 'Гаджеты и техника', true, 5),
  ('home_furniture', 'Дом и мебель', true, 6),
  ('other', 'Прочее', false, 7);

insert into public.presentation_presets (category_id, title, prompt, sort_order) values
  ('clothing_footwear', 'Студийный свет', 'Professional studio lighting, clean backdrop, fashion catalog look', 1),
  ('clothing_footwear', 'На модели', 'Worn by a model, natural pose, ecommerce lookbook', 2),
  ('clothing_footwear', 'На белом фоне', 'Isolated on pure white background, catalog cutout', 3),
  ('clothing_footwear', 'Lifestyle', 'Lifestyle scene, natural environment, editorial product photo', 4),
  ('accessories', 'Предметная съёмка', 'Product still life, controlled light, sharp details', 1),
  ('accessories', 'На модели', 'Accessory worn by a model, elegant close-up', 2),
  ('accessories', 'На белом фоне', 'Isolated on pure white background, catalog cutout', 3),
  ('accessories', 'Lifestyle', 'Lifestyle scene that shows the accessory in use', 4),
  ('food_drinks', 'На белом фоне', 'Isolated food or drink on white, commercial packshot', 1),
  ('food_drinks', 'Сервировка', 'Styled table setting, appetizing composition', 2),
  ('food_drinks', 'Крупный план', 'Appetizing close-up, rich texture and steam or condensation', 3),
  ('food_drinks', 'Lifestyle', 'Casual lifestyle scene around the food or drink', 4),
  ('cosmetics_care', 'На белом фоне', 'Clean beauty packshot on white', 1),
  ('cosmetics_care', 'Предметная съёмка', 'Still life with complementary props, premium lighting', 2),
  ('cosmetics_care', 'В интерьере', 'Bathroom or vanity lifestyle scene', 3),
  ('cosmetics_care', 'Lifestyle', 'In-use beauty lifestyle photo', 4),
  ('gadgets', 'На белом фоне', 'Tech packshot on white, sharp reflections', 1),
  ('gadgets', 'В руках', 'Device held in hands, natural scale', 2),
  ('gadgets', 'Технологичный фон', 'Modern dark or gradient tech backdrop', 3),
  ('gadgets', 'Lifestyle', 'Everyday lifestyle scene with the gadget', 4),
  ('home_furniture', 'В интерьере', 'Furniture or home item placed in a styled interior', 1),
  ('home_furniture', 'На белом фоне', 'Isolated catalog shot on white', 2),
  ('home_furniture', 'Деталь фактуры', 'Close-up of material and texture', 3),
  ('home_furniture', 'Lifestyle', 'Lived-in home lifestyle scene', 4);

insert into public.credit_packages (id, title, points, is_active, sort_order) values
  ('s', '100 баллов', 100, true, 1),
  ('m', '500 баллов', 500, true, 2),
  ('l', '1000 баллов', 1000, true, 3);

insert into public.generation_tariffs (generation_type, points_per_object) values
  ('photo', 40),
  ('card', 60);

insert into public.app_settings (key, value) values
  ('signup_bonus_points', '50');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'product-uploads',
    'product-uploads',
    false,
    10485760,
    array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
  ),
  (
    'generation-outputs',
    'generation-outputs',
    false,
    20971520,
    array['image/jpeg', 'image/png', 'image/webp']
  );

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  bonus integer;
  new_balance integer;
begin
  begin
    bonus := coalesce(
      nullif(trim((
        select s.value
        from public.app_settings as s
        where s.key = 'signup_bonus_points'
      )), '')::integer,
      0
    );
  exception
    when invalid_text_representation or numeric_value_out_of_range then
      bonus := 0;
  end;

  if bonus < 0 then
    bonus := 0;
  end if;

  insert into public.profiles (id, email, points_balance)
  values (new.id, new.email, bonus)
  returning points_balance into new_balance;

  if bonus > 0 then
    insert into public.balance_transactions (
      user_id, kind, amount, balance_after, note
    )
    values (
      new.id,
      'signup_bonus',
      bonus,
      new_balance,
      'Welcome bonus'
    );
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create or replace function private.prevent_delete_product_with_active_generations()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.generations as g
    where g.product_id = old.id
      and g.status in ('queued', 'running')
  ) then
    raise exception 'Cannot delete product with active generations'
      using errcode = 'P0001';
  end if;

  return old;
end;
$$;

create trigger products_block_delete_if_active
  before delete on public.products
  for each row execute function private.prevent_delete_product_with_active_generations();

create or replace function private.redeem_package(p_package_id text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  pkg public.credit_packages%rowtype;
  new_balance integer;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select *
  into pkg
  from public.credit_packages
  where id = p_package_id and is_active;

  if not found then
    raise exception 'Unknown package' using errcode = '22023';
  end if;

  update public.profiles
  set points_balance = points_balance + pkg.points
  where id = uid
  returning points_balance into new_balance;

  if not found then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;

  insert into public.balance_transactions (
    user_id, kind, amount, balance_after, package_id, note
  )
  values (
    uid,
    'topup',
    pkg.points,
    new_balance,
    pkg.id,
    'Package topup'
  );

  return new_balance;
end;
$$;

create or replace function private.start_generation(
  p_product_id uuid,
  p_generation_type text,
  p_presentation_preset_id uuid,
  p_wishes text,
  p_object_count integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  product_row public.products%rowtype;
  category_row public.categories%rowtype;
  points_each integer;
  total_cost integer;
  new_balance integer;
  generation_id uuid;
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if p_generation_type not in ('photo', 'card') then
    raise exception 'Invalid generation type' using errcode = '22023';
  end if;

  if p_object_count is null or p_object_count < 1 or p_object_count > 20 then
    raise exception 'Invalid object count' using errcode = '22023';
  end if;

  if p_wishes is not null and char_length(p_wishes) > 2000 then
    raise exception 'Wishes are too long' using errcode = '22023';
  end if;

  select *
  into product_row
  from public.products
  where id = p_product_id and user_id = uid;

  if not found then
    raise exception 'Product not found' using errcode = 'P0002';
  end if;

  if product_row.classification_status is distinct from 'succeeded'
     or product_row.category_id is null then
    raise exception 'Product is not classified' using errcode = '22023';
  end if;

  select *
  into category_row
  from public.categories
  where id = product_row.category_id;

  if category_row.id is not null and category_row.has_presets then
    if p_presentation_preset_id is null then
      raise exception 'Presentation preset is required' using errcode = '22023';
    end if;

    if not exists (
      select 1
      from public.presentation_presets as pp
      where pp.id = p_presentation_preset_id
        and pp.category_id = category_row.id
    ) then
      raise exception 'Presentation preset does not match category' using errcode = '22023';
    end if;
  else
    p_presentation_preset_id := null;
  end if;

  select t.points_per_object
  into points_each
  from public.generation_tariffs as t
  where t.generation_type = p_generation_type;

  if not found then
    raise exception 'Tariff not configured' using errcode = 'P0002';
  end if;

  total_cost := points_each * p_object_count;

  update public.profiles
  set points_balance = points_balance - total_cost
  where id = uid and points_balance >= total_cost
  returning points_balance into new_balance;

  if not found then
    raise exception 'Insufficient points' using errcode = 'P0001';
  end if;

  insert into public.generations (
    user_id,
    product_id,
    generation_type,
    presentation_preset_id,
    wishes,
    object_count,
    cost_points,
    status
  )
  values (
    uid,
    product_row.id,
    p_generation_type,
    p_presentation_preset_id,
    p_wishes,
    p_object_count,
    total_cost,
    'queued'
  )
  returning id into generation_id;

  insert into public.balance_transactions (
    user_id, kind, amount, balance_after, generation_id, note
  )
  values (
    uid,
    'generation_spend',
    -total_cost,
    new_balance,
    generation_id,
    'Generation charge'
  );

  return generation_id;
end;
$$;

create or replace function private.delete_product(p_product_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if not exists (
    select 1
    from public.products as p
    where p.id = p_product_id and p.user_id = uid
  ) then
    raise exception 'Product not found' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.generations as g
    where g.product_id = p_product_id
      and g.status in ('queued', 'running')
  ) then
    raise exception 'Cannot delete product with active generations'
      using errcode = 'P0001';
  end if;

  delete from public.products
  where id = p_product_id and user_id = uid;
end;
$$;

create or replace function public.redeem_package(p_package_id text)
returns integer
language sql
security invoker
set search_path = ''
as $$
  select private.redeem_package(p_package_id);
$$;

create or replace function public.start_generation(
  p_product_id uuid,
  p_generation_type text,
  p_presentation_preset_id uuid,
  p_wishes text,
  p_object_count integer
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.start_generation(
    p_product_id,
    p_generation_type,
    p_presentation_preset_id,
    p_wishes,
    p_object_count
  );
$$;

create or replace function public.delete_product(p_product_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.delete_product(p_product_id);
$$;

revoke all on function public.redeem_package(text) from public, anon;
revoke all on function public.start_generation(uuid, text, uuid, text, integer) from public, anon;
revoke all on function public.delete_product(uuid) from public, anon;
revoke all on function private.redeem_package(text) from public, anon;
revoke all on function private.start_generation(uuid, text, uuid, text, integer) from public, anon;
revoke all on function private.delete_product(uuid) from public, anon;
revoke all on function private.set_updated_at() from public, anon, authenticated;
revoke all on function private.handle_new_user() from public, anon, authenticated;
revoke all on function private.prevent_delete_product_with_active_generations() from public, anon, authenticated;

grant execute on function public.redeem_package(text) to authenticated;
grant execute on function public.start_generation(uuid, text, uuid, text, integer) to authenticated;
grant execute on function public.delete_product(uuid) to authenticated;
grant execute on function private.redeem_package(text) to authenticated;
grant execute on function private.start_generation(uuid, text, uuid, text, integer) to authenticated;
grant execute on function private.delete_product(uuid) to authenticated;
grant execute on function private.handle_new_user() to postgres, supabase_auth_admin, service_role;
grant execute on function private.set_updated_at() to postgres, service_role;
grant execute on function private.prevent_delete_product_with_active_generations() to postgres, service_role;

alter default privileges in schema private revoke execute on functions from public;
alter default privileges in schema public
  revoke all on tables from public, anon, authenticated;
alter default privileges in schema public
  revoke all on functions from public, anon, authenticated;
alter default privileges in schema public
  revoke all on sequences from public, anon, authenticated;

alter table public.categories enable row level security;
alter table public.presentation_presets enable row level security;
alter table public.credit_packages enable row level security;
alter table public.generation_tariffs enable row level security;
alter table public.app_settings enable row level security;
alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.generations enable row level security;
alter table public.generation_assets enable row level security;
alter table public.balance_transactions enable row level security;

create policy "Reference data is readable"
  on public.categories for select
  to anon, authenticated
  using (true);

create policy "Presets are readable"
  on public.presentation_presets for select
  to anon, authenticated
  using (true);

create policy "Packages are readable"
  on public.credit_packages for select
  to anon, authenticated
  using (true);

create policy "Tariffs are readable"
  on public.generation_tariffs for select
  to anon, authenticated
  using (true);

create policy "Settings are readable"
  on public.app_settings for select
  to anon, authenticated
  using (key = 'signup_bonus_points');

create policy "Users read own profile"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "Users read own products"
  on public.products for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users insert own products"
  on public.products for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and classification_status = 'pending'
    and category_id is null
    and detected_label is null
    and source_path like (select auth.uid())::text || '/%'
  );

create policy "Users read own generations"
  on public.generations for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users read own generation assets"
  on public.generation_assets for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users read own balance transactions"
  on public.balance_transactions for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table
  public.categories, public.presentation_presets, public.credit_packages,
  public.generation_tariffs, public.app_settings, public.profiles,
  public.products, public.generations, public.generation_assets,
  public.balance_transactions
from public, anon, authenticated;

grant select on public.categories, public.presentation_presets,
  public.credit_packages, public.generation_tariffs, public.app_settings
to anon, authenticated;

grant select on public.profiles, public.generations,
  public.generation_assets, public.balance_transactions to authenticated;

grant select, insert on public.products to authenticated;

create policy "Users manage own product uploads"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'product-uploads'
    and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub')
  );

create policy "Users upload own product photos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'product-uploads'
    and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub')
  );

create policy "Users update own product photos"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'product-uploads'
    and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub')
  )
  with check (
    bucket_id = 'product-uploads'
    and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub')
  );

create policy "Users delete own product photos"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'product-uploads'
    and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub')
  );

create policy "Users read own generation outputs"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'generation-outputs'
    and (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub')
  );

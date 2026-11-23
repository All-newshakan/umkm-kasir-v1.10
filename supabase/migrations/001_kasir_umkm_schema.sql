-- ============================================================================
-- KASIR UMKM - Full PostgreSQL + Row Level Security (RLS) Schema for Supabase
-- ============================================================================
-- Jalankan seluruh script ini di Supabase Dashboard -> SQL Editor -> New query
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. PROFILES
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  display_name text not null default '',
  avatar_url text not null default '',
  active_store_id uuid,
  role text not null default 'OWNER' check (role in ('OWNER', 'KASIR', 'STAFF')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 2. STORES
-- ----------------------------------------------------------------------------
create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  business_type text not null default 'Warung / Sembako',
  logo_icon_key text not null default 'STORE',
  logo_base64 text,
  theme_palette_key text not null default 'EMERALD',
  address text not null default '',
  whatsapp text not null default '',
  email text not null default '',
  owner_name text not null default '',
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Foreign key opsional dari profiles.active_store_id ke stores.id
do $$
begin
  if not exists (
    select 1
    from information_schema.table_constraints
    where constraint_name = 'profiles_active_store_fk'
      and table_name = 'profiles'
  ) then
    alter table public.profiles
      add constraint profiles_active_store_fk
      foreign key (active_store_id) references public.stores(id) on delete set null;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 3. STORE MEMBERS (OWNER / KASIR / STAFF + INVITES)
-- ----------------------------------------------------------------------------
create table if not exists public.store_members (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null default '',
  role text not null default 'KASIR' check (role in ('OWNER', 'KASIR', 'STAFF')),
  active boolean not null default true,
  status text not null default 'ACTIVE' check (status in ('PENDING', 'ACTIVE', 'REVOKED')),
  can_access_kasir boolean not null default true,
  can_manage_products boolean not null default false,
  can_manage_categories boolean not null default false,
  can_view_transactions boolean not null default true,
  can_view_reports boolean not null default false,
  can_manage_settings boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, email)
);

-- ----------------------------------------------------------------------------
-- 4. STORE SETTINGS
-- ----------------------------------------------------------------------------
create table if not exists public.store_settings (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null unique references public.stores(id) on delete cascade,
  receipt_footer text not null default 'Terima kasih telah berbelanja!',
  tax_percent numeric(5,2) not null default 0,
  default_discount_percent numeric(5,2) not null default 0,
  payment_gateway_provider text not null default 'MIDTRANS',
  bank_transfer_info text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 5. CATEGORIES
-- ----------------------------------------------------------------------------
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  color_hex text not null default '#16A34A',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 6. PRODUCTS
-- ----------------------------------------------------------------------------
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  category_name text not null default 'Umum',
  name text not null,
  barcode text not null default '',
  cost_price integer not null default 0 check (cost_price >= 0),
  sell_price integer not null default 0 check (sell_price >= 0),
  stock integer not null default 0 check (stock >= 0),
  unit text not null default 'pcs',
  min_stock_alert integer not null default 5 check (min_stock_alert >= 0),
  image_base64 text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 7. CUSTOMERS
-- ----------------------------------------------------------------------------
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  phone text not null default '',
  email text not null default '',
  address text not null default '',
  notes text not null default '',
  loyalty_points integer not null default 0 check (loyalty_points >= 0),
  total_spent bigint not null default 0 check (total_spent >= 0),
  visit_count integer not null default 0 check (visit_count >= 0),
  last_purchase_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 8. TRANSACTIONS
-- ----------------------------------------------------------------------------
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  invoice_number text not null,
  cashier_id uuid references auth.users(id) on delete set null,
  cashier_name text not null default 'Kasir',
  customer_id uuid references public.customers(id) on delete set null,
  customer_name text,
  note text not null default '',
  subtotal integer not null default 0,
  discount_amount integer not null default 0,
  discount_type text not null default 'NOMINAL' check (discount_type in ('NOMINAL', 'PERCENT')),
  tax_amount integer not null default 0,
  total_amount integer not null default 0,
  total_cost integer not null default 0,
  total_profit integer not null default 0,
  points_earned integer not null default 0,
  points_redeemed integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 9. TRANSACTION DETAILS
-- ----------------------------------------------------------------------------
create table if not exists public.transaction_details (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  category_id uuid references public.categories(id) on delete set null,
  category_name text not null default 'Umum',
  unit text not null default 'pcs',
  quantity integer not null default 1 check (quantity > 0),
  cost_price integer not null default 0,
  sell_price integer not null default 0,
  discount_type text not null default 'NOMINAL',
  discount_value integer not null default 0,
  discount_amount integer not null default 0,
  line_total integer not null default 0,
  line_profit integer not null default 0,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 10. PAYMENTS
-- ----------------------------------------------------------------------------
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  payment_method text not null default 'TUNAI',
  payment_status text not null default 'VERIFIED',
  gateway_provider text not null default '',
  gateway_order_id text not null default '',
  amount integer not null default 0,
  cash_received integer not null default 0,
  change_amount integer not null default 0,
  paid_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- INDEXES
-- ----------------------------------------------------------------------------
create index if not exists idx_stores_owner on public.stores(owner_id);
create index if not exists idx_store_members_store on public.store_members(store_id);
create index if not exists idx_store_members_user on public.store_members(user_id);
create index if not exists idx_store_members_email on public.store_members(lower(email));
create index if not exists idx_categories_store on public.categories(store_id);
create index if not exists idx_products_store on public.products(store_id);
create index if not exists idx_products_category on public.products(category_id);
create index if not exists idx_customers_store on public.customers(store_id);
create index if not exists idx_transactions_store_created on public.transactions(store_id, created_at desc);
create index if not exists idx_tx_details_tx on public.transaction_details(transaction_id);
create index if not exists idx_tx_details_store on public.transaction_details(store_id);
create index if not exists idx_payments_tx on public.payments(transaction_id);
create index if not exists idx_payments_store on public.payments(store_id);

-- ----------------------------------------------------------------------------
-- AUTOMATIC UPDATED_AT & PROFILE TRIGGER
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated on public.profiles;
create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists trg_stores_updated on public.stores;
create trigger trg_stores_updated before update on public.stores
  for each row execute function public.set_updated_at();

drop trigger if exists trg_store_members_updated on public.store_members;
create trigger trg_store_members_updated before update on public.store_members
  for each row execute function public.set_updated_at();

drop trigger if exists trg_store_settings_updated on public.store_settings;
create trigger trg_store_settings_updated before update on public.store_settings
  for each row execute function public.set_updated_at();

drop trigger if exists trg_categories_updated on public.categories;
create trigger trg_categories_updated before update on public.categories
  for each row execute function public.set_updated_at();

drop trigger if exists trg_products_updated on public.products;
create trigger trg_products_updated before update on public.products
  for each row execute function public.set_updated_at();

drop trigger if exists trg_customers_updated on public.customers;
create trigger trg_customers_updated before update on public.customers
  for each row execute function public.set_updated_at();

drop trigger if exists trg_transactions_updated on public.transactions;
create trigger trg_transactions_updated before update on public.transactions
  for each row execute function public.set_updated_at();

-- Buat profil otomatis setiap user baru mendaftar via Google OAuth atau Email
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    lower(coalesce(new.email, '')),
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(coalesce(new.email, 'Pengguna'), '@', 1)
    ),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', '')
  )
  on conflict (id) do update
    set email = excluded.email,
        display_name = coalesce(nullif(public.profiles.display_name, ''), excluded.display_name),
        avatar_url = coalesce(nullif(excluded.avatar_url, ''), public.profiles.avatar_url),
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- RLS HELPER FUNCTIONS (SECURITY DEFINER UNTUK ISOLASI TOKO)
-- ----------------------------------------------------------------------------
create or replace function public.current_user_email()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

create or replace function public.is_store_owner(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.stores s
    where s.id = p_store_id
      and s.owner_id = auth.uid()
  )
  or exists (
    select 1
    from public.store_members sm
    where sm.store_id = p_store_id
      and sm.user_id = auth.uid()
      and sm.role = 'OWNER'
      and sm.active = true
      and sm.status = 'ACTIVE'
  );
$$;

create or replace function public.is_store_member(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_store_owner(p_store_id)
  or exists (
    select 1
    from public.store_members sm
    where sm.store_id = p_store_id
      and sm.user_id = auth.uid()
      and sm.active = true
      and sm.status = 'ACTIVE'
  );
$$;

create or replace function public.has_store_permission(p_store_id uuid, p_perm text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_store_owner(p_store_id)
  or exists (
    select 1
    from public.store_members sm
    where sm.store_id = p_store_id
      and sm.user_id = auth.uid()
      and sm.active = true
      and sm.status = 'ACTIVE'
      and (
        (p_perm = 'kasir' and sm.can_access_kasir)
        or (p_perm = 'products' and sm.can_manage_products)
        or (p_perm = 'categories' and sm.can_manage_categories)
        or (p_perm = 'transactions' and sm.can_view_transactions)
        or (p_perm = 'reports' and sm.can_view_reports)
        or (p_perm = 'settings' and sm.can_manage_settings)
      )
  );
$$;

-- ----------------------------------------------------------------------------
-- ATOMIC RPC FUNCTIONS (UNTUK PEMBUATAN TOKO, UNDANGAN, & CHECKOUT KASIR)
-- ----------------------------------------------------------------------------
create or replace function public.create_store_with_owner(
  p_name text,
  p_business_type text,
  p_address text,
  p_whatsapp text,
  p_owner_name text,
  p_description text default '',
  p_logo_icon_key text default 'STORE',
  p_theme_palette_key text default 'EMERALD',
  p_logo_base64 text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := public.current_user_email();
  v_store_id uuid;
  v_owner_display text;
begin
  if v_uid is null then
    raise exception 'Pengguna harus login terlebih dahulu.';
  end if;

  if trim(coalesce(p_name, '')) = '' then
    raise exception 'Nama toko wajib diisi.';
  end if;

  v_owner_display := coalesce(nullif(trim(p_owner_name), ''), split_part(v_email, '@', 1), 'Pemilik Toko');

  insert into public.stores (
    owner_id, name, business_type, logo_icon_key, logo_base64,
    theme_palette_key, address, whatsapp, email, owner_name, description
  ) values (
    v_uid,
    left(trim(p_name), 60),
    left(coalesce(nullif(trim(p_business_type), ''), 'Warung / Sembako'), 60),
    coalesce(nullif(trim(p_logo_icon_key), ''), 'STORE'),
    p_logo_base64,
    coalesce(nullif(trim(p_theme_palette_key), ''), 'EMERALD'),
    left(trim(coalesce(p_address, '')), 240),
    left(trim(coalesce(p_whatsapp, '')), 40),
    left(v_email, 160),
    left(v_owner_display, 100),
    left(trim(coalesce(p_description, '')), 300)
  )
  returning id into v_store_id;

  insert into public.store_settings (store_id)
  values (v_store_id);

  insert into public.store_members (
    store_id, user_id, email, display_name, role, active, status,
    can_access_kasir, can_manage_products, can_manage_categories,
    can_view_transactions, can_view_reports, can_manage_settings
  ) values (
    v_store_id, v_uid, v_email, left(v_owner_display, 100), 'OWNER', true, 'ACTIVE',
    true, true, true, true, true, true
  );

  insert into public.profiles (id, email, display_name, active_store_id, role)
  values (v_uid, v_email, left(v_owner_display, 100), v_store_id, 'OWNER')
  on conflict (id) do update
    set active_store_id = v_store_id,
        role = 'OWNER',
        display_name = coalesce(nullif(public.profiles.display_name, ''), excluded.display_name),
        updated_at = now();

  return v_store_id;
end;
$$;

create or replace function public.accept_store_invite(
  p_member_id uuid,
  p_display_name text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := public.current_user_email();
  v_store_id uuid;
  v_staff_name text;
begin
  if v_uid is null then
    raise exception 'Pengguna harus login terlebih dahulu.';
  end if;

  select store_id, display_name
    into v_store_id, v_staff_name
  from public.store_members
  where id = p_member_id
    and lower(email) = v_email
    and status = 'PENDING'
  limit 1;

  if v_store_id is null then
    raise exception 'Undangan tidak ditemukan atau bukan untuk akun ini.';
  end if;

  v_staff_name := coalesce(nullif(trim(p_display_name), ''), v_staff_name, 'Kasir');

  update public.store_members
     set user_id = v_uid,
         display_name = left(v_staff_name, 100),
         status = 'ACTIVE',
         active = true,
         updated_at = now()
   where id = p_member_id;

  insert into public.profiles (id, email, display_name, active_store_id, role)
  values (v_uid, v_email, left(v_staff_name, 100), v_store_id, 'KASIR')
  on conflict (id) do update
    set active_store_id = v_store_id,
        role = 'KASIR',
        updated_at = now();

  return v_store_id;
end;
$$;

create or replace function public.complete_pos_checkout(
  p_store_id uuid,
  p_invoice_number text,
  p_cashier_name text,
  p_note text,
  p_discount_type text,
  p_discount_amount integer,
  p_tax_amount integer,
  p_payment_method text,
  p_gateway_provider text,
  p_gateway_order_id text,
  p_cash_received integer,
  p_customer_id uuid,
  p_customer_name text,
  p_points_redeemed integer,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_tx_id uuid;
  v_subtotal integer := 0;
  v_total_cost integer := 0;
  v_clamped_discount integer := 0;
  v_tax integer := greatest(0, coalesce(p_tax_amount, 0));
  v_total_amount integer := 0;
  v_total_profit integer := 0;
  v_points_redeemed integer := 0;
  v_points_earned integer := 0;
  v_cash_received integer := 0;
  v_change_amount integer := 0;
  v_item jsonb;
  v_qty integer;
  v_line_total integer;
  v_cost_price integer;
  v_prod_id uuid;
begin
  if v_uid is null or not public.has_store_permission(p_store_id, 'kasir') then
    raise exception 'Anda tidak memiliki izin kasir untuk toko ini.';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Keranjang belanja kosong.';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := greatest(1, coalesce((v_item ->> 'quantity')::integer, 1));
    v_cost_price := greatest(0, coalesce((v_item ->> 'costPrice')::integer, 0));
    v_line_total := greatest(0, coalesce((v_item ->> 'lineTotal')::integer, 0));
    v_subtotal := v_subtotal + v_line_total;
    v_total_cost := v_total_cost + (v_cost_price * v_qty);
  end loop;

  v_clamped_discount := least(v_subtotal, greatest(0, coalesce(p_discount_amount, 0)));
  v_total_amount := greatest(0, v_subtotal - v_clamped_discount + v_tax);
  v_total_profit := v_total_amount - v_tax - v_total_cost;

  if p_customer_id is not null then
    v_points_redeemed := greatest(0, coalesce(p_points_redeemed, 0));
    v_points_earned := floor(v_total_amount / 10000);
  end if;

  if upper(coalesce(p_payment_method, 'TUNAI')) = 'TUNAI' then
    v_cash_received := greatest(v_total_amount, coalesce(p_cash_received, v_total_amount));
    v_change_amount := greatest(0, v_cash_received - v_total_amount);
  else
    v_cash_received := v_total_amount;
    v_change_amount := 0;
  end if;

  insert into public.transactions (
    store_id, invoice_number, cashier_id, cashier_name,
    customer_id, customer_name, note,
    subtotal, discount_amount, discount_type, tax_amount,
    total_amount, total_cost, total_profit,
    points_earned, points_redeemed
  ) values (
    p_store_id,
    p_invoice_number,
    v_uid,
    left(coalesce(nullif(trim(p_cashier_name), ''), 'Kasir'), 100),
    p_customer_id,
    case when p_customer_id is not null then left(coalesce(p_customer_name, ''), 100) else null end,
    left(trim(coalesce(p_note, '')), 240),
    v_subtotal,
    v_clamped_discount,
    case when p_discount_type = 'PERCENT' then 'PERCENT' else 'NOMINAL' end,
    v_tax,
    v_total_amount,
    v_total_cost,
    v_total_profit,
    v_points_earned,
    v_points_redeemed
  )
  returning id into v_tx_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := greatest(1, coalesce((v_item ->> 'quantity')::integer, 1));
    v_prod_id := nullif(v_item ->> 'productId', '')::uuid;

    insert into public.transaction_details (
      transaction_id, store_id, product_id, product_name,
      category_id, category_name, unit, quantity,
      cost_price, sell_price, discount_type, discount_value,
      discount_amount, line_total, line_profit
    ) values (
      v_tx_id,
      p_store_id,
      v_prod_id,
      coalesce(v_item ->> 'productName', 'Produk'),
      nullif(v_item ->> 'categoryId', '')::uuid,
      coalesce(nullif(v_item ->> 'categoryName', ''), 'Umum'),
      coalesce(nullif(v_item ->> 'unit', ''), 'pcs'),
      v_qty,
      greatest(0, coalesce((v_item ->> 'costPrice')::integer, 0)),
      greatest(0, coalesce((v_item ->> 'sellPrice')::integer, 0)),
      case when (v_item ->> 'discountType') = 'PERCENT' then 'PERCENT' else 'NOMINAL' end,
      greatest(0, coalesce((v_item ->> 'discountValue')::integer, 0)),
      greatest(0, coalesce((v_item ->> 'discountAmount')::integer, 0)),
      greatest(0, coalesce((v_item ->> 'lineTotal')::integer, 0)),
      coalesce((v_item ->> 'lineProfit')::integer, 0)
    );

    if v_prod_id is not null then
      update public.products
         set stock = greatest(0, stock - v_qty),
             updated_at = now()
       where id = v_prod_id
         and store_id = p_store_id;
    end if;
  end loop;

  insert into public.payments (
    transaction_id, store_id, payment_method, payment_status,
    gateway_provider, gateway_order_id, amount, cash_received, change_amount
  ) values (
    v_tx_id,
    p_store_id,
    coalesce(nullif(trim(p_payment_method), ''), 'TUNAI'),
    'VERIFIED',
    left(coalesce(p_gateway_provider, ''), 32),
    left(coalesce(p_gateway_order_id, ''), 128),
    v_total_amount,
    v_cash_received,
    v_change_amount
  );

  if p_customer_id is not null then
    update public.customers
       set loyalty_points = greatest(0, loyalty_points - v_points_redeemed + v_points_earned),
           total_spent = total_spent + v_total_amount,
           visit_count = visit_count + 1,
           last_purchase_at = now(),
           updated_at = now()
     where id = p_customer_id
       and store_id = p_store_id;
  end if;

  return jsonb_build_object(
    'transactionId', v_tx_id,
    'invoiceNumber', p_invoice_number,
    'subtotal', v_subtotal,
    'discountAmount', v_clamped_discount,
    'taxAmount', v_tax,
    'totalAmount', v_total_amount,
    'totalCost', v_total_cost,
    'totalProfit', v_total_profit,
    'pointsEarned', v_points_earned,
    'pointsRedeemed', v_points_redeemed,
    'cashReceived', v_cash_received,
    'changeAmount', v_change_amount
  );
end;
$$;

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) UNTUK SELURUH 10 TABEL
-- ============================================================================
alter table public.profiles enable row level security;
alter table public.stores enable row level security;
alter table public.store_members enable row level security;
alter table public.store_settings enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.customers enable row level security;
alter table public.transactions enable row level security;
alter table public.transaction_details enable row level security;
alter table public.payments enable row level security;

-- 1. PROFILES: hanya pemilik akun sendiri
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using (id = auth.uid());

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- 2. STORES: hanya anggota aktif (atau penerima undangan pending) dapat melihat; hanya owner mengubah/menghapus
drop policy if exists "stores_select_member" on public.stores;
create policy "stores_select_member" on public.stores
  for select to authenticated
  using (
    public.is_store_member(id)
    or exists (
      select 1 from public.store_members sm
      where sm.store_id = stores.id
        and lower(sm.email) = public.current_user_email()
        and sm.status = 'PENDING'
    )
  );

drop policy if exists "stores_insert_owner" on public.stores;
create policy "stores_insert_owner" on public.stores
  for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists "stores_update_owner_or_settings" on public.stores;
create policy "stores_update_owner_or_settings" on public.stores
  for update to authenticated
  using (public.has_store_permission(id, 'settings'))
  with check (public.has_store_permission(id, 'settings'));

drop policy if exists "stores_delete_owner" on public.stores;
create policy "stores_delete_owner" on public.stores
  for delete to authenticated
  using (owner_id = auth.uid());

-- 3. STORE MEMBERS: anggota toko melihat rekan setoko; calon staf melihat undangan email-nya; hanya owner kelola anggota
drop policy if exists "store_members_select" on public.store_members;
create policy "store_members_select" on public.store_members
  for select to authenticated
  using (
    user_id = auth.uid()
    or lower(email) = public.current_user_email()
    or public.is_store_owner(store_id)
  );

drop policy if exists "store_members_insert_owner" on public.store_members;
create policy "store_members_insert_owner" on public.store_members
  for insert to authenticated
  with check (public.is_store_owner(store_id));

drop policy if exists "store_members_update_owner" on public.store_members;
create policy "store_members_update_owner" on public.store_members
  for update to authenticated
  using (public.is_store_owner(store_id))
  with check (public.is_store_owner(store_id));

drop policy if exists "store_members_delete_owner" on public.store_members;
create policy "store_members_delete_owner" on public.store_members
  for delete to authenticated
  using (public.is_store_owner(store_id));

-- 4. STORE SETTINGS
drop policy if exists "store_settings_select" on public.store_settings;
create policy "store_settings_select" on public.store_settings
  for select to authenticated
  using (public.is_store_member(store_id));

drop policy if exists "store_settings_write" on public.store_settings;
create policy "store_settings_write" on public.store_settings
  for all to authenticated
  using (public.has_store_permission(store_id, 'settings'))
  with check (public.has_store_permission(store_id, 'settings'));

-- 5. CATEGORIES
drop policy if exists "categories_select" on public.categories;
create policy "categories_select" on public.categories
  for select to authenticated
  using (public.is_store_member(store_id));

drop policy if exists "categories_write" on public.categories;
create policy "categories_write" on public.categories
  for all to authenticated
  using (public.has_store_permission(store_id, 'categories'))
  with check (public.has_store_permission(store_id, 'categories'));

-- 6. PRODUCTS
drop policy if exists "products_select" on public.products;
create policy "products_select" on public.products
  for select to authenticated
  using (public.is_store_member(store_id));

drop policy if exists "products_insert_update_delete" on public.products;
create policy "products_insert_update_delete" on public.products
  for all to authenticated
  using (public.has_store_permission(store_id, 'products'))
  with check (public.has_store_permission(store_id, 'products'));

-- 7. CUSTOMERS
drop policy if exists "customers_select" on public.customers;
create policy "customers_select" on public.customers
  for select to authenticated
  using (public.is_store_member(store_id));

drop policy if exists "customers_write" on public.customers;
create policy "customers_write" on public.customers
  for all to authenticated
  using (public.is_store_member(store_id))
  with check (public.is_store_member(store_id));

-- 8. TRANSACTIONS
drop policy if exists "transactions_select" on public.transactions;
create policy "transactions_select" on public.transactions
  for select to authenticated
  using (
    public.has_store_permission(store_id, 'transactions')
    or public.has_store_permission(store_id, 'reports')
    or cashier_id = auth.uid()
  );

drop policy if exists "transactions_insert" on public.transactions;
create policy "transactions_insert" on public.transactions
  for insert to authenticated
  with check (public.has_store_permission(store_id, 'kasir'));

-- 9. TRANSACTION DETAILS
drop policy if exists "transaction_details_select" on public.transaction_details;
create policy "transaction_details_select" on public.transaction_details
  for select to authenticated
  using (
    public.has_store_permission(store_id, 'transactions')
    or public.has_store_permission(store_id, 'reports')
    or public.is_store_member(store_id)
  );

drop policy if exists "transaction_details_insert" on public.transaction_details;
create policy "transaction_details_insert" on public.transaction_details
  for insert to authenticated
  with check (public.has_store_permission(store_id, 'kasir'));

-- 10. PAYMENTS
drop policy if exists "payments_select" on public.payments;
create policy "payments_select" on public.payments
  for select to authenticated
  using (
    public.has_store_permission(store_id, 'transactions')
    or public.has_store_permission(store_id, 'reports')
    or public.is_store_member(store_id)
  );

drop policy if exists "payments_insert" on public.payments;
create policy "payments_insert" on public.payments
  for insert to authenticated
  with check (public.has_store_permission(store_id, 'kasir'));

-- Aktifkan Realtime publication untuk sinkronisasi otomatis antar perangkat (opsional & aman)
do $$
begin
  alter publication supabase_realtime add table
    public.profiles,
    public.stores,
    public.store_members,
    public.store_settings,
    public.categories,
    public.products,
    public.customers,
    public.transactions;
exception
  when others then null;
end $$;

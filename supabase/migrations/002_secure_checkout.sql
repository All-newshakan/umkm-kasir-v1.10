-- Secure checkout: use database product prices/costs, validate stock and recompute totals.
-- Apply after 001_kasir_umkm_schema.sql in Supabase SQL Editor.

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
  v_cart_discount integer := greatest(0, coalesce(p_discount_amount, 0));
  v_tax_percent numeric(5,2) := 0;
  v_tax integer := 0;
  v_taxable_base integer := 0;
  v_total_amount integer := 0;
  v_total_profit integer := 0;
  v_points_redeemed integer := greatest(0, coalesce(p_points_redeemed, 0));
  v_points_earned integer := 0;
  v_customer_points integer := 0;
  v_cash_received integer := 0;
  v_change_amount integer := 0;
  v_item jsonb;
  v_product public.products%rowtype;
  v_prod_id uuid;
  v_qty integer;
  v_gross integer;
  v_line_discount integer;
  v_line_total integer;
  v_discount_type text;
  v_discount_value integer;
  v_line_index integer := 0;
begin
  if v_uid is null or not public.has_store_permission(p_store_id, 'kasir') then
    raise exception 'Anda tidak memiliki izin kasir untuk toko ini.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0
     or jsonb_array_length(p_items) > 100 then
    raise exception 'Keranjang belanja tidak valid.';
  end if;

  if upper(coalesce(p_payment_method, '')) not in
     ('TUNAI', 'QRIS', 'VIRTUAL_ACCOUNT', 'EWALLET', 'TRANSFER') then
    raise exception 'Metode pembayaran tidak valid.';
  end if;

  select coalesce(ss.tax_percent, 0)
    into v_tax_percent
  from public.store_settings ss
  where ss.store_id = p_store_id;

  v_tax_percent := greatest(0, least(100, coalesce(v_tax_percent, 0)));

  -- Lock each product and calculate using authoritative database prices/costs.
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_line_index := v_line_index + 1;
    v_prod_id := nullif(v_item ->> 'productId', '')::uuid;
    v_qty := coalesce((v_item ->> 'quantity')::integer, 0);

    if v_prod_id is null or v_qty < 1 or v_qty > 100000 then
      raise exception 'Produk atau jumlah pada baris % tidak valid.', v_line_index;
    end if;

    select * into v_product
    from public.products
    where id = v_prod_id and store_id = p_store_id
    for update;

    if not found then
      raise exception 'Produk tidak ditemukan pada toko ini.';
    end if;
    if v_product.stock < v_qty then
      raise exception 'Stok produk % tidak mencukupi. Stok tersedia: %.',
        v_product.name, v_product.stock;
    end if;

    v_gross := v_product.sell_price * v_qty;
    v_discount_type := case
      when upper(coalesce(v_item ->> 'discountType', 'NOMINAL')) = 'PERCENT'
      then 'PERCENT' else 'NOMINAL' end;
    v_discount_value := greatest(0, coalesce((v_item ->> 'discountValue')::integer, 0));

    if v_discount_type = 'PERCENT' then
      v_line_discount := round(v_gross * least(100, v_discount_value) / 100.0);
    else
      v_line_discount := least(v_gross, v_discount_value);
    end if;

    v_line_total := greatest(0, v_gross - v_line_discount);
    v_subtotal := v_subtotal + v_line_total;
    v_total_cost := v_total_cost + (v_product.cost_price * v_qty);
  end loop;

  if v_cart_discount > v_subtotal then
    raise exception 'Diskon melebihi subtotal transaksi.';
  end if;

  if p_customer_id is not null then
    select loyalty_points into v_customer_points
    from public.customers
    where id = p_customer_id and store_id = p_store_id
    for update;

    if not found then
      raise exception 'Pelanggan tidak ditemukan pada toko ini.';
    end if;
    if v_points_redeemed > v_customer_points then
      raise exception 'Poin pelanggan tidak mencukupi.';
    end if;
    if v_points_redeemed * 100 > v_cart_discount then
      raise exception 'Diskon tidak sesuai dengan poin yang digunakan.';
    end if;
  elsif v_points_redeemed > 0 then
    raise exception 'Poin hanya dapat digunakan untuk pelanggan terdaftar.';
  end if;

  v_taxable_base := greatest(0, v_subtotal - v_cart_discount);
  v_tax := round(v_taxable_base * v_tax_percent / 100.0);

  if greatest(0, coalesce(p_tax_amount, 0)) <> v_tax then
    raise exception 'Perhitungan pajak berubah. Muat ulang keranjang dan coba kembali.';
  end if;

  v_total_amount := v_taxable_base + v_tax;
  v_total_profit := v_total_amount - v_tax - v_total_cost;
  v_points_earned := case when p_customer_id is not null then floor(v_total_amount / 10000) else 0 end;

  if upper(p_payment_method) = 'TUNAI' then
    v_cash_received := greatest(0, coalesce(p_cash_received, 0));
    if v_cash_received < v_total_amount then
      raise exception 'Uang tunai yang diterima kurang dari total transaksi.';
    end if;
    v_change_amount := v_cash_received - v_total_amount;
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
    left(coalesce(p_invoice_number, ''), 80),
    v_uid,
    left(coalesce(nullif(trim(p_cashier_name), ''), 'Kasir'), 100),
    p_customer_id,
    case when p_customer_id is not null then left(coalesce(p_customer_name, ''), 100) else null end,
    left(trim(coalesce(p_note, '')), 240),
    v_subtotal,
    v_cart_discount,
    case when upper(coalesce(p_discount_type, '')) = 'PERCENT' then 'PERCENT' else 'NOMINAL' end,
    v_tax,
    v_total_amount,
    v_total_cost,
    v_total_profit,
    v_points_earned,
    v_points_redeemed
  )
  returning id into v_tx_id;

  -- Insert authoritative item snapshots and decrement stock atomically.
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_prod_id := nullif(v_item ->> 'productId', '')::uuid;
    v_qty := (v_item ->> 'quantity')::integer;

    select * into v_product
    from public.products
    where id = v_prod_id and store_id = p_store_id
    for update;

    if not found or v_product.stock < v_qty then
      raise exception 'Stok berubah selama checkout. Silakan muat ulang keranjang.';
    end if;

    v_gross := v_product.sell_price * v_qty;
    v_discount_type := case
      when upper(coalesce(v_item ->> 'discountType', 'NOMINAL')) = 'PERCENT'
      then 'PERCENT' else 'NOMINAL' end;
    v_discount_value := greatest(0, coalesce((v_item ->> 'discountValue')::integer, 0));

    if v_discount_type = 'PERCENT' then
      v_line_discount := round(v_gross * least(100, v_discount_value) / 100.0);
    else
      v_line_discount := least(v_gross, v_discount_value);
    end if;
    v_line_total := greatest(0, v_gross - v_line_discount);

    insert into public.transaction_details (
      transaction_id, store_id, product_id, product_name,
      category_id, category_name, unit, quantity,
      cost_price, sell_price, discount_type, discount_value,
      discount_amount, line_total, line_profit
    ) values (
      v_tx_id,
      p_store_id,
      v_product.id,
      v_product.name,
      v_product.category_id,
      coalesce(v_product.category_name, 'Umum'),
      coalesce(v_product.unit, 'pcs'),
      v_qty,
      v_product.cost_price,
      v_product.sell_price,
      v_discount_type,
      v_discount_value,
      v_line_discount,
      v_line_total,
      v_line_total - (v_product.cost_price * v_qty)
    );

    update public.products
       set stock = stock - v_qty,
           updated_at = now()
     where id = v_product.id
       and store_id = p_store_id
       and stock >= v_qty;

    if not found then
      raise exception 'Stok produk tidak mencukupi.';
    end if;
  end loop;

  insert into public.payments (
    transaction_id, store_id, payment_method, payment_status,
    gateway_provider, gateway_order_id, amount, cash_received, change_amount
  ) values (
    v_tx_id,
    p_store_id,
    upper(p_payment_method),
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
     where id = p_customer_id and store_id = p_store_id;
  end if;

  return jsonb_build_object(
    'transactionId', v_tx_id,
    'invoiceNumber', p_invoice_number,
    'subtotal', v_subtotal,
    'discountAmount', v_cart_discount,
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

revoke all on function public.complete_pos_checkout(
  uuid, text, text, text, text, integer, integer, text, text, text,
  integer, uuid, text, integer, jsonb
) from public;

grant execute on function public.complete_pos_checkout(
  uuid, text, text, text, text, integer, integer, text, text, text,
  integer, uuid, text, integer, jsonb
) to authenticated;

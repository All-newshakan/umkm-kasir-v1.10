-- ============================================================================
-- KASIR UMKM: simpan pengaturan toko secara atomik dengan validasi hak akses.
-- Jalankan sekali di Supabase SQL Editor sebelum memasang APK hasil build baru.
-- ============================================================================
create or replace function public.save_store_settings(
  p_store_id uuid,
  p_name text,
  p_business_type text,
  p_logo_icon_key text,
  p_logo_base64 text,
  p_theme_palette_key text,
  p_address text,
  p_whatsapp text,
  p_email text,
  p_owner_name text,
  p_description text,
  p_receipt_footer text,
  p_tax_percent numeric,
  p_default_discount_percent numeric,
  p_bank_transfer_info text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Sesi login tidak ditemukan. Silakan masuk kembali.'
      using errcode = '28000';
  end if;

  if not public.has_store_permission(p_store_id, 'settings') then
    raise exception 'Akun ini bukan pemilik toko atau anggota aktif yang memiliki izin mengelola pengaturan toko.'
      using errcode = '42501';
  end if;

  if trim(coalesce(p_name, '')) = '' then
    raise exception 'Nama toko wajib diisi.';
  end if;

  update public.stores
     set name = left(trim(coalesce(p_name, '')), 60),
         business_type = left(trim(coalesce(p_business_type, '')), 60),
         logo_icon_key = coalesce(nullif(trim(p_logo_icon_key), ''), 'STORE'),
         logo_base64 = p_logo_base64,
         theme_palette_key = coalesce(nullif(trim(p_theme_palette_key), ''), 'EMERALD'),
         address = left(trim(coalesce(p_address, '')), 240),
         whatsapp = left(trim(coalesce(p_whatsapp, '')), 40),
         email = left(trim(coalesce(p_email, '')), 160),
         owner_name = left(trim(coalesce(p_owner_name, '')), 100),
         description = left(trim(coalesce(p_description, '')), 300),
         updated_at = now()
   where id = p_store_id;

  if not found then
    raise exception 'Toko tidak ditemukan atau tidak dapat diakses.'
      using errcode = 'P0002';
  end if;

  insert into public.store_settings (
    store_id, receipt_footer, tax_percent, default_discount_percent,
    payment_gateway_provider, bank_transfer_info
  ) values (
    p_store_id,
    left(trim(coalesce(p_receipt_footer, 'Terima kasih telah berbelanja!')), 240),
    least(100, greatest(0, coalesce(p_tax_percent, 0))),
    least(100, greatest(0, coalesce(p_default_discount_percent, 0))),
    'MIDTRANS',
    left(trim(coalesce(p_bank_transfer_info, '')), 240)
  )
  on conflict (store_id) do update
    set receipt_footer = excluded.receipt_footer,
        tax_percent = excluded.tax_percent,
        default_discount_percent = excluded.default_discount_percent,
        payment_gateway_provider = excluded.payment_gateway_provider,
        bank_transfer_info = excluded.bank_transfer_info,
        updated_at = now();

  return p_store_id;
end;
$$;

revoke all on function public.save_store_settings(
  uuid, text, text, text, text, text, text, text, text, text,
  text, text, numeric, numeric, text
) from public, anon;

grant execute on function public.save_store_settings(
  uuid, text, text, text, text, text, text, text, text, text,
  text, text, numeric, numeric, text
) to authenticated;

notify pgrst, 'reload schema';

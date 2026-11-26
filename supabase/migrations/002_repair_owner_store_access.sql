-- Repair owner linkage for accounts that already own a store but whose
-- profiles.active_store_id or store_members row is missing.
-- Safe to run more than once. Does not create a store or alter sales data.

create or replace function public.repair_my_owner_store_access()
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_display_name text := coalesce(
    nullif(auth.jwt() -> 'user_metadata' ->> 'full_name', ''),
    nullif(auth.jwt() -> 'user_metadata' ->> 'name', ''),
    split_part(lower(coalesce(auth.jwt() ->> 'email', '')), '@', 1),
    'Pemilik Toko'
  );
  v_store_id uuid;
begin
  if v_uid is null then
    raise exception 'Pengguna harus login terlebih dahulu.';
  end if;

  if v_email = '' then
    raise exception 'Email akun tidak tersedia pada sesi login.';
  end if;

  select s.id into v_store_id
  from public.stores s
  where s.owner_id = v_uid
  order by s.created_at asc
  limit 1;

  if v_store_id is null then
    return null;
  end if;

  insert into public.profiles (id, email, display_name, active_store_id, role)
  values (v_uid, v_email, left(v_display_name, 100), v_store_id, 'OWNER')
  on conflict (id) do update
    set email = excluded.email,
        active_store_id = excluded.active_store_id,
        role = 'OWNER',
        display_name = case
          when coalesce(nullif(public.profiles.display_name, ''), '') = ''
            then excluded.display_name
          else public.profiles.display_name
        end,
        updated_at = now();

  insert into public.store_members (
    store_id, user_id, email, display_name, role, active, status,
    can_access_kasir, can_manage_products, can_manage_categories,
    can_view_transactions, can_view_reports, can_manage_settings
  ) values (
    v_store_id, v_uid, v_email, left(v_display_name, 100), 'OWNER', true, 'ACTIVE',
    true, true, true, true, true, true
  )
  on conflict (store_id, email) do update
    set user_id = excluded.user_id,
        display_name = case
          when coalesce(nullif(public.store_members.display_name, ''), '') = ''
            then excluded.display_name
          else public.store_members.display_name
        end,
        role = 'OWNER',
        active = true,
        status = 'ACTIVE',
        can_access_kasir = true,
        can_manage_products = true,
        can_manage_categories = true,
        can_view_transactions = true,
        can_view_reports = true,
        can_manage_settings = true,
        updated_at = now();

  insert into public.store_settings (store_id)
  values (v_store_id)
  on conflict (store_id) do nothing;

  return v_store_id;
end;
$$;

revoke all on function public.repair_my_owner_store_access() from public;
grant execute on function public.repair_my_owner_store_access() to authenticated;

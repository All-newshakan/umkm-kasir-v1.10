-- Restore owner membership/profile links for the currently authenticated user.
-- The user id is derived only from auth.uid(), never supplied by the client.
create or replace function public.repair_my_owner_store_access()
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_metadata jsonb := coalesce(auth.jwt() -> 'user_metadata', '{}'::jsonb);
  v_display_name text;
  v_avatar_url text;
  v_store_id uuid;
  v_first_store_id uuid;
  v_existing_active_store_id uuid;
begin
  if v_uid is null then
    raise exception 'Sesi login tidak ditemukan. Silakan masuk kembali.'
      using errcode = '28000';
  end if;

  v_display_name := left(coalesce(
    nullif(trim(v_metadata ->> 'full_name'), ''),
    nullif(trim(v_metadata ->> 'name'), ''),
    nullif(trim(split_part(v_email, '@', 1)), ''),
    'Pemilik Toko'
  ), 100);
  v_avatar_url := coalesce(v_metadata ->> 'avatar_url', v_metadata ->> 'picture', '');

  insert into public.profiles (id, email, display_name, avatar_url, role)
  values (v_uid, v_email, v_display_name, v_avatar_url, 'OWNER')
  on conflict (id) do update
    set email = case when excluded.email <> '' then excluded.email else public.profiles.email end,
        display_name = coalesce(nullif(public.profiles.display_name, ''), excluded.display_name),
        avatar_url = coalesce(nullif(public.profiles.avatar_url, ''), excluded.avatar_url),
        updated_at = now();

  for v_store_id in
    select s.id from public.stores s
    where s.owner_id = v_uid
    order by s.created_at asc
  loop
    if v_first_store_id is null then
      v_first_store_id := v_store_id;
    end if;

    update public.store_members
       set email = v_email,
           display_name = v_display_name,
           role = 'OWNER',
           active = true,
           status = 'ACTIVE',
           can_access_kasir = true,
           can_manage_products = true,
           can_manage_categories = true,
           can_view_transactions = true,
           can_view_reports = true,
           can_manage_settings = true
     where store_id = v_store_id and user_id = v_uid;

    if not found then
      insert into public.store_members (
        store_id, user_id, email, display_name, role, active, status,
        can_access_kasir, can_manage_products, can_manage_categories,
        can_view_transactions, can_view_reports, can_manage_settings
      ) values (
        v_store_id, v_uid, v_email, v_display_name, 'OWNER', true, 'ACTIVE',
        true, true, true, true, true, true
      );
    end if;
  end loop;

  select p.active_store_id into v_existing_active_store_id
  from public.profiles p where p.id = v_uid;

  if v_existing_active_store_id is not null
     and not exists (
       select 1 from public.store_members sm
       where sm.store_id = v_existing_active_store_id
         and sm.user_id = v_uid
         and sm.active = true
         and upper(sm.status) = 'ACTIVE'
     ) then
    v_existing_active_store_id := null;
  end if;

  update public.profiles
     set active_store_id = coalesce(v_existing_active_store_id, v_first_store_id),
         role = case when v_first_store_id is not null then 'OWNER' else role end,
         updated_at = now()
   where id = v_uid;

  return coalesce(v_existing_active_store_id, v_first_store_id);
end;
$$;

revoke all on function public.repair_my_owner_store_access() from public, anon;
grant execute on function public.repair_my_owner_store_access() to authenticated;

notify pgrst, 'reload schema';

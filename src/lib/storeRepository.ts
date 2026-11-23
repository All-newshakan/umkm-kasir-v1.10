import type { User } from '@supabase/supabase-js';
import { formatInvoiceTimestamp, toDate } from './formatters';
import {
  getSupabaseClientOrThrow,
  getUserAvatarUrl,
  getUserDisplayName,
  isSupabaseConfigured,
  supabase,
} from './supabase';
import type {
  CartLine,
  Category,
  Customer,
  DiscountType,
  PaymentMethod,
  PosTransaction,
  Product,
  StaffInvite,
  StaffMember,
  StoreBackupPayload,
  StoreLogoIconKey,
  StoreProfile,
  StoreThemePaletteKey,
  TransactionItem,
  UserProfile,
} from '../types/models';
import { getCartLineTotals } from '../types/models';

export type Unsubscribe = () => void;

type StoreDataListener = () => void;
const storeListeners = new Map<string, Set<StoreDataListener>>();

function onLocalChange(channelKey: string, cb: StoreDataListener): Unsubscribe {
  let set = storeListeners.get(channelKey);
  if (!set) {
    set = new Set();
    storeListeners.set(channelKey, set);
  }
  set.add(cb);
  return () => {
    set?.delete(cb);
  };
}

function emitLocalChange(...channelKeys: string[]): void {
  for (const key of channelKeys) {
    const set = storeListeners.get(key);
    if (!set) continue;
    set.forEach((fn) => {
      try {
        fn();
      } catch {
        // ignore listener failure
      }
    });
  }
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string | null | undefined): value is string {
  return Boolean(value && UUID_REGEX.test(value.trim()));
}

function createUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function mapUserProfile(row: Record<string, unknown>): UserProfile {
  return {
    userId: String(row.id || ''),
    email: String(row.email || ''),
    displayName: String(row.display_name || ''),
    activeStoreId: row.active_store_id ? String(row.active_store_id) : '',
    role: row.role === 'KASIR' || row.role === 'STAFF' ? 'KASIR' : 'OWNER',
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  };
}

function mapStore(
  row: Record<string, unknown>,
  settingsRow?: Record<string, unknown> | null,
  members?: Array<{ user_id?: unknown; email?: unknown }>
): StoreProfile {
  const settings =
    settingsRow ||
    (Array.isArray(row.store_settings)
      ? (row.store_settings[0] as Record<string, unknown> | undefined)
      : (row.store_settings as Record<string, unknown> | undefined)) ||
    null;

  const memberRows =
    members ||
    (Array.isArray(row.store_members)
      ? (row.store_members as Array<{ user_id?: unknown; email?: unknown }>)
      : []);

  const ownerUid = String(row.owner_id || '');
  const memberUids = Array.from(
    new Set([ownerUid, ...memberRows.map((m) => String(m.user_id || '')).filter(Boolean)])
  );
  const memberEmails = Array.from(
    new Set(
      [
        String(row.email || '').toLowerCase(),
        ...memberRows.map((m) => String(m.email || '').toLowerCase()).filter(Boolean),
      ].filter(Boolean)
    )
  );

  return {
    id: String(row.id || ''),
    ownerUid,
    memberUids,
    memberEmails,
    name: String(row.name || ''),
    businessType: String(row.business_type || ''),
    logoIconKey: (row.logo_icon_key as StoreLogoIconKey) || 'STORE',
    logoBase64: typeof row.logo_base64 === 'string' && row.logo_base64 ? row.logo_base64 : undefined,
    themePaletteKey: (row.theme_palette_key as StoreThemePaletteKey) || 'EMERALD',
    address: String(row.address || ''),
    whatsapp: String(row.whatsapp || ''),
    email: String(row.email || ''),
    ownerName: String(row.owner_name || ''),
    description: String(row.description || ''),
    receiptFooter: String(settings?.receipt_footer || 'Terima kasih telah berbelanja!'),
    taxPercent: Number(settings?.tax_percent || 0),
    defaultDiscountPercent: Number(settings?.default_discount_percent || 0),
    paymentGatewayProvider: 'MIDTRANS',
    bankTransferInfo: String(settings?.bank_transfer_info || ''),
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  };
}

function mapStaffInvite(row: Record<string, unknown>): StaffInvite {
  const storeObj = (row.stores as Record<string, unknown> | null | undefined) || null;
  const rawStatus = String(row.status || 'PENDING').toUpperCase();
  const status: StaffInvite['status'] =
    rawStatus === 'ACTIVE' || rawStatus === 'ACCEPTED'
      ? 'ACCEPTED'
      : rawStatus === 'REVOKED'
        ? 'REVOKED'
        : 'PENDING';

  return {
    id: String(row.id || ''),
    storeId: String(row.store_id || ''),
    storeName: String(storeObj?.name || row.store_name || 'Toko UMKM'),
    ownerUid: String(storeObj?.owner_id || ''),
    staffEmail: String(row.email || ''),
    staffName: String(row.display_name || ''),
    role: 'KASIR',
    canAccessKasir: Boolean(row.can_access_kasir),
    canManageProducts: Boolean(row.can_manage_products),
    canManageCategories: Boolean(row.can_manage_categories),
    canViewTransactions: Boolean(row.can_view_transactions),
    canViewReports: Boolean(row.can_view_reports),
    canManageSettings: Boolean(row.can_manage_settings),
    status,
    acceptedByUid: row.user_id ? String(row.user_id) : undefined,
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  };
}

function mapStaffMember(row: Record<string, unknown>): StaffMember {
  return {
    id: String(row.id || ''),
    staffUid: String(row.user_id || row.id || ''),
    storeId: String(row.store_id || ''),
    ownerUid: '',
    inviteId: String(row.id || ''),
    email: String(row.email || ''),
    displayName: String(row.display_name || ''),
    role: row.role === 'OWNER' ? 'OWNER' : 'KASIR',
    active: row.active !== false,
    canAccessKasir: Boolean(row.can_access_kasir),
    canManageProducts: Boolean(row.can_manage_products),
    canManageCategories: Boolean(row.can_manage_categories),
    canViewTransactions: Boolean(row.can_view_transactions),
    canViewReports: Boolean(row.can_view_reports),
    canManageSettings: Boolean(row.can_manage_settings),
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  };
}

function mapCategory(row: Record<string, unknown>): Category {
  return {
    id: String(row.id || ''),
    storeId: String(row.store_id || ''),
    ownerUid: '',
    memberUids: [],
    memberEmails: [],
    name: String(row.name || ''),
    colorHex: String(row.color_hex || '#16A34A'),
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  };
}

function mapProduct(row: Record<string, unknown>): Product {
  return {
    id: String(row.id || ''),
    storeId: String(row.store_id || ''),
    ownerUid: '',
    memberUids: [],
    memberEmails: [],
    name: String(row.name || ''),
    categoryId: row.category_id ? String(row.category_id) : '',
    categoryName: String(row.category_name || 'Umum'),
    barcode: String(row.barcode || ''),
    costPrice: Number(row.cost_price || 0),
    sellPrice: Number(row.sell_price || 0),
    stock: Number(row.stock || 0),
    unit: String(row.unit || 'pcs'),
    minStockAlert: Number(row.min_stock_alert ?? 5),
    imageBase64:
      typeof row.image_base64 === 'string' && row.image_base64 ? row.image_base64 : undefined,
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  };
}

function mapCustomer(row: Record<string, unknown>): Customer {
  return {
    id: String(row.id || ''),
    storeId: String(row.store_id || ''),
    ownerUid: '',
    memberUids: [],
    memberEmails: [],
    name: String(row.name || ''),
    phone: String(row.phone || ''),
    email: String(row.email || ''),
    address: String(row.address || ''),
    notes: String(row.notes || ''),
    loyaltyPoints: Number(row.loyalty_points || 0),
    totalSpent: Number(row.total_spent || 0),
    visitCount: Number(row.visit_count || 0),
    lastPurchaseAt: toDate(row.last_purchase_at),
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  };
}

function mapTransaction(row: Record<string, unknown>): PosTransaction {
  const details = Array.isArray(row.transaction_details)
    ? (row.transaction_details as Array<Record<string, unknown>>)
    : [];
  const paymentRows = Array.isArray(row.payments)
    ? (row.payments as Array<Record<string, unknown>>)
    : [];
  const payment = paymentRows[0] || null;

  const items: TransactionItem[] = details.map((d) => ({
    productId: d.product_id ? String(d.product_id) : '',
    productName: String(d.product_name || 'Produk'),
    categoryId: d.category_id ? String(d.category_id) : '',
    categoryName: String(d.category_name || 'Umum'),
    unit: String(d.unit || 'pcs'),
    quantity: Number(d.quantity || 1),
    costPrice: Number(d.cost_price || 0),
    sellPrice: Number(d.sell_price || 0),
    discountType: d.discount_type === 'PERCENT' ? 'PERCENT' : 'NOMINAL',
    discountValue: Number(d.discount_value || 0),
    discountAmount: Number(d.discount_amount || 0),
    lineTotal: Number(d.line_total || 0),
    lineProfit: Number(d.line_profit || 0),
  }));

  return {
    id: String(row.id || ''),
    storeId: String(row.store_id || ''),
    ownerUid: '',
    memberUids: [],
    memberEmails: [],
    invoiceNumber: String(row.invoice_number || ''),
    cashierUid: row.cashier_id ? String(row.cashier_id) : '',
    cashierName: String(row.cashier_name || 'Kasir'),
    note: String(row.note || ''),
    items,
    subtotal: Number(row.subtotal || 0),
    discountAmount: Number(row.discount_amount || 0),
    discountType: row.discount_type === 'PERCENT' ? 'PERCENT' : 'NOMINAL',
    taxAmount: Number(row.tax_amount || 0),
    totalAmount: Number(row.total_amount || 0),
    totalCost: Number(row.total_cost || 0),
    totalProfit: Number(row.total_profit || 0),
    paymentMethod: ((payment?.payment_method as PaymentMethod) || 'TUNAI') as PaymentMethod,
    paymentStatus: 'VERIFIED',
    gatewayProvider: String(payment?.gateway_provider || ''),
    gatewayOrderId: String(payment?.gateway_order_id || ''),
    cashReceived: Number(payment?.cash_received ?? row.total_amount ?? 0),
    changeAmount: Number(payment?.change_amount || 0),
    customerId: row.customer_id ? String(row.customer_id) : undefined,
    customerName:
      typeof row.customer_name === 'string' && row.customer_name ? row.customer_name : undefined,
    pointsEarned: Number(row.points_earned || 0),
    pointsRedeemed: Number(row.points_redeemed || 0),
    hasPendingWrites: false,
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  };
}

function createSupabasePollingSubscription(params: {
  channelName: string;
  table: string;
  filter?: string;
  localKeys: string[];
  fetcher: () => Promise<void>;
  onError?: (err: unknown) => void;
}): Unsubscribe {
  if (!isSupabaseConfigured || !supabase) {
    return () => undefined;
  }

  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const runFetch = async () => {
    if (disposed) return;
    try {
      await params.fetcher();
    } catch (err) {
      if (!disposed) {
        params.onError?.(err);
      }
    }
  };

  const scheduleFetch = () => {
    if (disposed) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      void runFetch();
    }, 80);
  };

  void runFetch();

  const localUnsubs = params.localKeys.map((key) => onLocalChange(key, scheduleFetch));

  const pgChannel = supabase
    .channel(`${params.channelName}-${Math.random().toString(36).slice(2, 8)}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: params.table,
        ...(params.filter ? { filter: params.filter } : {}),
      },
      () => {
        scheduleFetch();
      }
    )
    .subscribe();

  return () => {
    disposed = true;
    if (timer) clearTimeout(timer);
    localUnsubs.forEach((u) => u());
    void supabase?.removeChannel(pgChannel);
  };
}

export async function ensureUserProfile(user: User): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  const emailLower = (user.email || '').trim().toLowerCase();
  const displayName = getUserDisplayName(user);
  const avatarUrl = getUserAvatarUrl(user) || '';

  const { data: existing, error: selectErr } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url')
    .eq('id', user.id)
    .maybeSingle();

  if (selectErr) throw selectErr;

  if (!existing) {
    const { error: insertErr } = await supabase.from('profiles').insert({
      id: user.id,
      email: emailLower,
      display_name: displayName.slice(0, 100),
      avatar_url: avatarUrl,
      role: 'OWNER',
    });
    if (insertErr) throw insertErr;
    emitLocalChange(`profile:${user.id}`);
  } else if (
    (!existing.display_name && displayName) ||
    (!existing.avatar_url && avatarUrl)
  ) {
    await supabase
      .from('profiles')
      .update({
        display_name: (existing.display_name as string) || displayName.slice(0, 100),
        avatar_url: (existing.avatar_url as string) || avatarUrl,
      })
      .eq('id', user.id);
    emitLocalChange(`profile:${user.id}`);
  }
}

export function subscribeUserProfile(
  uid: string,
  onData: (profile: UserProfile | null) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  return createSupabasePollingSubscription({
    channelName: `profile-${uid}`,
    table: 'profiles',
    filter: `id=eq.${uid}`,
    localKeys: [`profile:${uid}`],
    fetcher: async () => {
      const client = getSupabaseClientOrThrow();
      const { data, error } = await client
        .from('profiles')
        .select('*')
        .eq('id', uid)
        .maybeSingle();
      if (error) throw error;
      onData(data ? mapUserProfile(data as Record<string, unknown>) : null);
    },
    onError,
  });
}

export function subscribePendingInvites(
  emailLower: string,
  onData: (invites: StaffInvite[]) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  return createSupabasePollingSubscription({
    channelName: `pending-invites-${emailLower}`,
    table: 'store_members',
    localKeys: [`invites:email:${emailLower}`, 'invites:all'],
    fetcher: async () => {
      const client = getSupabaseClientOrThrow();
      const { data, error } = await client
        .from('store_members')
        .select('*, stores(id, name, owner_id)')
        .ilike('email', emailLower)
        .eq('status', 'PENDING');
      if (error) throw error;
      onData(((data || []) as Array<Record<string, unknown>>).map(mapStaffInvite));
    },
    onError,
  });
}

export function subscribeStore(
  storeId: string,
  onData: (store: StoreProfile | null) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  return createSupabasePollingSubscription({
    channelName: `store-${storeId}`,
    table: 'stores',
    filter: `id=eq.${storeId}`,
    localKeys: [`store:${storeId}`, `settings:${storeId}`, `staff:${storeId}`],
    fetcher: async () => {
      const client = getSupabaseClientOrThrow();
      const { data, error } = await client
        .from('stores')
        .select('*, store_settings(*), store_members(user_id, email)')
        .eq('id', storeId)
        .maybeSingle();
      if (error) throw error;
      onData(data ? mapStore(data as Record<string, unknown>) : null);
    },
    onError,
  });
}

export function subscribeUserStores(
  uid: string,
  onData: (stores: StoreProfile[]) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  return createSupabasePollingSubscription({
    channelName: `user-stores-${uid}`,
    table: 'stores',
    localKeys: [`stores:${uid}`, 'stores:all'],
    fetcher: async () => {
      const client = getSupabaseClientOrThrow();
      const { data, error } = await client
        .from('stores')
        .select('*, store_settings(*), store_members(user_id, email)')
        .order('name', { ascending: true });
      if (error) throw error;
      const list = ((data || []) as Array<Record<string, unknown>>).map((row) =>
        mapStore(row)
      );
      onData(list);
    },
    onError,
  });
}

export async function switchActiveStore(params: {
  uid: string;
  email: string;
  displayName: string;
  store: StoreProfile;
}): Promise<void> {
  const client = getSupabaseClientOrThrow();
  const role = params.store.ownerUid === params.uid ? 'OWNER' : 'KASIR';
  const emailLower = params.email.trim().toLowerCase();

  const { error } = await client.from('profiles').upsert(
    {
      id: params.uid,
      email: emailLower,
      display_name: (params.displayName || params.store.ownerName || 'Pengguna').slice(0, 100),
      active_store_id: params.store.id,
      role,
    },
    { onConflict: 'id' }
  );
  if (error) throw error;

  emitLocalChange(`profile:${params.uid}`, `store:${params.store.id}`);
}

export function subscribeStaffMember(
  storeId: string,
  staffUid: string,
  onData: (staff: StaffMember | null) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  return createSupabasePollingSubscription({
    channelName: `staff-self-${storeId}-${staffUid}`,
    table: 'store_members',
    filter: `store_id=eq.${storeId}`,
    localKeys: [`staff:${storeId}`],
    fetcher: async () => {
      const client = getSupabaseClientOrThrow();
      const { data, error } = await client
        .from('store_members')
        .select('*')
        .eq('store_id', storeId)
        .eq('user_id', staffUid)
        .maybeSingle();
      if (error) throw error;
      onData(data ? mapStaffMember(data as Record<string, unknown>) : null);
    },
    onError,
  });
}

export function subscribeAllStaff(
  storeId: string,
  ownerUid: string,
  onData: (staffList: StaffMember[]) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  return createSupabasePollingSubscription({
    channelName: `staff-all-${storeId}`,
    table: 'store_members',
    filter: `store_id=eq.${storeId}`,
    localKeys: [`staff:${storeId}`],
    fetcher: async () => {
      const client = getSupabaseClientOrThrow();
      const { data, error } = await client
        .from('store_members')
        .select('*')
        .eq('store_id', storeId)
        .eq('status', 'ACTIVE')
        .order('display_name', { ascending: true });
      if (error) throw error;
      const list = ((data || []) as Array<Record<string, unknown>>).map((row) => ({
        ...mapStaffMember(row),
        ownerUid,
      }));
      onData(list);
    },
    onError,
  });
}

export function subscribeStoreInvites(
  storeId: string,
  ownerUid: string,
  onData: (invites: StaffInvite[]) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  return createSupabasePollingSubscription({
    channelName: `store-invites-${storeId}`,
    table: 'store_members',
    filter: `store_id=eq.${storeId}`,
    localKeys: [`staff:${storeId}`, 'invites:all'],
    fetcher: async () => {
      const client = getSupabaseClientOrThrow();
      const { data, error } = await client
        .from('store_members')
        .select('*, stores(id, name, owner_id)')
        .eq('store_id', storeId)
        .neq('role', 'OWNER')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const list = ((data || []) as Array<Record<string, unknown>>).map((row) => ({
        ...mapStaffInvite(row),
        ownerUid,
      }));
      onData(list);
    },
    onError,
  });
}

export function subscribeCategories(
  storeId: string,
  _emailLower: string,
  onData: (categories: Category[]) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  return createSupabasePollingSubscription({
    channelName: `categories-${storeId}`,
    table: 'categories',
    filter: `store_id=eq.${storeId}`,
    localKeys: [`categories:${storeId}`],
    fetcher: async () => {
      const client = getSupabaseClientOrThrow();
      const { data, error } = await client
        .from('categories')
        .select('*')
        .eq('store_id', storeId)
        .order('name', { ascending: true });
      if (error) throw error;
      onData(((data || []) as Array<Record<string, unknown>>).map(mapCategory));
    },
    onError,
  });
}

export function subscribeProducts(
  storeId: string,
  _emailLower: string,
  onData: (products: Product[]) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  return createSupabasePollingSubscription({
    channelName: `products-${storeId}`,
    table: 'products',
    filter: `store_id=eq.${storeId}`,
    localKeys: [`products:${storeId}`],
    fetcher: async () => {
      const client = getSupabaseClientOrThrow();
      const { data, error } = await client
        .from('products')
        .select('*')
        .eq('store_id', storeId)
        .order('name', { ascending: true });
      if (error) throw error;
      onData(((data || []) as Array<Record<string, unknown>>).map(mapProduct));
    },
    onError,
  });
}

export function subscribeCustomers(
  storeId: string,
  _emailLower: string,
  onData: (customers: Customer[]) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  return createSupabasePollingSubscription({
    channelName: `customers-${storeId}`,
    table: 'customers',
    filter: `store_id=eq.${storeId}`,
    localKeys: [`customers:${storeId}`],
    fetcher: async () => {
      const client = getSupabaseClientOrThrow();
      const { data, error } = await client
        .from('customers')
        .select('*')
        .eq('store_id', storeId)
        .order('name', { ascending: true });
      if (error) throw error;
      onData(((data || []) as Array<Record<string, unknown>>).map(mapCustomer));
    },
    onError,
  });
}

export function subscribeTransactions(
  storeId: string,
  _emailLower: string,
  onData: (transactions: PosTransaction[]) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  return createSupabasePollingSubscription({
    channelName: `transactions-${storeId}`,
    table: 'transactions',
    filter: `store_id=eq.${storeId}`,
    localKeys: [`transactions:${storeId}`],
    fetcher: async () => {
      const client = getSupabaseClientOrThrow();
      const { data, error } = await client
        .from('transactions')
        .select('*, transaction_details(*), payments(*)')
        .eq('store_id', storeId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      onData(((data || []) as Array<Record<string, unknown>>).map(mapTransaction));
    },
    onError,
  });
}

export async function createInitialStore(params: {
  uid: string;
  email: string;
  ownerName: string;
  storeName: string;
  businessType: string;
  address: string;
  whatsapp: string;
  description: string;
  logoIconKey: StoreLogoIconKey;
  themePaletteKey: StoreThemePaletteKey;
  logoBase64?: string;
}): Promise<string> {
  const client = getSupabaseClientOrThrow();
  const { data, error } = await client.rpc('create_store_with_owner', {
    p_name: params.storeName.trim().slice(0, 60),
    p_business_type: (params.businessType || 'Warung / Sembako').trim().slice(0, 60),
    p_address: params.address.trim().slice(0, 240),
    p_whatsapp: params.whatsapp.trim().slice(0, 40),
    p_owner_name: (params.ownerName.trim() || 'Pemilik Toko').slice(0, 100),
    p_description: params.description.trim().slice(0, 300),
    p_logo_icon_key: params.logoIconKey,
    p_theme_palette_key: params.themePaletteKey,
    p_logo_base64: params.logoBase64 || null,
  });
  if (error) throw error;

  const storeId = String(data || '');
  emitLocalChange(`profile:${params.uid}`, `stores:${params.uid}`, 'stores:all', `store:${storeId}`);
  return storeId;
}

export async function acceptStaffInvite(params: {
  uid: string;
  email: string;
  displayName: string;
  invite: StaffInvite;
}): Promise<void> {
  const client = getSupabaseClientOrThrow();
  const { error } = await client.rpc('accept_store_invite', {
    p_member_id: params.invite.id,
    p_display_name: (params.displayName.trim() || params.invite.staffName).slice(0, 100),
  });
  if (error) throw error;

  emitLocalChange(
    `profile:${params.uid}`,
    `stores:${params.uid}`,
    'stores:all',
    `invites:email:${params.email.trim().toLowerCase()}`,
    'invites:all',
    `staff:${params.invite.storeId}`
  );
}

export async function updateStoreSettings(store: StoreProfile): Promise<void> {
  const client = getSupabaseClientOrThrow();
  const { error: storeErr } = await client
    .from('stores')
    .update({
      name: store.name.trim().slice(0, 60),
      business_type: (store.businessType || '').trim().slice(0, 60),
      logo_icon_key: store.logoIconKey,
      logo_base64: store.logoBase64 ?? null,
      theme_palette_key: store.themePaletteKey,
      address: store.address.trim().slice(0, 240),
      whatsapp: store.whatsapp.trim().slice(0, 40),
      email: store.email.trim().slice(0, 160),
      owner_name: store.ownerName.trim().slice(0, 100),
      description: store.description.trim().slice(0, 300),
    })
    .eq('id', store.id);
  if (storeErr) throw storeErr;

  const { error: settingsErr } = await client.from('store_settings').upsert(
    {
      store_id: store.id,
      receipt_footer: store.receiptFooter.trim().slice(0, 240),
      tax_percent: Math.min(100, Math.max(0, Number(store.taxPercent || 0))),
      default_discount_percent: Math.min(
        100,
        Math.max(0, Number(store.defaultDiscountPercent || 0))
      ),
      payment_gateway_provider: 'MIDTRANS',
      bank_transfer_info: store.bankTransferInfo.trim().slice(0, 240),
    },
    { onConflict: 'store_id' }
  );
  if (settingsErr) throw settingsErr;

  emitLocalChange(`store:${store.id}`, `settings:${store.id}`, 'stores:all');
}

export async function saveCategory(
  store: StoreProfile,
  category: Partial<Category> & { name: string; colorHex: string }
): Promise<void> {
  const client = getSupabaseClientOrThrow();
  const payload = {
    store_id: store.id,
    name: category.name.trim().slice(0, 50),
    color_hex: category.colorHex.slice(0, 16),
  };

  if (category.id) {
    const { error } = await client
      .from('categories')
      .update(payload)
      .eq('id', category.id)
      .eq('store_id', store.id);
    if (error) throw error;
  } else {
    const { error } = await client.from('categories').insert(payload);
    if (error) throw error;
  }

  emitLocalChange(`categories:${store.id}`);
}

export async function deleteCategory(storeId: string, categoryId: string): Promise<void> {
  const client = getSupabaseClientOrThrow();
  const { error } = await client
    .from('categories')
    .delete()
    .eq('id', categoryId)
    .eq('store_id', storeId);
  if (error) throw error;
  emitLocalChange(`categories:${storeId}`);
}

export async function saveProduct(
  store: StoreProfile,
  product: Omit<Product, 'id' | 'storeId' | 'ownerUid' | 'memberUids' | 'memberEmails'> & {
    id?: string;
  }
): Promise<void> {
  const client = getSupabaseClientOrThrow();
  const payload = {
    store_id: store.id,
    name: product.name.trim().slice(0, 100),
    category_id: isUuid(product.categoryId) ? product.categoryId : null,
    category_name: (product.categoryName.trim() || 'Umum').slice(0, 50),
    barcode: product.barcode.trim().slice(0, 64),
    cost_price: Math.max(0, Math.round(product.costPrice)),
    sell_price: Math.max(0, Math.round(product.sellPrice)),
    stock: Math.max(0, Math.round(product.stock)),
    unit: (product.unit.trim() || 'pcs').slice(0, 20),
    min_stock_alert: Math.max(0, Math.round(product.minStockAlert)),
    image_base64: product.imageBase64 ?? null,
  };

  if (product.id) {
    const { error } = await client
      .from('products')
      .update(payload)
      .eq('id', product.id)
      .eq('store_id', store.id);
    if (error) throw error;
  } else {
    const { error } = await client.from('products').insert(payload);
    if (error) throw error;
  }

  emitLocalChange(`products:${store.id}`);
}

export async function deleteProduct(storeId: string, productId: string): Promise<void> {
  const client = getSupabaseClientOrThrow();
  const { error } = await client
    .from('products')
    .delete()
    .eq('id', productId)
    .eq('store_id', storeId);
  if (error) throw error;
  emitLocalChange(`products:${storeId}`);
}

export async function saveCustomer(
  store: StoreProfile,
  customer: Partial<Customer> & { name: string }
): Promise<string> {
  const client = getSupabaseClientOrThrow();
  const payload = {
    store_id: store.id,
    name: customer.name.trim().slice(0, 100),
    phone: (customer.phone || '').trim().slice(0, 40),
    email: (customer.email || '').trim().slice(0, 160),
    address: (customer.address || '').trim().slice(0, 240),
    notes: (customer.notes || '').trim().slice(0, 300),
    loyalty_points: Math.max(0, Math.round(customer.loyaltyPoints || 0)),
  };

  if (customer.id) {
    const { error } = await client
      .from('customers')
      .update(payload)
      .eq('id', customer.id)
      .eq('store_id', store.id);
    if (error) throw error;
    emitLocalChange(`customers:${store.id}`);
    return customer.id;
  }

  const { data, error } = await client
    .from('customers')
    .insert({
      ...payload,
      total_spent: 0,
      visit_count: 0,
    })
    .select('id')
    .single();
  if (error) throw error;

  emitLocalChange(`customers:${store.id}`);
  return String((data as { id: string }).id);
}

export async function adjustCustomerPoints(
  storeId: string,
  customer: Customer,
  delta: number
): Promise<void> {
  const client = getSupabaseClientOrThrow();
  const nextPoints = Math.max(0, Math.round(customer.loyaltyPoints + delta));
  const { error } = await client
    .from('customers')
    .update({ loyalty_points: nextPoints })
    .eq('id', customer.id)
    .eq('store_id', storeId);
  if (error) throw error;
  emitLocalChange(`customers:${storeId}`);
}

export async function deleteCustomer(storeId: string, customerId: string): Promise<void> {
  const client = getSupabaseClientOrThrow();
  const { error } = await client
    .from('customers')
    .delete()
    .eq('id', customerId)
    .eq('store_id', storeId);
  if (error) throw error;
  emitLocalChange(`customers:${storeId}`);
}

export async function completeTransactionAndDecrementStock(params: {
  store: StoreProfile;
  cashierUid: string;
  cashierName: string;
  cartLines: CartLine[];
  note: string;
  discountType: DiscountType;
  discountAmount: number;
  taxAmount: number;
  paymentMethod: PaymentMethod;
  gatewayProvider: string;
  gatewayOrderId: string;
  cashReceived: number;
  customer: Customer | null;
  pointsRedeemed: number;
}): Promise<PosTransaction> {
  const client = getSupabaseClientOrThrow();
  const { store, cartLines, customer } = params;
  const now = new Date();
  const randSuffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  const invoiceNumber = `INV-${formatInvoiceTimestamp(now)}-${randSuffix}`;

  const items: TransactionItem[] = cartLines.map((line) => {
    const totals = getCartLineTotals(line);
    return {
      productId: line.product.id,
      productName: line.product.name,
      categoryId: isUuid(line.product.categoryId) ? line.product.categoryId : '',
      categoryName: line.product.categoryName || 'Umum',
      unit: line.product.unit || 'pcs',
      quantity: Math.round(line.quantity),
      costPrice: Math.round(line.product.costPrice),
      sellPrice: Math.round(line.product.sellPrice),
      discountType: line.discountType,
      discountValue: Math.round(line.discountValue),
      discountAmount: Math.round(totals.discount),
      lineTotal: Math.round(totals.netTotal),
      lineProfit: Math.round(totals.netProfit),
    };
  });

  const { data, error } = await client.rpc('complete_pos_checkout', {
    p_store_id: store.id,
    p_invoice_number: invoiceNumber,
    p_cashier_name: (params.cashierName.trim() || 'Kasir').slice(0, 100),
    p_note: params.note.trim().slice(0, 240),
    p_discount_type: params.discountType,
    p_discount_amount: Math.max(0, Math.round(params.discountAmount)),
    p_tax_amount: Math.max(0, Math.round(params.taxAmount)),
    p_payment_method: params.paymentMethod,
    p_gateway_provider: params.gatewayProvider.slice(0, 32),
    p_gateway_order_id: params.gatewayOrderId.slice(0, 128),
    p_cash_received: Math.max(0, Math.round(params.cashReceived)),
    p_customer_id: customer && isUuid(customer.id) ? customer.id : null,
    p_customer_name: customer ? customer.name.slice(0, 100) : null,
    p_points_redeemed: customer ? Math.max(0, Math.round(params.pointsRedeemed)) : 0,
    p_items: items,
  });

  if (error) throw error;

  const summary = (data || {}) as Record<string, unknown>;
  emitLocalChange(
    `transactions:${store.id}`,
    `products:${store.id}`,
    `customers:${store.id}`
  );

  return {
    id: String(summary.transactionId || createUuid()),
    storeId: store.id,
    ownerUid: store.ownerUid,
    memberUids: store.memberUids,
    memberEmails: store.memberEmails,
    invoiceNumber: String(summary.invoiceNumber || invoiceNumber),
    cashierUid: params.cashierUid,
    cashierName: params.cashierName,
    note: params.note.trim(),
    items,
    subtotal: Number(summary.subtotal || 0),
    discountAmount: Number(summary.discountAmount || 0),
    discountType: params.discountType,
    taxAmount: Number(summary.taxAmount || 0),
    totalAmount: Number(summary.totalAmount || 0),
    totalCost: Number(summary.totalCost || 0),
    totalProfit: Number(summary.totalProfit || 0),
    paymentMethod: params.paymentMethod,
    paymentStatus: 'VERIFIED',
    gatewayProvider: params.gatewayProvider,
    gatewayOrderId: params.gatewayOrderId,
    cashReceived: Number(summary.cashReceived || 0),
    changeAmount: Number(summary.changeAmount || 0),
    customerId: customer?.id,
    customerName: customer?.name,
    pointsEarned: Number(summary.pointsEarned || 0),
    pointsRedeemed: Number(summary.pointsRedeemed || 0),
    createdAt: now,
    updatedAt: now,
  };
}

export async function inviteStaffAndShareAccess(params: {
  store: StoreProfile;
  staffName: string;
  staffEmail: string;
  canAccessKasir: boolean;
  canManageProducts: boolean;
  canManageCategories: boolean;
  canViewTransactions: boolean;
  canViewReports: boolean;
  canManageSettings: boolean;
}): Promise<void> {
  const client = getSupabaseClientOrThrow();
  const emailLower = params.staffEmail.trim().toLowerCase().slice(0, 160);

  const { error } = await client.from('store_members').upsert(
    {
      store_id: params.store.id,
      email: emailLower,
      display_name: params.staffName.trim().slice(0, 100),
      role: 'KASIR',
      active: true,
      status: 'PENDING',
      can_access_kasir: params.canAccessKasir,
      can_manage_products: params.canManageProducts,
      can_manage_categories: params.canManageCategories,
      can_view_transactions: params.canViewTransactions,
      can_view_reports: params.canViewReports,
      can_manage_settings: params.canManageSettings,
    },
    { onConflict: 'store_id,email' }
  );
  if (error) throw error;

  emitLocalChange(
    `staff:${params.store.id}`,
    `store:${params.store.id}`,
    `invites:email:${emailLower}`,
    'invites:all'
  );
}

export async function updateStaffPermissions(
  storeId: string,
  staff: StaffMember
): Promise<void> {
  const client = getSupabaseClientOrThrow();
  const { error } = await client
    .from('store_members')
    .update({
      display_name: staff.displayName.trim().slice(0, 100),
      role: staff.role,
      active: staff.active,
      can_access_kasir: staff.canAccessKasir,
      can_manage_products: staff.canManageProducts,
      can_manage_categories: staff.canManageCategories,
      can_view_transactions: staff.canViewTransactions,
      can_view_reports: staff.canViewReports,
      can_manage_settings: staff.canManageSettings,
    })
    .eq('id', staff.id)
    .eq('store_id', storeId);
  if (error) throw error;

  emitLocalChange(`staff:${storeId}`, `store:${storeId}`);
}

export async function removeStaffMember(
  store: StoreProfile,
  staff: StaffMember
): Promise<void> {
  const client = getSupabaseClientOrThrow();
  const { error } = await client
    .from('store_members')
    .delete()
    .eq('id', staff.id)
    .eq('store_id', store.id);
  if (error) throw error;

  emitLocalChange(`staff:${store.id}`, `store:${store.id}`, 'invites:all');
}

export async function deleteInvite(inviteId: string): Promise<void> {
  const client = getSupabaseClientOrThrow();
  const { error } = await client.from('store_members').delete().eq('id', inviteId);
  if (error) throw error;
  emitLocalChange('invites:all');
}

export function buildBackupJson(params: {
  store: StoreProfile;
  categories: Category[];
  products: Product[];
  customers: Customer[];
  transactions: PosTransaction[];
}): string {
  const payload: StoreBackupPayload = {
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    store: {
      name: params.store.name,
      businessType: params.store.businessType || '',
      logoIconKey: params.store.logoIconKey,
      logoBase64: params.store.logoBase64,
      themePaletteKey: params.store.themePaletteKey,
      address: params.store.address,
      whatsapp: params.store.whatsapp,
      email: params.store.email,
      ownerName: params.store.ownerName,
      description: params.store.description,
      receiptFooter: params.store.receiptFooter,
      taxPercent: params.store.taxPercent,
      defaultDiscountPercent: params.store.defaultDiscountPercent,
      paymentGatewayProvider: 'MIDTRANS',
      bankTransferInfo: params.store.bankTransferInfo,
    },
    categories: params.categories.map((c) => ({
      id: c.id,
      name: c.name,
      colorHex: c.colorHex,
    })),
    products: params.products.map((p) => ({
      id: p.id,
      name: p.name,
      categoryId: p.categoryId,
      categoryName: p.categoryName,
      barcode: p.barcode,
      costPrice: p.costPrice,
      sellPrice: p.sellPrice,
      stock: p.stock,
      unit: p.unit,
      minStockAlert: p.minStockAlert,
      imageBase64: p.imageBase64,
    })),
    customers: params.customers.map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email,
      address: c.address,
      notes: c.notes,
      loyaltyPoints: c.loyaltyPoints,
      totalSpent: c.totalSpent,
      visitCount: c.visitCount,
    })),
    transactions: params.transactions.map((t) => ({
      id: t.id,
      invoiceNumber: t.invoiceNumber,
      cashierUid: t.cashierUid,
      cashierName: t.cashierName,
      note: t.note,
      items: t.items,
      subtotal: t.subtotal,
      discountAmount: t.discountAmount,
      discountType: t.discountType,
      taxAmount: t.taxAmount,
      totalAmount: t.totalAmount,
      totalCost: t.totalCost,
      totalProfit: t.totalProfit,
      paymentMethod: t.paymentMethod,
      paymentStatus: 'VERIFIED',
      gatewayProvider: t.gatewayProvider,
      gatewayOrderId: t.gatewayOrderId,
      cashReceived: t.cashReceived,
      changeAmount: t.changeAmount,
      customerId: t.customerId,
      customerName: t.customerName,
      pointsEarned: t.pointsEarned,
      pointsRedeemed: t.pointsRedeemed,
      createdAtIso: t.createdAt ? t.createdAt.toISOString() : undefined,
    })),
  };
  return JSON.stringify(payload, null, 2);
}

export async function restoreFromBackupJson(params: {
  store: StoreProfile;
  currentUid: string;
  jsonText: string;
}): Promise<{ categories: number; products: number; customers: number; transactions: number }> {
  const client = getSupabaseClientOrThrow();
  const parsed = JSON.parse(params.jsonText) as Partial<StoreBackupPayload>;
  if (!parsed || typeof parsed !== 'object' || !parsed.store) {
    throw new Error('Format file backup JSON tidak valid.');
  }

  const { store, currentUid } = params;

  await updateStoreSettings({
    ...store,
    name: String(parsed.store.name || store.name).slice(0, 60),
    businessType: String(parsed.store.businessType || store.businessType || '').slice(0, 60),
    logoIconKey: parsed.store.logoIconKey || store.logoIconKey,
    logoBase64: parsed.store.logoBase64 ?? store.logoBase64,
    themePaletteKey: parsed.store.themePaletteKey || store.themePaletteKey,
    address: String(parsed.store.address || '').slice(0, 240),
    whatsapp: String(parsed.store.whatsapp || '').slice(0, 40),
    email: String(parsed.store.email || store.email).slice(0, 160),
    ownerName: String(parsed.store.ownerName || store.ownerName).slice(0, 100),
    description: String(parsed.store.description || '').slice(0, 300),
    receiptFooter: String(parsed.store.receiptFooter || 'Terima kasih!').slice(0, 240),
    taxPercent: Math.min(100, Math.max(0, Number(parsed.store.taxPercent || 0))),
    defaultDiscountPercent: Math.min(
      100,
      Math.max(0, Number(parsed.store.defaultDiscountPercent || 0))
    ),
    bankTransferInfo: String(parsed.store.bankTransferInfo || '').slice(0, 240),
  });

  const catIdMap = new Map<string, string>();
  const cats = Array.isArray(parsed.categories) ? parsed.categories : [];
  if (cats.length > 0) {
    const catRows = cats.map((c) => {
      const nextId = isUuid(c.id) ? c.id : createUuid();
      if (c.id) catIdMap.set(c.id, nextId);
      return {
        id: nextId,
        store_id: store.id,
        name: String(c.name || 'Kategori').slice(0, 50),
        color_hex: String(c.colorHex || '#16A34A').slice(0, 16),
      };
    });
    const { error } = await client.from('categories').upsert(catRows, { onConflict: 'id' });
    if (error) throw error;
  }

  const prodIdMap = new Map<string, string>();
  const prods = Array.isArray(parsed.products) ? parsed.products : [];
  if (prods.length > 0) {
    const prodRows = prods.map((p) => {
      const nextId = isUuid(p.id) ? p.id : createUuid();
      if (p.id) prodIdMap.set(p.id, nextId);
      const mappedCatId = p.categoryId ? catIdMap.get(p.categoryId) || p.categoryId : '';
      return {
        id: nextId,
        store_id: store.id,
        category_id: isUuid(mappedCatId) ? mappedCatId : null,
        category_name: String(p.categoryName || 'Umum').slice(0, 50),
        name: String(p.name || 'Produk').slice(0, 100),
        barcode: String(p.barcode || '').slice(0, 64),
        cost_price: Math.max(0, Math.round(Number(p.costPrice || 0))),
        sell_price: Math.max(0, Math.round(Number(p.sellPrice || 0))),
        stock: Math.max(0, Math.round(Number(p.stock || 0))),
        unit: String(p.unit || 'pcs').slice(0, 20),
        min_stock_alert: Math.max(0, Math.round(Number(p.minStockAlert ?? 5))),
        image_base64: p.imageBase64 ?? null,
      };
    });
    const { error } = await client.from('products').upsert(prodRows, { onConflict: 'id' });
    if (error) throw error;
  }

  const custIdMap = new Map<string, string>();
  const custs = Array.isArray(parsed.customers) ? parsed.customers : [];
  if (custs.length > 0) {
    const custRows = custs.map((c) => {
      const nextId = isUuid(c.id) ? c.id : createUuid();
      if (c.id) custIdMap.set(c.id, nextId);
      return {
        id: nextId,
        store_id: store.id,
        name: String(c.name || 'Pelanggan').slice(0, 100),
        phone: String(c.phone || '').slice(0, 40),
        email: String(c.email || '').slice(0, 160),
        address: String(c.address || '').slice(0, 240),
        notes: String(c.notes || '').slice(0, 300),
        loyalty_points: Math.max(0, Math.round(Number(c.loyaltyPoints || 0))),
        total_spent: Math.max(0, Math.round(Number(c.totalSpent || 0))),
        visit_count: Math.max(0, Math.round(Number(c.visitCount || 0))),
      };
    });
    const { error } = await client.from('customers').upsert(custRows, { onConflict: 'id' });
    if (error) throw error;
  }

  const txs = Array.isArray(parsed.transactions) ? parsed.transactions : [];
  let restoredTxCount = 0;
  for (const t of txs) {
    if (!Array.isArray(t.items) || t.items.length === 0) continue;
    const txId = isUuid(t.id) ? t.id : createUuid();
    const mappedCustId = t.customerId ? custIdMap.get(t.customerId) || t.customerId : '';
    const parsedDate = t.createdAtIso ? new Date(t.createdAtIso) : null;
    const createdIso =
      parsedDate && !Number.isNaN(parsedDate.getTime())
        ? parsedDate.toISOString()
        : new Date().toISOString();

    const { error: txErr } = await client.from('transactions').upsert(
      {
        id: txId,
        store_id: store.id,
        invoice_number: String(t.invoiceNumber || `INV-${txId.slice(0, 6)}`).slice(0, 64),
        cashier_id: currentUid,
        cashier_name: String(t.cashierName || store.ownerName || 'Pemilik').slice(0, 100),
        customer_id: isUuid(mappedCustId) ? mappedCustId : null,
        customer_name: t.customerName ? String(t.customerName).slice(0, 100) : null,
        note: String(t.note || '').slice(0, 240),
        subtotal: Math.max(0, Math.round(Number(t.subtotal || 0))),
        discount_amount: Math.max(0, Math.round(Number(t.discountAmount || 0))),
        discount_type: t.discountType === 'PERCENT' ? 'PERCENT' : 'NOMINAL',
        tax_amount: Math.max(0, Math.round(Number(t.taxAmount || 0))),
        total_amount: Math.max(0, Math.round(Number(t.totalAmount || 0))),
        total_cost: Math.max(0, Math.round(Number(t.totalCost || 0))),
        total_profit: Math.round(Number(t.totalProfit || 0)),
        points_earned: Math.max(0, Math.round(Number(t.pointsEarned || 0))),
        points_redeemed: Math.max(0, Math.round(Number(t.pointsRedeemed || 0))),
        created_at: createdIso,
      },
      { onConflict: 'id' }
    );
    if (txErr) throw txErr;

    await client.from('transaction_details').delete().eq('transaction_id', txId);
    const detailRows = t.items.map((item) => {
      const mappedProdId = item.productId
        ? prodIdMap.get(item.productId) || item.productId
        : '';
      const mappedCatId = item.categoryId
        ? catIdMap.get(item.categoryId) || item.categoryId
        : '';
      return {
        transaction_id: txId,
        store_id: store.id,
        product_id: isUuid(mappedProdId) ? mappedProdId : null,
        product_name: String(item.productName || 'Produk'),
        category_id: isUuid(mappedCatId) ? mappedCatId : null,
        category_name: String(item.categoryName || 'Umum'),
        unit: String(item.unit || 'pcs'),
        quantity: Math.max(1, Math.round(Number(item.quantity || 1))),
        cost_price: Math.max(0, Math.round(Number(item.costPrice || 0))),
        sell_price: Math.max(0, Math.round(Number(item.sellPrice || 0))),
        discount_type: item.discountType === 'PERCENT' ? 'PERCENT' : 'NOMINAL',
        discount_value: Math.max(0, Math.round(Number(item.discountValue || 0))),
        discount_amount: Math.max(0, Math.round(Number(item.discountAmount || 0))),
        line_total: Math.max(0, Math.round(Number(item.lineTotal || 0))),
        line_profit: Math.round(Number(item.lineProfit || 0)),
      };
    });
    const { error: detErr } = await client.from('transaction_details').insert(detailRows);
    if (detErr) throw detErr;

    await client.from('payments').delete().eq('transaction_id', txId);
    const { error: payErr } = await client.from('payments').insert({
      transaction_id: txId,
      store_id: store.id,
      payment_method: t.paymentMethod || 'TUNAI',
      payment_status: 'VERIFIED',
      gateway_provider: String(t.gatewayProvider || '').slice(0, 32),
      gateway_order_id: String(t.gatewayOrderId || '').slice(0, 128),
      amount: Math.max(0, Math.round(Number(t.totalAmount || 0))),
      cash_received: Math.max(0, Math.round(Number(t.cashReceived || 0))),
      change_amount: Math.max(0, Math.round(Number(t.changeAmount || 0))),
      paid_at: createdIso,
    });
    if (payErr) throw payErr;

    restoredTxCount += 1;
  }

  emitLocalChange(
    `store:${store.id}`,
    `settings:${store.id}`,
    `categories:${store.id}`,
    `products:${store.id}`,
    `customers:${store.id}`,
    `transactions:${store.id}`
  );

  return {
    categories: cats.length,
    products: prods.length,
    customers: custs.length,
    transactions: restoredTxCount,
  };
}

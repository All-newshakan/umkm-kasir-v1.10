export type UserRole = 'OWNER' | 'KASIR';

export type StoreLogoIconKey = 'STORE' | 'CART' | 'COFFEE' | 'FOOD' | 'BAG' | 'SPARK';

export type StoreThemePaletteKey = 'EMERALD' | 'SAGE' | 'TEAL' | 'OCEAN' | 'TERRACOTTA';

export type PaymentMethod = 'TUNAI' | 'QRIS' | 'VIRTUAL_ACCOUNT' | 'EWALLET' | 'TRANSFER';

export type DiscountType = 'NOMINAL' | 'PERCENT';

export type ReportPeriod = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

export interface BrandPalette {
  key: StoreThemePaletteKey;
  label: string;
  primary: string;
  primaryDark: string;
  secondary: string;
  accent: string;
  soft: string;
}

export const BRAND_PALETTES: Record<StoreThemePaletteKey, BrandPalette> = {
  EMERALD: {
    key: 'EMERALD',
    label: 'Zamrud',
    primary: '#14532D',
    primaryDark: '#052E16',
    secondary: '#16A34A',
    accent: '#D97706',
    soft: '#DCFCE7',
  },
  SAGE: {
    key: 'SAGE',
    label: 'Hijau Segar',
    primary: '#166534',
    primaryDark: '#14532D',
    secondary: '#22C55E',
    accent: '#EA580C',
    soft: '#DCFCE7',
  },
  TEAL: {
    key: 'TEAL',
    label: 'Teal Modern',
    primary: '#115E59',
    primaryDark: '#042F2E',
    secondary: '#0D9488',
    accent: '#F59E0B',
    soft: '#CCFBF1',
  },
  OCEAN: {
    key: 'OCEAN',
    label: 'Biru Laut',
    primary: '#1E3A8A',
    primaryDark: '#172554',
    secondary: '#2563EB',
    accent: '#F97316',
    soft: '#DBEAFE',
  },
  TERRACOTTA: {
    key: 'TERRACOTTA',
    label: 'Terakota',
    primary: '#7C2D12',
    primaryDark: '#431407',
    secondary: '#EA580C',
    accent: '#0D9488',
    soft: '#FFEDD5',
  },
};

export const CATEGORY_COLOR_CHOICES = [
  '#16A34A',
  '#0D9488',
  '#2563EB',
  '#D97706',
  '#DC2626',
  '#7C3AED',
  '#DB2777',
];

export const UNIT_CHOICES = ['pcs', 'porsi', 'botol', 'box', 'kg', 'liter', 'pack'];

export const BUSINESS_TYPE_CHOICES = [
  'Warung / Sembako',
  'Kuliner / Kafe',
  'Ritel / Minimarket',
  'Fashion / Butik',
  'Jasa / Layanan',
  'Lainnya',
];

export interface UserProfile {
  userId: string;
  email: string;
  displayName: string;
  activeStoreId: string;
  role: UserRole;
  createdAt?: Date | null;
  updatedAt?: Date | null;
}

export interface StaffInvite {
  id: string;
  storeId: string;
  storeName: string;
  ownerUid: string;
  staffEmail: string;
  staffName: string;
  role: 'KASIR';
  canAccessKasir: boolean;
  canManageProducts: boolean;
  canManageCategories: boolean;
  canViewTransactions: boolean;
  canViewReports: boolean;
  canManageSettings: boolean;
  status: 'PENDING' | 'ACCEPTED' | 'REVOKED';
  acceptedByUid?: string;
  createdAt?: Date | null;
  updatedAt?: Date | null;
}

export interface StaffMember {
  id: string;
  staffUid: string;
  storeId: string;
  ownerUid: string;
  inviteId: string;
  email: string;
  displayName: string;
  role: UserRole;
  active: boolean;
  canAccessKasir: boolean;
  canManageProducts: boolean;
  canManageCategories: boolean;
  canViewTransactions: boolean;
  canViewReports: boolean;
  canManageSettings: boolean;
  createdAt?: Date | null;
  updatedAt?: Date | null;
}

export interface StoreProfile {
  id: string;
  ownerUid: string;
  memberUids: string[];
  memberEmails: string[];
  name: string;
  businessType?: string;
  logoIconKey: StoreLogoIconKey;
  logoBase64?: string;
  themePaletteKey: StoreThemePaletteKey;
  address: string;
  whatsapp: string;
  email: string;
  ownerName: string;
  description: string;
  receiptFooter: string;
  taxPercent: number;
  defaultDiscountPercent: number;
  paymentGatewayProvider: 'MIDTRANS';
  bankTransferInfo: string;
  createdAt?: Date | null;
  updatedAt?: Date | null;
}

export interface Category {
  id: string;
  storeId: string;
  ownerUid: string;
  memberUids: string[];
  memberEmails: string[];
  name: string;
  colorHex: string;
  createdAt?: Date | null;
  updatedAt?: Date | null;
}

export interface Product {
  id: string;
  storeId: string;
  ownerUid: string;
  memberUids: string[];
  memberEmails: string[];
  name: string;
  categoryId: string;
  categoryName: string;
  barcode: string;
  costPrice: number;
  sellPrice: number;
  stock: number;
  unit: string;
  minStockAlert: number;
  imageBase64?: string;
  createdAt?: Date | null;
  updatedAt?: Date | null;
}

export interface Customer {
  id: string;
  storeId: string;
  ownerUid: string;
  memberUids: string[];
  memberEmails: string[];
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  loyaltyPoints: number;
  totalSpent: number;
  visitCount: number;
  lastPurchaseAt?: Date | null;
  createdAt?: Date | null;
  updatedAt?: Date | null;
}

export interface TransactionItem {
  productId: string;
  productName: string;
  categoryId: string;
  categoryName: string;
  unit: string;
  quantity: number;
  costPrice: number;
  sellPrice: number;
  discountType?: DiscountType;
  discountValue?: number;
  discountAmount?: number;
  lineTotal: number;
  lineProfit: number;
}

export interface PosTransaction {
  id: string;
  storeId: string;
  ownerUid: string;
  memberUids: string[];
  memberEmails: string[];
  invoiceNumber: string;
  cashierUid: string;
  cashierName: string;
  note: string;
  items: TransactionItem[];
  subtotal: number;
  discountAmount: number;
  discountType: DiscountType;
  taxAmount: number;
  totalAmount: number;
  totalCost: number;
  totalProfit: number;
  paymentMethod: PaymentMethod;
  paymentStatus: 'VERIFIED';
  gatewayProvider: string;
  gatewayOrderId: string;
  cashReceived: number;
  changeAmount: number;
  customerId?: string;
  customerName?: string;
  pointsEarned?: number;
  pointsRedeemed?: number;
  hasPendingWrites?: boolean;
  createdAt?: Date | null;
  updatedAt?: Date | null;
}

export interface CartLine {
  product: Product;
  quantity: number;
  discountType: DiscountType;
  discountValue: number;
}

export function getCartLineTotals(line: CartLine) {
  const gross = line.product.sellPrice * line.quantity;
  const discount =
    line.discountType === 'PERCENT'
      ? Math.round((gross * Math.min(100, Math.max(0, line.discountValue))) / 100)
      : Math.min(gross, Math.max(0, Math.round(line.discountValue)));
  const netTotal = Math.max(0, gross - discount);
  const totalCost = line.product.costPrice * line.quantity;
  const netProfit = netTotal - totalCost;
  return { gross, discount, netTotal, totalCost, netProfit };
}

export interface StoreBackupPayload {
  schemaVersion: number;
  exportedAt: string;
  store: {
    name: string;
    businessType?: string;
    logoIconKey: StoreLogoIconKey;
    logoBase64?: string;
    themePaletteKey: StoreThemePaletteKey;
    address: string;
    whatsapp: string;
    email: string;
    ownerName: string;
    description: string;
    receiptFooter: string;
    taxPercent: number;
    defaultDiscountPercent: number;
    paymentGatewayProvider: 'MIDTRANS';
    bankTransferInfo: string;
  };
  categories: Array<{ id: string; name: string; colorHex: string }>;
  products: Array<{
    id: string;
    name: string;
    categoryId: string;
    categoryName: string;
    barcode: string;
    costPrice: number;
    sellPrice: number;
    stock: number;
    unit: string;
    minStockAlert: number;
    imageBase64?: string;
  }>;
  customers: Array<{
    id: string;
    name: string;
    phone: string;
    email: string;
    address: string;
    notes: string;
    loyaltyPoints: number;
    totalSpent: number;
    visitCount: number;
  }>;
  transactions: Array<{
    id: string;
    invoiceNumber: string;
    cashierUid: string;
    cashierName: string;
    note: string;
    items: TransactionItem[];
    subtotal: number;
    discountAmount: number;
    discountType: DiscountType;
    taxAmount: number;
    totalAmount: number;
    totalCost: number;
    totalProfit: number;
    paymentMethod: PaymentMethod;
    paymentStatus: 'VERIFIED';
    gatewayProvider: string;
    gatewayOrderId: string;
    cashReceived: number;
    changeAmount: number;
    customerId?: string;
    customerName?: string;
    pointsEarned?: number;
    pointsRedeemed?: number;
    createdAtIso?: string;
  }>;
}

export interface MidtransConfigStatus {
  configured: boolean;
  isProduction: boolean;
}

export interface MidtransChargeResult {
  orderId: string;
  transactionId: string;
  transactionStatus: string;
  fraudStatus: string;
  grossAmount: number;
  qrString: string;
  qrImageUrl: string;
  deeplinkUrl: string;
  vaNumber: string;
  bankName: string;
  expiryTime: string;
  isProduction: boolean;
}

export interface StaffPermissionsSummary {
  canAccessKasir: boolean;
  canManageProducts: boolean;
  canManageCategories: boolean;
  canViewTransactions: boolean;
  canViewReports: boolean;
  canManageSettings: boolean;
}

export function getStaffPermissions(
  role: UserRole,
  staffMember: StaffMember | null
): StaffPermissionsSummary {
  if (role === 'OWNER') {
    return {
      canAccessKasir: true,
      canManageProducts: true,
      canManageCategories: true,
      canViewTransactions: true,
      canViewReports: true,
      canManageSettings: true,
    };
  }
  if (!staffMember || !staffMember.active) {
    return {
      canAccessKasir: false,
      canManageProducts: false,
      canManageCategories: false,
      canViewTransactions: false,
      canViewReports: false,
      canManageSettings: false,
    };
  }
  return {
    canAccessKasir: staffMember.canAccessKasir,
    canManageProducts: staffMember.canManageProducts,
    canManageCategories: staffMember.canManageCategories,
    canViewTransactions: staffMember.canViewTransactions,
    canViewReports: staffMember.canViewReports,
    canManageSettings: staffMember.canManageSettings,
  };
}

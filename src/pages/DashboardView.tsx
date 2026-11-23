import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Package,
  Receipt,
  Settings,
  ShoppingCart,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import type {
  Customer,
  PosTransaction,
  Product,
  StaffPermissionsSummary,
  StoreProfile,
  UserRole,
} from '../types/models';
import { BRAND_PALETTES } from '../types/models';
import {
  formatCompactRupiah,
  formatDateTime,
  formatNumber,
  formatRupiah,
  formatShortDate,
} from '../lib/formatters';
import { DynamicStoreLogo } from '../components/DynamicStoreLogo';
import { SalesChart, type SalesChartPoint } from '../components/SalesChart';

export type AppTab =
  | 'DASHBOARD'
  | 'CASHIER'
  | 'PRODUCTS'
  | 'TRANSACTIONS'
  | 'CUSTOMERS'
  | 'REPORTS'
  | 'SETTINGS';

interface DashboardViewProps {
  store: StoreProfile;
  products: Product[];
  transactions: PosTransaction[];
  customers: Customer[];
  permissions: StaffPermissionsSummary;
  role: UserRole;
  onNavigate: (tab: AppTab) => void;
  onSelectTransaction: (tx: PosTransaction) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  store,
  products,
  transactions,
  customers,
  permissions,
  role,
  onNavigate,
  onSelectTransaction,
}) => {
  const [chartRange, setChartRange] = useState<'7D' | '6M'>('7D');
  const palette = BRAND_PALETTES[store.themePaletteKey] || BRAND_PALETTES.EMERALD;

  const todayStats = useMemo(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const todayMs = startOfToday.getTime();

    let todayRevenue = 0;
    let todayProfit = 0;
    let todayCount = 0;

    transactions.forEach((tx) => {
      const time = tx.createdAt?.getTime() || 0;
      if (time >= todayMs) {
        todayRevenue += tx.totalAmount;
        todayProfit += tx.totalProfit;
        todayCount += 1;
      }
    });

    const lowStockProducts = products.filter((p) => p.stock <= p.minStockAlert);
    return {
      todayRevenue,
      todayProfit,
      todayCount,
      lowStockProducts,
    };
  }, [transactions, products]);

  const chartData = useMemo<SalesChartPoint[]>(() => {
    const now = new Date();
    if (chartRange === '7D') {
      const points: SalesChartPoint[] = [];
      for (let i = 6; i >= 0; i -= 1) {
        const d = new Date(now);
        d.setDate(now.getDate() - i);
        d.setHours(0, 0, 0, 0);
        const start = d.getTime();
        const end = start + 86_400_000;

        let rev = 0;
        let prof = 0;
        let count = 0;
        transactions.forEach((tx) => {
          const t = tx.createdAt?.getTime() || 0;
          if (t >= start && t < end) {
            rev += tx.totalAmount;
            prof += tx.totalProfit;
            count += 1;
          }
        });
        points.push({
          label: formatShortDate(d),
          revenue: rev,
          profit: prof,
          transactionsCount: count,
        });
      }
      return points;
    }

    const monthFmt = new Intl.DateTimeFormat('id-ID', { month: 'short' });
    const points: SalesChartPoint[] = [];
    for (let i = 5; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const start = d.getTime();
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();

      let rev = 0;
      let prof = 0;
      let count = 0;
      transactions.forEach((tx) => {
        const t = tx.createdAt?.getTime() || 0;
        if (t >= start && t < end) {
          rev += tx.totalAmount;
          prof += tx.totalProfit;
          count += 1;
        }
      });
      points.push({
        label: monthFmt.format(d),
        revenue: rev,
        profit: prof,
        transactionsCount: count,
      });
    }
    return points;
  }, [transactions, chartRange]);

  const quickMenus = [
    {
      tab: 'CASHIER' as AppTab,
      label: 'Buka Kasir',
      desc: 'Mulai transaksi baru',
      icon: ShoppingCart,
      allowed: permissions.canAccessKasir,
    },
    {
      tab: 'PRODUCTS' as AppTab,
      label: 'Produk & Stok',
      desc: `${formatNumber(products.length)} item`,
      icon: Package,
      allowed: true,
    },
    {
      tab: 'TRANSACTIONS' as AppTab,
      label: 'Riwayat Struk',
      desc: `${formatNumber(transactions.length)} nota`,
      icon: Receipt,
      allowed: permissions.canViewTransactions,
    },
    {
      tab: 'CUSTOMERS' as AppTab,
      label: 'Pelanggan',
      desc: `${formatNumber(customers.length)} member`,
      icon: Users,
      allowed: true,
    },
    {
      tab: 'REPORTS' as AppTab,
      label: 'Laporan',
      desc: 'Analisis laba & ekspor',
      icon: BarChart3,
      allowed: permissions.canViewReports,
    },
    {
      tab: 'SETTINGS' as AppTab,
      label: 'Pengaturan',
      desc: 'Profil, staf & backup',
      icon: Settings,
      allowed: permissions.canManageSettings,
    },
  ].filter((m) => m.allowed);

  return (
    <div className="space-y-6">
      <div
        className="rounded-2xl p-6 text-white shadow-sm overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${palette.primaryDark} 0%, ${palette.primary} 55%, ${palette.secondary} 100%)`,
        }}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="flex items-center gap-4 min-w-0">
            <DynamicStoreLogo
              storeName={store.name}
              logoIconKey={store.logoIconKey}
              logoBase64={store.logoBase64}
              themePaletteKey={store.themePaletteKey}
              size="lg"
              className="ring-2 ring-white/25"
            />
            <div className="min-w-0 space-y-1">
              <p className="text-xs font-medium text-white/80">
                {role === 'OWNER' ? 'Pemilik' : 'Kasir'}: {store.ownerName || 'Pemilik Toko'}
                {store.businessType ? ` · ${store.businessType}` : ''}
                {store.address ? ` · ${store.address}` : ''}
              </p>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight truncate">
                {store.name}
              </h1>
              {store.description && (
                <p className="text-xs text-white/80 truncate">{store.description}</p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="px-4 py-2.5 rounded-xl bg-white/12 border border-white/15 backdrop-blur-xs">
              <p className="text-[11px] uppercase tracking-wider text-white/75">
                Omzet Hari Ini
              </p>
              <p className="text-lg sm:text-xl font-bold tabular-nums">
                {formatRupiah(todayStats.todayRevenue)}
              </p>
            </div>
            {permissions.canAccessKasir && (
              <button
                type="button"
                onClick={() => onNavigate('CASHIER')}
                className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-white text-slate-900 hover:bg-slate-100 text-sm font-semibold transition-colors whitespace-nowrap"
              >
                <ShoppingCart className="w-4 h-4" />
                Transaksi Baru
              </button>
            )}
          </div>
        </div>
      </div>

      {todayStats.lowStockProducts.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/35 border border-amber-200 dark:border-amber-900/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-amber-950 dark:text-amber-100">
                {todayStats.lowStockProducts.length} Produk Stok Menipis
              </p>
              <p className="text-xs text-amber-800 dark:text-amber-300">
                {todayStats.lowStockProducts
                  .slice(0, 3)
                  .map((p) => `${p.name} (${p.stock} ${p.unit})`)
                  .join(' · ')}
                {todayStats.lowStockProducts.length > 3 ? ' · dan lainnya' : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('PRODUCTS')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold transition-colors whitespace-nowrap"
          >
            Kelola Stok
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-2">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Penjualan Hari Ini</span>
            <Wallet className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
            {formatCompactRupiah(todayStats.todayRevenue)}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {formatRupiah(todayStats.todayRevenue)}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-2">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Keuntungan Hari Ini</span>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
            {formatCompactRupiah(todayStats.todayProfit)}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {formatRupiah(todayStats.todayProfit)}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-2">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Transaksi Hari Ini</span>
            <Receipt className="w-4 h-4 text-sky-600" />
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
            {formatNumber(todayStats.todayCount)}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Total {formatNumber(transactions.length)} nota tersimpan
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-2">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Katalog &amp; Pelanggan</span>
            <Package className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
            {formatNumber(products.length)}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {formatNumber(customers.length)} pelanggan ·{' '}
            {todayStats.lowStockProducts.length} stok menipis
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Tren Penjualan &amp; Keuntungan
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Ketuk atau arahkan kursor ke batang grafik untuk rincian
              </p>
            </div>
            <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-700 p-1 bg-slate-50 dark:bg-slate-800/70">
              <button
                type="button"
                onClick={() => setChartRange('7D')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                  chartRange === '7D'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                7 Hari
              </button>
              <button
                type="button"
                onClick={() => setChartRange('6M')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                  chartRange === '6M'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                6 Bulan
              </button>
            </div>
          </div>

          <SalesChart data={chartData} height={220} />
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Akses Cepat Menu
          </h2>
          <div className="grid grid-cols-2 gap-2.5">
            {quickMenus.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.tab}
                  type="button"
                  onClick={() => onNavigate(item.tab)}
                  className="flex flex-col items-start gap-2 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-emerald-600/50 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-left transition-colors"
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-white"
                    style={{ backgroundColor: 'var(--brand-primary)' }}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white leading-tight">
                      {item.label}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {item.desc}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {permissions.canViewTransactions && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Transaksi Terbaru
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Ketuk transaksi untuk melihat atau mencetak ulang struk
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('TRANSACTIONS')}
              className="text-xs font-semibold hover:underline whitespace-nowrap"
              style={{ color: 'var(--brand-secondary)' }}
            >
              Lihat Semua
            </button>
          </div>

          {transactions.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
              Belum ada transaksi tercatat. Buka Kasir untuk mencatat penjualan pertama.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {transactions.slice(0, 5).map((tx) => (
                <button
                  key={tx.id}
                  type="button"
                  onClick={() => onSelectTransaction(tx)}
                  className="w-full flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-left transition-colors"
                >
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-sm font-semibold font-mono text-slate-900 dark:text-white truncate">
                      {tx.invoiceNumber}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {formatDateTime(tx.createdAt)} · {tx.paymentMethod} ·{' '}
                      {tx.items.length} item
                      {tx.customerName ? ` · ${tx.customerName}` : ''}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-slate-900 dark:text-white tabular-nums">
                      {formatRupiah(tx.totalAmount)}
                    </p>
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 tabular-nums">
                      Laba {formatRupiah(tx.totalProfit)}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

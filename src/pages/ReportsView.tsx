import React, { useMemo, useState } from 'react';
import {
  Award,
  Download,
  FileSpreadsheet,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import type {
  Category,
  PosTransaction,
  Product,
  ReportPeriod,
  StoreProfile,
} from '../types/models';
import {
  exportSalesReportExcel,
  exportSalesReportPdf,
  type ProductBreakdownRow,
} from '../lib/exporter';
import {
  formatDateInputValue,
  formatDateOnly,
  formatDateTime,
  formatNumber,
  formatRupiah,
  formatShortDate,
} from '../lib/formatters';
import { SalesChart, type SalesChartPoint } from '../components/SalesChart';

interface ReportsViewProps {
  store: StoreProfile;
  transactions: PosTransaction[];
  categories: Category[];
  products: Product[];
  onSelectTransaction: (tx: PosTransaction) => void;
  onNotify: (type: 'success' | 'error' | 'info', message: string) => void;
}

const PERIOD_TABS: Array<{ key: ReportPeriod; label: string }> = [
  { key: 'DAILY', label: 'Harian' },
  { key: 'WEEKLY', label: 'Mingguan' },
  { key: 'MONTHLY', label: 'Bulanan' },
  { key: 'YEARLY', label: 'Tahunan' },
];

export const ReportsView: React.FC<ReportsViewProps> = ({
  store,
  transactions,
  categories,
  products,
  onSelectTransaction,
  onNotify,
}) => {
  const [period, setPeriod] = useState<ReportPeriod>('MONTHLY');
  const [anchorDateStr, setAnchorDateStr] = useState<string>(() =>
    formatDateInputValue(new Date())
  );
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [productFilter, setProductFilter] = useState('ALL');

  const dateBounds = useMemo(() => {
    const [y, m, d] = anchorDateStr.split('-').map(Number);
    const base = new Date(y || 2025, (m || 1) - 1, d || 1);
    base.setHours(0, 0, 0, 0);

    let start: Date;
    let end: Date;
    let label = '';

    if (period === 'DAILY') {
      start = new Date(base);
      end = new Date(base);
      end.setDate(end.getDate() + 1);
      label = formatDateOnly(start);
    } else if (period === 'WEEKLY') {
      const day = base.getDay();
      const diffToMonday = day === 0 ? -6 : 1 - day;
      start = new Date(base);
      start.setDate(base.getDate() + diffToMonday);
      end = new Date(start);
      end.setDate(start.getDate() + 7);
      const endDisplay = new Date(end.getTime() - 86_400_000);
      label = `${formatShortDate(start)} – ${formatDateOnly(endDisplay)}`;
    } else if (period === 'MONTHLY') {
      start = new Date(base.getFullYear(), base.getMonth(), 1);
      end = new Date(base.getFullYear(), base.getMonth() + 1, 1);
      label = new Intl.DateTimeFormat('id-ID', {
        month: 'long',
        year: 'numeric',
      }).format(start);
    } else {
      start = new Date(base.getFullYear(), 0, 1);
      end = new Date(base.getFullYear() + 1, 0, 1);
      label = `Tahun ${base.getFullYear()}`;
    }

    return { startMs: start.getTime(), endMs: end.getTime(), start, end, label };
  }, [period, anchorDateStr]);

  const analytics = useMemo(() => {
    const periodTxs = transactions.filter((tx) => {
      const ms = tx.createdAt?.getTime() || 0;
      return ms >= dateBounds.startMs && ms < dateBounds.endMs;
    });

    const filteredTxs: PosTransaction[] = [];
    const productMap = new Map<string, ProductBreakdownRow>();

    let totalRevenue = 0;
    let totalCost = 0;
    let totalProfit = 0;
    let totalItemsSold = 0;

    periodTxs.forEach((tx) => {
      const matchingItems = tx.items.filter((item) => {
        if (categoryFilter !== 'ALL' && item.categoryId !== categoryFilter) {
          return false;
        }
        if (productFilter !== 'ALL' && item.productId !== productFilter) {
          return false;
        }
        return true;
      });

      if (matchingItems.length === 0) return;
      filteredTxs.push(tx);

      const isUnfiltered = categoryFilter === 'ALL' && productFilter === 'ALL';
      if (isUnfiltered) {
        totalRevenue += tx.totalAmount;
        totalCost += tx.totalCost;
        totalProfit += tx.totalProfit;
      }

      matchingItems.forEach((item) => {
        totalItemsSold += item.quantity;
        if (!isUnfiltered) {
          totalRevenue += item.lineTotal;
          totalCost += item.costPrice * item.quantity;
          totalProfit += item.lineProfit;
        }
        const key = item.productId || item.productName;
        const existing = productMap.get(key) || {
          productName: item.productName,
          categoryName: item.categoryName || 'Umum',
          quantity: 0,
          revenue: 0,
          profit: 0,
        };
        existing.quantity += item.quantity;
        existing.revenue += item.lineTotal;
        existing.profit += item.lineProfit;
        productMap.set(key, existing);
      });
    });

    const productRows = Array.from(productMap.values()).sort(
      (a, b) => b.revenue - a.revenue
    );
    const topProduct = productRows[0] || null;
    const lowestProduct =
      productRows.length > 1
        ? [...productRows].sort((a, b) => a.quantity - b.quantity)[0]
        : null;

    const marginPercent =
      totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 1000) / 10 : 0;

    // Build chart points
    const chartPoints: SalesChartPoint[] = [];
    if (period === 'DAILY') {
      const buckets = [
        { label: '00-06', from: 0, to: 6 },
        { label: '06-10', from: 6, to: 10 },
        { label: '10-14', from: 10, to: 14 },
        { label: '14-18', from: 14, to: 18 },
        { label: '18-24', from: 18, to: 24 },
      ];
      buckets.forEach((b) => {
        let rev = 0;
        let prof = 0;
        let count = 0;
        filteredTxs.forEach((tx) => {
          const h = tx.createdAt?.getHours() ?? 12;
          if (h >= b.from && h < b.to) {
            rev += tx.totalAmount;
            prof += tx.totalProfit;
            count += 1;
          }
        });
        chartPoints.push({
          label: b.label,
          revenue: rev,
          profit: prof,
          transactionsCount: count,
        });
      });
    } else if (period === 'WEEKLY') {
      for (let i = 0; i < 7; i += 1) {
        const d = new Date(dateBounds.start);
        d.setDate(d.getDate() + i);
        const s = d.getTime();
        const e = s + 86_400_000;
        let rev = 0;
        let prof = 0;
        let count = 0;
        filteredTxs.forEach((tx) => {
          const t = tx.createdAt?.getTime() || 0;
          if (t >= s && t < e) {
            rev += tx.totalAmount;
            prof += tx.totalProfit;
            count += 1;
          }
        });
        chartPoints.push({
          label: formatShortDate(d),
          revenue: rev,
          profit: prof,
          transactionsCount: count,
        });
      }
    } else if (period === 'MONTHLY') {
      const weeks = [
        { label: 'Mgg 1', fromDay: 1, toDay: 8 },
        { label: 'Mgg 2', fromDay: 8, toDay: 15 },
        { label: 'Mgg 3', fromDay: 15, toDay: 22 },
        { label: 'Mgg 4', fromDay: 22, toDay: 32 },
      ];
      weeks.forEach((w) => {
        let rev = 0;
        let prof = 0;
        let count = 0;
        filteredTxs.forEach((tx) => {
          const day = tx.createdAt?.getDate() ?? 1;
          if (day >= w.fromDay && day < w.toDay) {
            rev += tx.totalAmount;
            prof += tx.totalProfit;
            count += 1;
          }
        });
        chartPoints.push({
          label: w.label,
          revenue: rev,
          profit: prof,
          transactionsCount: count,
        });
      });
    } else {
      const monthFmt = new Intl.DateTimeFormat('id-ID', { month: 'short' });
      const year = dateBounds.start.getFullYear();
      for (let m = 0; m < 12; m += 1) {
        const d = new Date(year, m, 1);
        let rev = 0;
        let prof = 0;
        let count = 0;
        filteredTxs.forEach((tx) => {
          if (tx.createdAt && tx.createdAt.getMonth() === m) {
            rev += tx.totalAmount;
            prof += tx.totalProfit;
            count += 1;
          }
        });
        chartPoints.push({
          label: monthFmt.format(d),
          revenue: rev,
          profit: prof,
          transactionsCount: count,
        });
      }
    }

    return {
      filteredTxs,
      productRows,
      topProduct,
      lowestProduct,
      totalRevenue,
      totalCost,
      totalProfit,
      totalItemsSold,
      marginPercent,
      chartPoints,
    };
  }, [transactions, dateBounds, period, categoryFilter, productFilter]);

  const handleExportPdf = () => {
    exportSalesReportPdf({
      store,
      periodLabel: dateBounds.label,
      totalRevenue: analytics.totalRevenue,
      totalProfit: analytics.totalProfit,
      totalCost: analytics.totalCost,
      totalTransactions: analytics.filteredTxs.length,
      totalItemsSold: analytics.totalItemsSold,
      productRows: analytics.productRows,
    });
    onNotify('success', 'Laporan PDF berhasil diunduh.');
  };

  const handleExportExcel = () => {
    exportSalesReportExcel({
      store,
      periodLabel: dateBounds.label,
      totalRevenue: analytics.totalRevenue,
      totalProfit: analytics.totalProfit,
      totalCost: analytics.totalCost,
      totalTransactions: analytics.filteredTxs.length,
      totalItemsSold: analytics.totalItemsSold,
      productRows: analytics.productRows,
      transactions: analytics.filteredTxs,
    });
    onNotify('success', 'Laporan Excel (.xlsx) berhasil diunduh.');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">
            Laporan Penjualan &amp; Laba
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Periode aktif: <span className="font-semibold">{dateBounds.label}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExportPdf}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5 text-red-600" />
            Ekspor PDF
          </button>
          <button
            type="button"
            onClick={handleExportExcel}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-white text-xs font-semibold transition-colors whitespace-nowrap"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Ekspor Excel
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-700 p-1 bg-slate-50 dark:bg-slate-800/70">
          {PERIOD_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setPeriod(t.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                period === t.key
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <input
          type="date"
          value={anchorDateStr}
          onChange={(e) => setAnchorDateStr(e.target.value)}
          className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-800 dark:text-slate-200"
        />

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-800 dark:text-slate-200"
        >
          <option value="ALL">Semua Kategori</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <select
          value={productFilter}
          onChange={(e) => setProductFilter(e.target.value)}
          className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-800 dark:text-slate-200"
        >
          <option value="ALL">Semua Produk</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {/* 6 KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-1">
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Total Omzet
          </p>
          <p className="text-lg font-bold text-slate-900 dark:text-white tabular-nums">
            {formatRupiah(analytics.totalRevenue)}
          </p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-1">
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Laba Bersih
          </p>
          <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
            {formatRupiah(analytics.totalProfit)}
          </p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-1">
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Modal Terjual
          </p>
          <p className="text-lg font-bold text-slate-900 dark:text-white tabular-nums">
            {formatRupiah(analytics.totalCost)}
          </p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-1">
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Margin Laba
          </p>
          <p className="text-lg font-bold text-slate-900 dark:text-white tabular-nums">
            {analytics.marginPercent}%
          </p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-1">
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Transaksi
          </p>
          <p className="text-lg font-bold text-slate-900 dark:text-white tabular-nums">
            {formatNumber(analytics.filteredTxs.length)}
          </p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-1">
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Item Terjual
          </p>
          <p className="text-lg font-bold text-slate-900 dark:text-white tabular-nums">
            {formatNumber(analytics.totalItemsSold)}
          </p>
        </div>
      </div>

      {/* Chart + Top/Lowest Product */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Grafik Performa Periode
          </h2>
          <SalesChart data={analytics.chartPoints} height={220} />
        </div>

        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              <TrendingUp className="w-4 h-4" />
              Produk Terlaris
            </div>
            {analytics.topProduct ? (
              <div className="space-y-1">
                <p className="text-base font-bold text-slate-900 dark:text-white">
                  {analytics.topProduct.productName}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  {formatNumber(analytics.topProduct.quantity)} terjual · Omzet{' '}
                  {formatRupiah(analytics.topProduct.revenue)}
                </p>
              </div>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Belum ada penjualan pada periode ini.
              </p>
            )}
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-600 dark:text-amber-400">
              <TrendingDown className="w-4 h-4" />
              Penjualan Terendah
            </div>
            {analytics.lowestProduct ? (
              <div className="space-y-1">
                <p className="text-base font-bold text-slate-900 dark:text-white">
                  {analytics.lowestProduct.productName}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  {formatNumber(analytics.lowestProduct.quantity)} terjual · Omzet{' '}
                  {formatRupiah(analytics.lowestProduct.revenue)}
                </p>
              </div>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Minimal 2 produk terjual untuk perbandingan.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Product Breakdown Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
          <Award className="w-4 h-4 text-emerald-600" />
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Rincian Produk Terjual ({analytics.productRows.length})
          </h2>
        </div>

        {analytics.productRows.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
            Belum ada produk terjual pada filter periode ini.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-xs text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-5 font-semibold">Produk</th>
                  <th className="py-3 px-4 font-semibold">Kategori</th>
                  <th className="py-3 px-4 font-semibold text-right">Qty</th>
                  <th className="py-3 px-4 font-semibold text-right">Omzet</th>
                  <th className="py-3 px-5 font-semibold text-right">Laba</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 tabular-nums">
                {analytics.productRows.map((row) => (
                  <tr
                    key={`${row.productName}-${row.categoryName}`}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/30"
                  >
                    <td className="py-3 px-5 font-medium text-slate-900 dark:text-white">
                      {row.productName}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-500 dark:text-slate-400">
                      {row.categoryName}
                    </td>
                    <td className="py-3 px-4 text-right font-semibold text-slate-800 dark:text-slate-200">
                      {formatNumber(row.quantity)}
                    </td>
                    <td className="py-3 px-4 text-right text-slate-900 dark:text-white">
                      {formatRupiah(row.revenue)}
                    </td>
                    <td className="py-3 px-5 text-right font-semibold text-emerald-700 dark:text-emerald-400">
                      {formatRupiah(row.profit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Filtered Receipts List */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Daftar Struk Periode Ini ({analytics.filteredTxs.length})
          </h2>
        </div>
        {analytics.filteredTxs.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
            Tidak ada struk pada periode ini.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {analytics.filteredTxs.map((tx) => (
              <button
                key={tx.id}
                type="button"
                onClick={() => onSelectTransaction(tx)}
                className="w-full flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-left"
              >
                <div>
                  <p className="text-sm font-bold font-mono text-slate-900 dark:text-white">
                    {tx.invoiceNumber}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {formatDateTime(tx.createdAt)} · {tx.paymentMethod} ·{' '}
                    {tx.cashierName}
                  </p>
                </div>
                <div className="text-right tabular-nums">
                  <p className="text-sm font-bold text-slate-900 dark:text-white">
                    {formatRupiah(tx.totalAmount)}
                  </p>
                  <p className="text-xs text-emerald-600 dark:text-emerald-400">
                    Laba {formatRupiah(tx.totalProfit)}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

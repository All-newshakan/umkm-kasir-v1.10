import React, { useMemo, useState } from 'react';
import { Clock, Receipt, Search } from 'lucide-react';
import type { PaymentMethod, PosTransaction } from '../types/models';
import { formatDateTime, formatNumber, formatRupiah } from '../lib/formatters';

interface TransactionsHistoryViewProps {
  transactions: PosTransaction[];
  onSelectTransaction: (tx: PosTransaction) => void;
}

const METHOD_FILTERS: Array<{ key: 'ALL' | PaymentMethod; label: string }> = [
  { key: 'ALL', label: 'Semua' },
  { key: 'TUNAI', label: 'Tunai' },
  { key: 'QRIS', label: 'QRIS' },
  { key: 'VIRTUAL_ACCOUNT', label: 'VA' },
  { key: 'EWALLET', label: 'E-Wallet' },
  { key: 'TRANSFER', label: 'Transfer' },
];

export const TransactionsHistoryView: React.FC<TransactionsHistoryViewProps> = ({
  transactions,
  onSelectTransaction,
}) => {
  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState<'ALL' | PaymentMethod>('ALL');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return transactions.filter((tx) => {
      if (methodFilter !== 'ALL' && tx.paymentMethod !== methodFilter) return false;
      if (!q) return true;
      return (
        tx.invoiceNumber.toLowerCase().includes(q) ||
        tx.cashierName.toLowerCase().includes(q) ||
        (tx.customerName || '').toLowerCase().includes(q) ||
        tx.items.some((i) => i.productName.toLowerCase().includes(q))
      );
    });
  }, [transactions, search, methodFilter]);

  const summary = useMemo(() => {
    return filtered.reduce(
      (acc, tx) => ({
        revenue: acc.revenue + tx.totalAmount,
        profit: acc.profit + tx.totalProfit,
      }),
      { revenue: 0, profit: 0 }
    );
  }, [filtered]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">
            Riwayat Transaksi
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {formatNumber(filtered.length)} nota · Omzet {formatRupiah(summary.revenue)} · Laba{' '}
            {formatRupiah(summary.profit)}
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari no invoice, kasir, pelanggan, atau nama barang..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white"
          />
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {METHOD_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setMethodFilter(f.key)}
              className={`px-3 py-2 rounded-xl border text-xs font-semibold transition-colors whitespace-nowrap ${
                methodFilter === f.key
                  ? 'text-white border-transparent'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
              }`}
              style={
                methodFilter === f.key
                  ? { backgroundColor: 'var(--brand-primary)' }
                  : undefined
              }
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-12 text-center space-y-2">
            <Receipt className="w-9 h-9 text-slate-300 dark:text-slate-600 mx-auto" />
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
              Tidak ada transaksi yang cocok
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.map((tx) => (
              <button
                key={tx.id}
                type="button"
                onClick={() => onSelectTransaction(tx)}
                className="w-full flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-left transition-colors"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold font-mono text-slate-900 dark:text-white">
                      {tx.invoiceNumber}
                    </span>
                    {tx.hasPendingWrites && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                        <Clock className="w-3 h-3" />
                        Menunggu sinkronisasi
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {formatDateTime(tx.createdAt)} · Kasir {tx.cashierName} ·{' '}
                    {tx.paymentMethod} · {tx.items.length} item
                    {tx.customerName ? ` · ${tx.customerName}` : ''}
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

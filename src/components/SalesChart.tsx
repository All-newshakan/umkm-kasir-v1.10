import React, { useMemo, useState } from 'react';
import { formatCompactRupiah, formatRupiah } from '../lib/formatters';

export interface SalesChartPoint {
  label: string;
  revenue: number;
  profit: number;
  transactionsCount?: number;
}

interface SalesChartProps {
  data: SalesChartPoint[];
  height?: number;
  emptyText?: string;
}

export const SalesChart: React.FC<SalesChartProps> = ({
  data,
  height = 220,
  emptyText = 'Belum ada data transaksi pada periode ini.',
}) => {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(
    data.length > 0 ? data.length - 1 : null
  );

  const maxValue = useMemo(() => {
    const peak = data.reduce((acc, d) => Math.max(acc, d.revenue, d.profit), 0);
    return peak > 0 ? peak : 100_000;
  }, [data]);

  const activePoint =
    selectedIndex !== null && data[selectedIndex]
      ? data[selectedIndex]
      : data[data.length - 1] || null;

  if (data.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4 text-xs font-medium text-slate-600 dark:text-slate-300">
          <span className="inline-flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-sm inline-block"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            />
            Omzet Penjualan
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-sm inline-block"
              style={{ backgroundColor: 'var(--brand-secondary)' }}
            />
            Keuntungan Bersih
          </span>
        </div>
        {activePoint && (
          <div className="text-xs text-slate-600 dark:text-slate-300 tabular-nums">
            <span className="font-semibold text-slate-900 dark:text-white">
              {activePoint.label}
            </span>
            {' · '}
            Omzet {formatRupiah(activePoint.revenue)}
            {' · '}
            Laba {formatRupiah(activePoint.profit)}
            {typeof activePoint.transactionsCount === 'number'
              ? ` · ${activePoint.transactionsCount} trx`
              : ''}
          </div>
        )}
      </div>

      <div className="relative flex gap-3">
        <div
          className="hidden sm:flex flex-col justify-between text-[11px] text-slate-400 dark:text-slate-500 tabular-nums text-right pr-1 select-none shrink-0"
          style={{ height }}
        >
          <span>{formatCompactRupiah(maxValue)}</span>
          <span>{formatCompactRupiah(maxValue / 2)}</span>
          <span>Rp 0</span>
        </div>

        <div className="flex-1 overflow-x-auto pb-1">
          <div
            className="grid gap-2 items-end min-w-[340px] border-b border-slate-200 dark:border-slate-800 pb-2"
            style={{
              height,
              gridTemplateColumns: `repeat(${data.length}, minmax(28px, 1fr))`,
            }}
          >
            {data.map((point, idx) => {
              const revPct = Math.max(
                point.revenue > 0 ? 6 : 2,
                Math.round((point.revenue / maxValue) * 100)
              );
              const profPct = Math.max(
                point.profit > 0 ? 5 : 2,
                Math.round((Math.max(0, point.profit) / maxValue) * 100)
              );
              const isSelected = activePoint?.label === point.label;

              return (
                <button
                  key={point.label}
                  type="button"
                  onClick={() => setSelectedIndex(idx)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`group flex flex-col items-center justify-end h-full rounded-lg px-1 pt-2 transition-colors focus:outline-none ${
                    isSelected
                      ? 'bg-slate-100/90 dark:bg-slate-800/70'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}
                  title={`${point.label}: Omzet ${formatRupiah(point.revenue)}, Laba ${formatRupiah(point.profit)}`}
                >
                  <div className="w-full flex-1 flex items-end justify-center gap-1 px-0.5">
                    <div
                      className="w-2.5 sm:w-3 rounded-t-sm transition-all duration-300"
                      style={{
                        height: `${revPct}%`,
                        backgroundColor: 'var(--brand-primary)',
                        opacity: isSelected ? 1 : 0.85,
                      }}
                    />
                    <div
                      className="w-2.5 sm:w-3 rounded-t-sm transition-all duration-300"
                      style={{
                        height: `${profPct}%`,
                        backgroundColor: 'var(--brand-secondary)',
                        opacity: isSelected ? 1 : 0.8,
                      }}
                    />
                  </div>
                </button>
              );
            })}
          </div>

          <div
            className="grid gap-2 min-w-[340px] pt-1.5"
            style={{
              gridTemplateColumns: `repeat(${data.length}, minmax(28px, 1fr))`,
            }}
          >
            {data.map((point, idx) => {
              const isSelected = activePoint?.label === point.label;
              return (
                <button
                  key={`${point.label}-lbl`}
                  type="button"
                  onClick={() => setSelectedIndex(idx)}
                  className={`text-[11px] truncate text-center tabular-nums transition-colors ${
                    isSelected
                      ? 'font-semibold text-slate-900 dark:text-white'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {point.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

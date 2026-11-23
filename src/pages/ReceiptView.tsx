import React, { useState } from 'react';
import {
  Bluetooth,
  CheckCircle2,
  Download,
  Printer,
  Share2,
  X,
} from 'lucide-react';
import type { PosTransaction, StoreProfile } from '../types/models';
import {
  exportReceiptPdf,
  printThermalBluetooth,
  shareReceiptViaWhatsApp,
} from '../lib/exporter';
import { formatDateTime, formatRupiah } from '../lib/formatters';
import { DynamicStoreLogo } from '../components/DynamicStoreLogo';

interface ReceiptViewProps {
  store: StoreProfile;
  transaction: PosTransaction;
  onClose: () => void;
  onNotify: (type: 'success' | 'error' | 'info', message: string) => void;
}

export const ReceiptView: React.FC<ReceiptViewProps> = ({
  store,
  transaction,
  onClose,
  onNotify,
}) => {
  const [printingBt, setPrintingBt] = useState(false);

  const handleBluetoothPrint = async () => {
    setPrintingBt(true);
    try {
      await printThermalBluetooth(store, transaction);
      onNotify('success', 'Struk berhasil dikirim ke printer Bluetooth.');
    } catch (err) {
      onNotify(
        'error',
        err instanceof Error ? err.message : 'Gagal mencetak ke printer Bluetooth.'
      );
    } finally {
      setPrintingBt(false);
    }
  };

  const handleShareWhatsApp = async () => {
    const mode = await shareReceiptViaWhatsApp(store, transaction);
    if (mode === 'shared') {
      onNotify('success', 'Struk dibagikan.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 backdrop-blur-[2px] p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="w-5 h-5" />
            <span className="text-sm font-semibold">Detail Struk Transaksi</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Tutup struk"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 bg-slate-100/70 dark:bg-slate-950/60">
          <div
            id="thermal-receipt-print-area"
            className="mx-auto max-w-[320px] bg-white text-slate-900 rounded-xl border border-slate-200 p-5 shadow-xs font-mono text-xs space-y-3"
          >
            <div className="flex flex-col items-center text-center space-y-1.5">
              <DynamicStoreLogo
                storeName={store.name}
                logoIconKey={store.logoIconKey}
                logoBase64={store.logoBase64}
                themePaletteKey={store.themePaletteKey}
                size="md"
              />
              <p className="text-sm font-bold uppercase tracking-wide pt-1">
                {store.name}
              </p>
              {store.address && (
                <p className="text-[11px] text-slate-600 leading-snug">
                  {store.address}
                </p>
              )}
              {store.whatsapp && (
                <p className="text-[11px] text-slate-600">WA: {store.whatsapp}</p>
              )}
            </div>

            <div className="border-t border-dashed border-slate-300 pt-2.5 space-y-1 text-[11px]">
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">No Struk</span>
                <span className="font-bold">{transaction.invoiceNumber}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">Tanggal</span>
                <span>{formatDateTime(transaction.createdAt)}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">Kasir</span>
                <span>{transaction.cashierName}</span>
              </div>
              {transaction.customerName && (
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Pelanggan</span>
                  <span>{transaction.customerName}</span>
                </div>
              )}
              {transaction.note && (
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Catatan</span>
                  <span>{transaction.note}</span>
                </div>
              )}
            </div>

            <div className="border-t border-dashed border-slate-300 pt-2.5 space-y-2">
              {transaction.items.map((item, idx) => (
                <div key={`${item.productId}-${idx}`} className="space-y-0.5">
                  <p className="font-semibold text-slate-900">{item.productName}</p>
                  <div className="flex justify-between text-[11px] text-slate-600 tabular-nums">
                    <span>
                      {item.quantity} {item.unit} x {formatRupiah(item.sellPrice)}
                    </span>
                    <span className="font-semibold text-slate-900">
                      {formatRupiah(item.lineTotal)}
                    </span>
                  </div>
                  {(item.discountAmount || 0) > 0 && (
                    <p className="text-[10px] text-emerald-700">
                      Diskon item: -{formatRupiah(item.discountAmount || 0)}
                    </p>
                  )}
                </div>
              ))}
            </div>

            <div className="border-t border-dashed border-slate-300 pt-2.5 space-y-1 tabular-nums">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal</span>
                <span>{formatRupiah(transaction.subtotal)}</span>
              </div>
              {transaction.discountAmount > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Diskon</span>
                  <span>-{formatRupiah(transaction.discountAmount)}</span>
                </div>
              )}
              {transaction.taxAmount > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>Pajak</span>
                  <span>{formatRupiah(transaction.taxAmount)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-bold text-slate-900 pt-1 border-t border-slate-200">
                <span>TOTAL</span>
                <span>{formatRupiah(transaction.totalAmount)}</span>
              </div>
              <div className="flex justify-between text-slate-600 pt-1">
                <span>Bayar ({transaction.paymentMethod})</span>
                <span>{formatRupiah(transaction.cashReceived)}</span>
              </div>
              {transaction.paymentMethod === 'TUNAI' && (
                <div className="flex justify-between text-slate-600">
                  <span>Kembali</span>
                  <span>{formatRupiah(transaction.changeAmount)}</span>
                </div>
              )}
              {((transaction.pointsEarned || 0) > 0 ||
                (transaction.pointsRedeemed || 0) > 0) && (
                <div className="flex justify-between text-[11px] text-amber-700 pt-1">
                  <span>Poin Loyalitas</span>
                  <span>
                    +{transaction.pointsEarned || 0} / -
                    {transaction.pointsRedeemed || 0} poin
                  </span>
                </div>
              )}
            </div>

            <div className="border-t border-dashed border-slate-300 pt-3 text-center text-[11px] text-slate-600">
              {store.receiptFooter || 'Terima kasih telah berbelanja!'}
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 grid grid-cols-2 gap-2.5 bg-white dark:bg-slate-900">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            <Printer className="w-4 h-4" />
            Cetak Struk
          </button>

          <button
            type="button"
            disabled={printingBt}
            onClick={() => void handleBluetoothPrint()}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap disabled:opacity-50"
          >
            <Bluetooth className="w-4 h-4 text-sky-600" />
            {printingBt ? 'Mencetak...' : 'Thermal BT'}
          </button>

          <button
            type="button"
            onClick={() => {
              exportReceiptPdf(store, transaction);
              onNotify('success', 'Struk PDF berhasil diunduh.');
            }}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            <Download className="w-4 h-4 text-red-600" />
            Unduh PDF
          </button>

          <button
            type="button"
            onClick={() => void handleShareWhatsApp()}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-white text-xs font-semibold transition-colors whitespace-nowrap"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            <Share2 className="w-4 h-4" />
            Kirim WhatsApp
          </button>
        </div>
      </div>
    </div>
  );
};

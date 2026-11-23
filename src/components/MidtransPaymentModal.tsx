import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';
import type {
  CartLine,
  MidtransChargeResult,
  MidtransConfigStatus,
  PaymentMethod,
} from '../types/models';
import { formatRupiah } from '../lib/formatters';
import {
  cancelMidtransOrder,
  checkMidtransStatus,
  createMidtransCharge,
  fetchMidtransConfigStatus,
} from '../lib/midtransClient';

interface MidtransPaymentModalProps {
  open: boolean;
  paymentMethod: PaymentMethod;
  grossAmount: number;
  customerName: string;
  bankTransferInfo: string;
  cartLines: CartLine[];
  onPaid: (details: {
    gatewayProvider: string;
    gatewayOrderId: string;
    subChannel: string;
  }) => Promise<void> | void;
  onCancel: () => void;
}

const VA_BANKS = [
  { key: 'bca', label: 'BCA Virtual Account' },
  { key: 'bni', label: 'BNI Virtual Account' },
  { key: 'bri', label: 'BRI Virtual Account' },
  { key: 'permata', label: 'Permata Virtual Account' },
  { key: 'cimb', label: 'CIMB Niaga VA' },
];

const EWALLET_CHANNELS = [
  { key: 'gopay', label: 'GoPay' },
  { key: 'shopeepay', label: 'ShopeePay' },
];

const SETTLED_STATUSES = new Set(['settlement', 'capture']);
const FAILED_STATUSES = new Set(['deny', 'cancel', 'expire', 'failure']);

export const MidtransPaymentModal: React.FC<MidtransPaymentModalProps> = ({
  open,
  paymentMethod,
  grossAmount,
  customerName,
  bankTransferInfo,
  cartLines,
  onPaid,
  onCancel,
}) => {
  const [configStatus, setConfigStatus] = useState<MidtransConfigStatus | null>(null);
  const [subChannel, setSubChannel] = useState<string>(
    paymentMethod === 'VIRTUAL_ACCOUNT'
      ? 'bca'
      : paymentMethod === 'EWALLET'
        ? 'gopay'
        : ''
  );
  const [charge, setCharge] = useState<MidtransChargeResult | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [copied, setCopied] = useState(false);
  const [statusText, setStatusText] = useState('Menunggu pembayaran...');

  useEffect(() => {
    if (!open) return;
    setCharge(null);
    setQrDataUrl('');
    setErrorMsg('');
    setCopied(false);
    setStatusText('Menunggu pembayaran...');
    setSubChannel(
      paymentMethod === 'VIRTUAL_ACCOUNT'
        ? 'bca'
        : paymentMethod === 'EWALLET'
          ? 'gopay'
          : ''
    );
    fetchMidtransConfigStatus()
      .then(setConfigStatus)
      .catch(() => setConfigStatus({ configured: false, isProduction: false }));
  }, [open, paymentMethod]);

  useEffect(() => {
    if (!open || !configStatus?.configured) return;
    if (paymentMethod === 'TRANSFER') return;
    if (charge) return;

    let cancelled = false;
    const initCharge = async () => {
      setLoading(true);
      setErrorMsg('');
      try {
        const orderId = `POS-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
        const result = await createMidtransCharge({
          orderId,
          grossAmount,
          method: paymentMethod,
          subChannel,
          customerName,
          cartLines,
        });
        if (cancelled) return;
        setCharge(result);
        setStatusText(`Status Midtrans: ${result.transactionStatus || 'pending'}`);

        if (result.qrString) {
          const url = await QRCode.toDataURL(result.qrString, {
            width: 260,
            margin: 1,
          });
          if (!cancelled) setQrDataUrl(url);
        } else if (result.qrImageUrl) {
          setQrDataUrl(result.qrImageUrl);
        }
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(err instanceof Error ? err.message : 'Gagal membuat tagihan Midtrans.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void initCharge();
    return () => {
      cancelled = true;
    };
  }, [open, configStatus, paymentMethod, subChannel, charge, grossAmount, customerName, cartLines]);

  useEffect(() => {
    if (!open || !charge?.orderId) return;
    let active = true;

    const poll = async () => {
      try {
        const st = await checkMidtransStatus(charge.orderId);
        if (!active) return;
        const normalized = st.transactionStatus.toLowerCase();
        setStatusText(`Status Midtrans: ${st.transactionStatus || 'pending'}`);
        if (SETTLED_STATUSES.has(normalized)) {
          await onPaid({
            gatewayProvider: 'MIDTRANS',
            gatewayOrderId: charge.orderId,
            subChannel,
          });
        } else if (FAILED_STATUSES.has(normalized)) {
          setErrorMsg(`Transaksi Midtrans berstatus ${st.transactionStatus}. Silakan buat ulang.`);
        }
      } catch {
        // Keep polling quietly
      }
    };

    const interval = setInterval(() => {
      void poll();
    }, 3500);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [open, charge, subChannel, onPaid]);

  if (!open) return null;

  const handleManualStatusCheck = async () => {
    if (!charge?.orderId) return;
    setChecking(true);
    setErrorMsg('');
    try {
      const st = await checkMidtransStatus(charge.orderId);
      const normalized = st.transactionStatus.toLowerCase();
      setStatusText(`Status Midtrans: ${st.transactionStatus}`);
      if (SETTLED_STATUSES.has(normalized)) {
        await onPaid({
          gatewayProvider: 'MIDTRANS',
          gatewayOrderId: charge.orderId,
          subChannel,
        });
      } else if (FAILED_STATUSES.has(normalized)) {
        setErrorMsg(`Pembayaran ${st.transactionStatus}. Silakan ulangi transaksi.`);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal cek status.');
    } finally {
      setChecking(false);
    }
  };

  const handleChannelChange = async (nextChannel: string) => {
    if (charge?.orderId) {
      await cancelMidtransOrder(charge.orderId);
    }
    setCharge(null);
    setQrDataUrl('');
    setSubChannel(nextChannel);
  };

  const handleClose = async () => {
    if (charge?.orderId) {
      await cancelMidtransOrder(charge.orderId);
    }
    onCancel();
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard failures
    }
  };

  const methodTitle =
    paymentMethod === 'QRIS'
      ? 'Pembayaran QRIS'
      : paymentMethod === 'VIRTUAL_ACCOUNT'
        ? 'Virtual Account'
        : paymentMethod === 'EWALLET'
          ? 'E-Wallet'
          : 'Transfer Bank';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 backdrop-blur-[2px] p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              {methodTitle}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              Total Tagihan: <span className="font-semibold text-slate-900 dark:text-white">{formatRupiah(grossAmount)}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleClose()}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Tutup modal pembayaran"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {paymentMethod === 'VIRTUAL_ACCOUNT' && configStatus?.configured && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                Pilih Bank Virtual Account
              </label>
              <div className="grid grid-cols-2 gap-2">
                {VA_BANKS.map((bank) => (
                  <button
                    key={bank.key}
                    type="button"
                    onClick={() => void handleChannelChange(bank.key)}
                    className={`px-3 py-2 rounded-xl border text-xs font-medium text-left transition-colors ${
                      subChannel === bank.key
                        ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300'
                        : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    {bank.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {paymentMethod === 'EWALLET' && configStatus?.configured && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                Pilih E-Wallet
              </label>
              <div className="grid grid-cols-2 gap-2">
                {EWALLET_CHANNELS.map((ch) => (
                  <button
                    key={ch.key}
                    type="button"
                    onClick={() => void handleChannelChange(ch.key)}
                    className={`px-3 py-2 rounded-xl border text-xs font-medium text-left transition-colors ${
                      subChannel === ch.key
                        ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300'
                        : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    {ch.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {paymentMethod === 'TRANSFER' ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-2">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Rekening Transfer Toko
                </p>
                <p className="text-sm font-semibold text-slate-900 dark:text-white whitespace-pre-line">
                  {bankTransferInfo.trim() ||
                    'Belum ada nomor rekening tersimpan di Pengaturan Toko. Verifikasi transfer secara manual sebelum menyelesaikan pesanan.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  void onPaid({
                    gatewayProvider: 'MANUAL_TRANSFER',
                    gatewayOrderId: `TRF-${Date.now()}`,
                    subChannel: 'bank_transfer',
                  })
                }
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold text-white transition-colors whitespace-nowrap"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                <CheckCircle2 className="w-4 h-4" />
                Konfirmasi Transfer Diterima
              </button>
            </div>
          ) : configStatus && !configStatus.configured ? (
            <div className="space-y-3">
              <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1 text-xs text-amber-900 dark:text-amber-200">
                  <p className="font-semibold">
                    Midtrans Server Key Belum Dikonfigurasi
                  </p>
                  <p className="leading-relaxed">
                    Tambahkan <code className="font-mono">MIDTRANS_SERVER_KEY</code> pada environment server untuk QRIS/VA/E-Wallet otomatis. Anda tetap dapat mengonfirmasi pembayaran jika pelanggan sudah membayar lewat QRIS statis toko.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  void onPaid({
                    gatewayProvider: 'STATIC_QRIS',
                    gatewayOrderId: `QR-${Date.now()}`,
                    subChannel: subChannel || 'static',
                  })
                }
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors whitespace-nowrap"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                <CheckCircle2 className="w-4 h-4" />
                Konfirmasi Pembayaran Lunas Manual
              </button>
            </div>
          ) : loading ? (
            <div className="py-10 flex flex-col items-center justify-center gap-3 text-slate-500 dark:text-slate-400">
              <Loader2 className="w-7 h-7 animate-spin text-emerald-600" />
              <p className="text-sm">Membuat tagihan Midtrans...</p>
            </div>
          ) : errorMsg ? (
            <div className="space-y-3">
              <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300">
                {errorMsg}
              </div>
              <button
                type="button"
                onClick={() => setCharge(null)}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
              >
                <RefreshCw className="w-4 h-4" />
                Coba Buat Ulang Tagihan
              </button>
            </div>
          ) : charge ? (
            <div className="space-y-4">
              {qrDataUrl && (
                <div className="flex flex-col items-center p-4 rounded-xl bg-white border border-slate-200">
                  <img
                    src={qrDataUrl}
                    alt="QRIS Pembayaran"
                    className="w-52 h-52 object-contain"
                  />
                  <p className="mt-2 text-xs text-slate-600 font-medium">
                    Pindai dengan aplikasi pembayaran QRIS
                  </p>
                </div>
              )}

              {charge.vaNumber && (
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span>Bank {charge.bankName.toUpperCase()}</span>
                    {charge.expiryTime && <span>Batas: {charge.expiryTime}</span>}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-lg font-bold tracking-wide text-slate-900 dark:text-white tabular-nums">
                      {charge.vaNumber}
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleCopy(charge.vaNumber)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      {copied ? 'Tersalin' : 'Salin'}
                    </button>
                  </div>
                </div>
              )}

              {charge.deeplinkUrl && (
                <a
                  href={charge.deeplinkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-emerald-600 text-emerald-700 dark:text-emerald-300 text-sm font-medium hover:bg-emerald-50 dark:hover:bg-emerald-950/30 whitespace-nowrap"
                >
                  <ExternalLink className="w-4 h-4" />
                  Buka Aplikasi {subChannel.toUpperCase()}
                </a>
              )}

              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 px-1">
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  {statusText}
                </span>
                <span className="font-mono">{charge.orderId.slice(-10)}</span>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => void handleClose()}
                  className="px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
                >
                  Batalkan
                </button>
                <button
                  type="button"
                  onClick={() => void handleManualStatusCheck()}
                  disabled={checking}
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl text-sm font-semibold text-white whitespace-nowrap disabled:opacity-60"
                  style={{ backgroundColor: 'var(--brand-primary)' }}
                >
                  <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
                  Cek Status
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

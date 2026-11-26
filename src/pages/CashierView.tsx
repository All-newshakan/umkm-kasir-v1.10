import React, { useMemo, useRef, useState } from 'react';
import {
  Award,
  Banknote,
  Building2,
  CheckCircle2,
  Minus,
  Package,
  Plus,
  QrCode,
  ScanLine,
  Search,
  ShoppingCart,
  Smartphone,
  Trash2,
  UserPlus,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import type {
  CartLine,
  Category,
  Customer,
  DiscountType,
  PaymentMethod,
  PosTransaction,
  Product,
  StoreProfile,
} from '../types/models';
import { getCartLineTotals } from '../types/models';
import { formatFriendlyDatabaseError } from '../lib/supabase';
import { formatNumber, formatRupiah } from '../lib/formatters';
import {
  completeTransactionAndDecrementStock,
  saveCustomer,
} from '../lib/storeRepository';
import { BarcodeScannerModal } from '../components/BarcodeScannerModal';
import { MidtransPaymentModal } from '../components/MidtransPaymentModal';

interface CashierViewProps {
  store: StoreProfile;
  currentUid: string;
  cashierName: string;
  products: Product[];
  categories: Category[];
  customers: Customer[];
  onTransactionCompleted: (tx: PosTransaction) => void;
  onNotify: (type: 'success' | 'error' | 'info', message: string) => void;
}

const PAYMENT_METHODS: Array<{
  key: PaymentMethod;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { key: 'TUNAI', label: 'Tunai', icon: Banknote },
  { key: 'QRIS', label: 'QRIS', icon: QrCode },
  { key: 'VIRTUAL_ACCOUNT', label: 'Virtual Account', icon: Building2 },
  { key: 'EWALLET', label: 'E-Wallet', icon: Smartphone },
  { key: 'TRANSFER', label: 'Transfer', icon: Wallet },
];

export const CashierView: React.FC<CashierViewProps> = ({
  store,
  currentUid,
  cashierName,
  products,
  categories,
  customers,
  onTransactionCompleted,
  onNotify,
}) => {
  const transactionInProgressRef = useRef(false);\n  const [search, setSearch] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('ALL');
  const [cartLines, setCartLines] = useState<CartLine[]>([]);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);

  // Item edit modal
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [editQty, setEditQty] = useState('1');
  const [editDiscType, setEditDiscType] = useState<DiscountType>('NOMINAL');
  const [editDiscVal, setEditDiscVal] = useState('0');

  // Cart-wide checkout controls
  const [cartDiscountType, setCartDiscountType] = useState<DiscountType>('PERCENT');
  const [cartDiscountValue, setCartDiscountValue] = useState<string>(
    store.defaultDiscountPercent > 0 ? String(store.defaultDiscountPercent) : '0'
  );
  const [note, setNote] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('TUNAI');
  const [cashReceivedStr, setCashReceivedStr] = useState('');

  // Customer & Loyalty
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [quickCustName, setQuickCustName] = useState('');
  const [quickCustPhone, setQuickCustPhone] = useState('');
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [redeemPointsStr, setRedeemPointsStr] = useState('0');

  // Payment execution
  const [processingTx, setProcessingTx] = useState(false);
  const [midtransOpen, setMidtransOpen] = useState(false);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      const catMatch =
        selectedCategoryId === 'ALL' || p.categoryId === selectedCategoryId;
      if (!catMatch) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.barcode.toLowerCase().includes(q) ||
        p.categoryName.toLowerCase().includes(q)
      );
    });
  }, [products, search, selectedCategoryId]);

  const addProductToCart = (product: Product) => {
    if (product.stock <= 0) {
      onNotify('error', `Stok "${product.name}" sedang habis.`);
      return;
    }
    setCartLines((prev) => {
      const idx = prev.findIndex((l) => l.product.id === product.id);
      if (idx >= 0) {
        const nextQty = prev[idx].quantity + 1;
        if (nextQty > product.stock) {
          onNotify(
            'info',
            `Jumlah "${product.name}" mencapai batas stok tersedia (${product.stock}).`
          );
          return prev;
        }
        const clone = [...prev];
        clone[idx] = { ...clone[idx], quantity: nextQty };
        return clone;
      }
      return [
        ...prev,
        { product, quantity: 1, discountType: 'NOMINAL', discountValue: 0 },
      ];
    });
  };

  const handleBarcodeDetected = (code: string) => {
    const found = products.find(
      (p) => p.barcode.trim().toLowerCase() === code.trim().toLowerCase()
    );
    if (found) {
      addProductToCart(found);
      onNotify('success', `Ditambahkan: ${found.name}`);
    } else {
      setSearch(code);
      onNotify('info', `Barcode "${code}" belum cocok di katalog. Menampilkan pencarian.`);
    }
  };

  const updateLineQuantity = (productId: string, delta: number) => {
    setCartLines((prev) =>
      prev
        .map((line) => {
          if (line.product.id !== productId) return line;
          const next = line.quantity + delta;
          if (next <= 0) return null;
          if (next > line.product.stock) {
            onNotify('info', `Stok maksimal ${line.product.stock} ${line.product.unit}.`);
            return line;
          }
          return { ...line, quantity: next };
        })
        .filter(Boolean) as CartLine[]
    );
  };

  const openLineEditor = (line: CartLine) => {
    setEditingProductId(line.product.id);
    setEditQty(String(line.quantity));
    setEditDiscType(line.discountType);
    setEditDiscVal(String(line.discountValue));
  };

  const saveLineEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProductId) return;
    const qty = Math.max(1, Math.round(Number(editQty) || 1));
    const discVal = Math.max(0, Number(editDiscVal) || 0);
    setCartLines((prev) =>
      prev.map((line) => {
        if (line.product.id !== editingProductId) return line;
        const clampedQty = Math.min(qty, Math.max(1, line.product.stock));
        return {
          ...line,
          quantity: clampedQty,
          discountType: editDiscType,
          discountValue: discVal,
        };
      })
    );
    setEditingProductId(null);
  };

  const calculations = useMemo(() => {
    const subtotal = cartLines.reduce(
      (acc, line) => acc + getCartLineTotals(line).netTotal,
      0
    );
    const totalItems = cartLines.reduce((acc, l) => acc + l.quantity, 0);

    const parsedDisc = Math.max(0, Number(cartDiscountValue) || 0);
    const cartDiscount =
      cartDiscountType === 'PERCENT'
        ? Math.round((subtotal * Math.min(100, parsedDisc)) / 100)
        : Math.min(subtotal, Math.round(parsedDisc));

    const afterCartDiscount = Math.max(0, subtotal - cartDiscount);

    // Loyalty: 1 point = Rp 100
    const maxRedeemByPoints = selectedCustomer ? selectedCustomer.loyaltyPoints : 0;
    const maxRedeemByAmount = Math.floor(afterCartDiscount / 100);
    const maxRedeemablePoints = Math.min(maxRedeemByPoints, maxRedeemByAmount);
    const requestedPoints = Math.max(0, Math.round(Number(redeemPointsStr) || 0));
    const pointsRedeemed = selectedCustomer
      ? Math.min(requestedPoints, maxRedeemablePoints)
      : 0;
    const loyaltyDiscount = pointsRedeemed * 100;

    const totalDiscount = cartDiscount + loyaltyDiscount;
    const taxableBase = Math.max(0, subtotal - totalDiscount);
    const taxAmount = Math.round((taxableBase * Math.max(0, store.taxPercent)) / 100);
    const totalAmount = taxableBase + taxAmount;
    const cashReceived = Math.max(0, Math.round(Number(cashReceivedStr) || 0));
    const changeAmount = Math.max(0, cashReceived - totalAmount);
    const pointsEarned = selectedCustomer ? Math.floor(totalAmount / 10000) : 0;

    return {
      subtotal,
      totalItems,
      cartDiscount,
      loyaltyDiscount,
      totalDiscount,
      taxAmount,
      totalAmount,
      cashReceived,
      changeAmount,
      maxRedeemablePoints,
      pointsRedeemed,
      pointsEarned,
    };
  }, [
    cartLines,
    cartDiscountType,
    cartDiscountValue,
    selectedCustomer,
    redeemPointsStr,
    store.taxPercent,
    cashReceivedStr,
  ]);

  const executeFinalizeTransaction = async (paymentMeta: {
    gatewayProvider: string;
    gatewayOrderId: string;
  }) => {
    if (cartLines.length === 0 || transactionInProgressRef.current) return;
    transactionInProgressRef.current = true;
    setProcessingTx(true);
    try {
      const tx = await completeTransactionAndDecrementStock({
        store,
        cashierUid: currentUid,
        cashierName,
        cartLines,
        note,
        discountType: cartDiscountType,
        discountAmount: calculations.totalDiscount,
        taxAmount: calculations.taxAmount,
        paymentMethod,
        gatewayProvider: paymentMeta.gatewayProvider,
        gatewayOrderId: paymentMeta.gatewayOrderId,
        cashReceived:
          paymentMethod === 'TUNAI'
            ? calculations.cashReceived
            : calculations.totalAmount,
        customer: selectedCustomer,
        pointsRedeemed: calculations.pointsRedeemed,
      });

      setCartLines([]);
      setNote('');
      setCashReceivedStr('');
      setRedeemPointsStr('0');
      setSelectedCustomer(null);
      setMidtransOpen(false);
      setMobileCartOpen(false);
      onNotify('success', `Transaksi ${tx.invoiceNumber} berhasil disimpan.`);
      onTransactionCompleted(tx);
    } catch (err) {
      onNotify('error', formatFriendlyDatabaseError(err));
    } finally {
      transactionInProgressRef.current = false;
      setProcessingTx(false);
    }
  };

  const handleCheckout = () => {
    if (cartLines.length === 0) {
      onNotify('error', 'Keranjang belanja masih kosong.');
      return;
    }
    if (paymentMethod === 'TUNAI') {
      if (calculations.cashReceived < calculations.totalAmount) {
        onNotify('error', 'Uang tunai diterima masih kurang dari total tagihan.');
        return;
      }
      void executeFinalizeTransaction({
        gatewayProvider: '',
        gatewayOrderId: '',
      });
      return;
    }
    setMidtransOpen(true);
  };

  const handleQuickAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickCustName.trim()) return;
    setSavingCustomer(true);
    try {
      const id = await saveCustomer(store, {
        name: quickCustName.trim(),
        phone: quickCustPhone.trim(),
        loyaltyPoints: 0,
      });
      const created: Customer = {
        id,
        storeId: store.id,
        ownerUid: store.ownerUid,
        memberUids: store.memberUids,
        memberEmails: store.memberEmails,
        name: quickCustName.trim(),
        phone: quickCustPhone.trim(),
        email: '',
        address: '',
        notes: '',
        loyaltyPoints: 0,
        totalSpent: 0,
        visitCount: 0,
      };
      setSelectedCustomer(created);
      setQuickCustName('');
      setQuickCustPhone('');
      setCustomerPickerOpen(false);
      onNotify('success', `Pelanggan "${created.name}" dipilih.`);
    } catch (err) {
      onNotify('error', formatFriendlyDatabaseError(err));
    } finally {
      setSavingCustomer(false);
    }
  };

  const quickCashOptions = useMemo(() => {
    const total = calculations.totalAmount;
    if (total <= 0) return [];
    const candidates = [
      total,
      Math.ceil(total / 5000) * 5000,
      Math.ceil(total / 10000) * 10000,
      Math.ceil(total / 50000) * 50000,
      100000,
    ];
    return Array.from(new Set(candidates)).filter((v) => v >= total).slice(0, 4);
  }, [calculations.totalAmount]);

  const cartPanelContent = (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900">
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <ShoppingCart className="w-4 h-4 text-emerald-600" />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            Keranjang Belanja
          </h2>
          <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            · {calculations.totalItems} item
          </span>
        </div>
        {cartLines.length > 0 && (
          <button
            type="button"
            onClick={() => setCartLines([])}
            className="text-xs font-medium text-red-600 hover:underline whitespace-nowrap"
          >
            Kosongkan
          </button>
        )}
      </div>

      {/* Customer selection bar */}
      <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">
        {selectedCustomer ? (
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                {selectedCustomer.name}
              </p>
              <p className="text-[11px] text-emerald-700 dark:text-emerald-400 tabular-nums">
                {formatNumber(selectedCustomer.loyaltyPoints)} poin tersedia
                {calculations.pointsEarned > 0
                  ? ` · +${calculations.pointsEarned} poin baru`
                  : ''}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setCustomerPickerOpen(true)}
                className="text-xs font-medium text-slate-600 dark:text-slate-300 hover:underline"
              >
                Ganti
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedCustomer(null);
                  setRedeemPointsStr('0');
                }}
                className="p-1 text-slate-400 hover:text-red-500"
                aria-label="Hapus pelanggan"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setCustomerPickerOpen(true)}
            className="w-full flex items-center justify-between text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white py-0.5"
          >
            <span className="inline-flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" />
              Pilih Pelanggan / Member Poin
            </span>
            <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
              + Pilih
            </span>
          </button>
        )}
      </div>

      {/* Cart items */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5 min-h-[160px]">
        {cartLines.length === 0 ? (
          <div className="py-10 text-center space-y-1.5">
            <ShoppingCart className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
              Belum ada produk dipilih
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Ketuk produk di sebelah kiri atau pindai barcode
            </p>
          </div>
        ) : (
          cartLines.map((line) => {
            const totals = getCartLineTotals(line);
            return (
              <div
                key={line.product.id}
                className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/40 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => openLineEditor(line)}
                    className="text-left min-w-0 flex-1 group"
                  >
                    <p className="text-sm font-semibold text-slate-900 dark:text-white truncate group-hover:underline">
                      {line.product.name}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                      {formatRupiah(line.product.sellPrice)} / {line.product.unit}
                      {totals.discount > 0
                        ? ` · Diskon -${formatRupiah(totals.discount)}`
                        : ''}
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setCartLines((prev) =>
                        prev.filter((l) => l.product.id !== line.product.id)
                      )
                    }
                    className="p-1 text-slate-400 hover:text-red-600"
                    aria-label="Hapus item"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <div className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                    <button
                      type="button"
                      onClick={() => updateLineQuantity(line.product.id, -1)}
                      className="p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-l-lg"
                      aria-label="Kurangi jumlah"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => openLineEditor(line)}
                      className="px-3 text-xs font-bold text-slate-900 dark:text-white tabular-nums"
                    >
                      {line.quantity}
                    </button>
                    <button
                      type="button"
                      onClick={() => updateLineQuantity(line.product.id, 1)}
                      className="p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-r-lg"
                      aria-label="Tambah jumlah"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <p className="text-sm font-bold text-slate-900 dark:text-white tabular-nums">
                    {formatRupiah(totals.netTotal)}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Checkout footer */}
      <div className="border-t border-slate-200 dark:border-slate-800 p-4 space-y-3 bg-slate-50/70 dark:bg-slate-900/90">
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Diskon Nota
            </label>
            <div className="flex">
              <select
                value={cartDiscountType}
                onChange={(e) => setCartDiscountType(e.target.value as DiscountType)}
                className="px-2 py-1.5 rounded-l-lg border border-r-0 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-700 dark:text-slate-200"
              >
                <option value="PERCENT">%</option>
                <option value="NOMINAL">Rp</option>
              </select>
              <input
                type="number"
                min={0}
                value={cartDiscountValue}
                onChange={(e) => setCartDiscountValue(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-r-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-mono text-slate-900 dark:text-white tabular-nums"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Catatan Struk
            </label>
            <input
              type="text"
              maxLength={120}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Meja / catatan..."
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white"
            />
          </div>
        </div>

        {selectedCustomer && calculations.maxRedeemablePoints > 0 && (
          <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/35 border border-amber-200 dark:border-amber-900/50">
            <div className="flex items-center gap-1.5 text-xs text-amber-900 dark:text-amber-200">
              <Award className="w-3.5 h-3.5 shrink-0" />
              <span>Tukar Poin (maks {calculations.maxRedeemablePoints})</span>
            </div>
            <input
              type="number"
              min={0}
              max={calculations.maxRedeemablePoints}
              value={redeemPointsStr}
              onChange={(e) => setRedeemPointsStr(e.target.value)}
              className="w-20 px-2 py-1 rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-950 text-xs font-mono text-right tabular-nums"
            />
          </div>
        )}

        <div className="space-y-1 text-xs tabular-nums">
          <div className="flex justify-between text-slate-600 dark:text-slate-400">
            <span>Subtotal</span>
            <span>{formatRupiah(calculations.subtotal)}</span>
          </div>
          {calculations.totalDiscount > 0 && (
            <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
              <span>Diskon &amp; Poin</span>
              <span>-{formatRupiah(calculations.totalDiscount)}</span>
            </div>
          )}
          {calculations.taxAmount > 0 && (
            <div className="flex justify-between text-slate-600 dark:text-slate-400">
              <span>Pajak ({store.taxPercent}%)</span>
              <span>{formatRupiah(calculations.taxAmount)}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-bold text-slate-900 dark:text-white pt-1 border-t border-slate-200 dark:border-slate-800">
            <span>Total</span>
            <span>{formatRupiah(calculations.totalAmount)}</span>
          </div>
        </div>

        {/* Payment method buttons */}
        <div className="space-y-2">
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Metode Pembayaran
          </p>
          <div className="grid grid-cols-3 gap-1.5">
            {PAYMENT_METHODS.map((pm) => {
              const Icon = pm.icon;
              const active = paymentMethod === pm.key;
              return (
                <button
                  key={pm.key}
                  type="button"
                  onClick={() => setPaymentMethod(pm.key)}
                  className={`flex items-center justify-center gap-1.5 px-2 py-2 rounded-xl border text-[11px] font-semibold transition-colors whitespace-nowrap ${
                    active
                      ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{pm.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {paymentMethod === 'TUNAI' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                Uang Diterima
              </label>
              <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
                Kembali: {formatRupiah(calculations.changeAmount)}
              </span>
            </div>
            <input
              type="number"
              min={0}
              value={cashReceivedStr}
              onChange={(e) => setCashReceivedStr(e.target.value)}
              placeholder={`Minimal ${calculations.totalAmount}`}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono font-semibold text-slate-900 dark:text-white tabular-nums"
            />
            {quickCashOptions.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {quickCashOptions.map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setCashReceivedStr(String(amt))}
                    className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-[11px] font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 tabular-nums"
                  >
                    {amt === calculations.totalAmount ? 'Uang Pas' : formatRupiah(amt)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          disabled={cartLines.length === 0 || processingTx}
          onClick={handleCheckout}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-50 whitespace-nowrap"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          <CheckCircle2 className="w-4 h-4" />
          {processingTx
            ? 'Menyimpan Transaksi...'
            : paymentMethod === 'TUNAI'
              ? `Bayar Tunai · ${formatRupiah(calculations.totalAmount)}`
              : `Proses ${paymentMethod} · ${formatRupiah(calculations.totalAmount)}`}
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col lg:flex-row gap-5 lg:h-[calc(100vh-7rem)]">
      {/* Left: Catalog */}
      <div className="flex-1 flex flex-col min-w-0 space-y-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && search.trim()) {
                  const exact = products.find(
                    (p) =>
                      p.barcode.trim().toLowerCase() === search.trim().toLowerCase()
                  );
                  if (exact) {
                    addProductToCart(exact);
                    setSearch('');
                  }
                }
              }}
              placeholder="Cari nama produk atau tembak barcode (Enter)..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
            />
          </div>
          <button
            type="button"
            onClick={() => setScannerOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            <ScanLine className="w-4 h-4 text-emerald-600" />
            Scan Barcode
          </button>
        </div>

        {/* Category Filter Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setSelectedCategoryId('ALL')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition-colors whitespace-nowrap ${
              selectedCategoryId === 'ALL'
                ? 'text-white border-transparent'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
            }`}
            style={
              selectedCategoryId === 'ALL'
                ? { backgroundColor: 'var(--brand-primary)' }
                : undefined
            }
          >
            Semua ({products.length})
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategoryId(cat.id)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition-colors whitespace-nowrap ${
                selectedCategoryId === cat.id
                  ? 'text-white border-transparent'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
              }`}
              style={
                selectedCategoryId === cat.id
                  ? { backgroundColor: 'var(--brand-primary)' }
                  : undefined
              }
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: cat.colorHex }}
              />
              {cat.name}
            </button>
          ))}
        </div>

        {/* Product Grid */}
        <div className="flex-1 overflow-y-auto pr-0.5 pb-20 lg:pb-2">
          {filteredProducts.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-10 text-center space-y-2">
              <Package className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                Produk tidak ditemukan
              </p>
              <p className="text-xs text-slate-400">
                Ubah kata kunci pencarian atau tambahkan produk di menu Produk &amp; Kategori.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
              {filteredProducts.map((product) => {
                const inCart = cartLines.find((l) => l.product.id === product.id);
                const outOfStock = product.stock <= 0;
                return (
                  <button
                    key={product.id}
                    type="button"
                    disabled={outOfStock}
                    onClick={() => addProductToCart(product)}
                    className={`group relative flex flex-col text-left rounded-2xl border overflow-hidden transition-all ${
                      outOfStock
                        ? 'opacity-55 border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 cursor-not-allowed'
                        : inCart
                          ? 'border-emerald-600 bg-white dark:bg-slate-900 shadow-xs'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-emerald-500/60'
                    }`}
                  >
                    <div className="aspect-[4/3] w-full bg-slate-100 dark:bg-slate-800 overflow-hidden relative flex items-center justify-center">
                      {product.imageBase64 ? (
                        <img
                          src={`data:image/jpeg;base64,${product.imageBase64}`}
                          alt={product.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Package className="w-8 h-8 text-slate-300 dark:text-slate-600" />
                      )}
                      {inCart && (
                        <span
                          className="absolute top-2 right-2 px-2 py-0.5 rounded-lg text-[11px] font-bold text-white tabular-nums shadow-xs"
                          style={{ backgroundColor: 'var(--brand-primary)' }}
                        >
                          {inCart.quantity}x
                        </span>
                      )}
                    </div>
                    <div className="p-3 space-y-1 flex-1 flex flex-col justify-between">
                      <div>
                        <p className="text-xs font-semibold text-slate-900 dark:text-white line-clamp-2 leading-snug">
                          {product.name}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                          {product.categoryName || 'Umum'}
                        </p>
                      </div>
                      <div className="pt-1 flex items-end justify-between gap-1">
                        <p className="text-sm font-bold text-slate-900 dark:text-white tabular-nums">
                          {formatRupiah(product.sellPrice)}
                        </p>
                        <span
                          className={`text-[11px] font-medium tabular-nums ${
                            outOfStock
                              ? 'text-red-600'
                              : product.stock <= product.minStockAlert
                                ? 'text-amber-600'
                                : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {outOfStock ? 'Habis' : `${product.stock} ${product.unit}`}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right: Desktop Cart */}
      <div className="hidden lg:flex w-[380px] xl:w-[400px] shrink-0 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
        {cartPanelContent}
      </div>

      {/* Mobile Sticky Cart Summary Bar */}
      {cartLines.length > 0 && (
        <div className="lg:hidden fixed bottom-16 left-3 right-3 z-30">
          <button
            type="button"
            onClick={() => setMobileCartOpen(true)}
            className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-2xl text-white shadow-lg"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            <div className="flex items-center gap-2.5">
              <ShoppingCart className="w-4 h-4" />
              <span className="text-sm font-semibold tabular-nums">
                {calculations.totalItems} Item
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold tabular-nums">
                {formatRupiah(calculations.totalAmount)}
              </span>
              <span className="text-xs underline">Checkout</span>
            </div>
          </button>
        </div>
      )}

      {/* Mobile Cart Drawer */}
      {mobileCartOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-slate-950/60 flex flex-col justify-end">
          <div className="h-[88vh] bg-white dark:bg-slate-900 rounded-t-2xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800">
              <span className="text-sm font-semibold text-slate-900 dark:text-white">
                Detail Pembayaran
              </span>
              <button
                type="button"
                onClick={() => setMobileCartOpen(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">{cartPanelContent}</div>
          </div>
        </div>
      )}

      {/* Item Qty & Discount Modal */}
      {editingProductId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <form
            onSubmit={saveLineEdit}
            className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                Ubah Jumlah &amp; Diskon Item
              </h3>
              <button
                type="button"
                onClick={() => setEditingProductId(null)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  Jumlah
                </label>
                <input
                  type="number"
                  min={1}
                  value={editQty}
                  onChange={(e) => setEditQty(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono tabular-nums"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  Diskon Item
                </label>
                <div className="flex">
                  <select
                    value={editDiscType}
                    onChange={(e) => setEditDiscType(e.target.value as DiscountType)}
                    className="px-3 py-2 rounded-l-xl border border-r-0 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                  >
                    <option value="NOMINAL">Rp</option>
                    <option value="PERCENT">%</option>
                  </select>
                  <input
                    type="number"
                    min={0}
                    value={editDiscVal}
                    onChange={(e) => setEditDiscVal(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-r-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono tabular-nums"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingProductId(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl text-white text-xs font-semibold"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                Simpan
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Customer Picker Modal */}
      {customerPickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                Pilih Pelanggan
              </h3>
              <button
                type="button"
                onClick={() => setCustomerPickerOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3 border-b border-slate-100 dark:border-slate-800">
              <input
                type="text"
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                placeholder="Cari nama atau nomor HP..."
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              />
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
              {customers
                .filter((c) => {
                  const q = customerSearch.trim().toLowerCase();
                  if (!q) return true;
                  return (
                    c.name.toLowerCase().includes(q) || c.phone.toLowerCase().includes(q)
                  );
                })
                .map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setSelectedCustomer(c);
                      setRedeemPointsStr('0');
                      setCustomerPickerOpen(false);
                    }}
                    className="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-left"
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        {c.name}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {c.phone || 'Tanpa No HP'} · {c.visitCount} kunjungan
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
                      {formatNumber(c.loyaltyPoints)} poin
                    </span>
                  </button>
                ))}
            </div>

            <form
              onSubmit={(e) => void handleQuickAddCustomer(e)}
              className="p-4 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-800 space-y-2.5"
            >
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                <UserPlus className="w-3.5 h-3.5" />
                Tambah Pelanggan Baru Cepat
              </p>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  required
                  value={quickCustName}
                  onChange={(e) => setQuickCustName(e.target.value)}
                  placeholder="Nama *"
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs"
                />
                <input
                  type="tel"
                  value={quickCustPhone}
                  onChange={(e) => setQuickCustPhone(e.target.value)}
                  placeholder="No HP / WA"
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs"
                />
              </div>
              <button
                type="submit"
                disabled={savingCustomer}
                className="w-full py-2 rounded-xl text-white text-xs font-semibold disabled:opacity-60"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                {savingCustomer ? 'Menyimpan...' : 'Simpan & Pilih Pelanggan'}
              </button>
            </form>
          </div>
        </div>
      )}

      <BarcodeScannerModal
        open={scannerOpen}
        title="Scan Barcode ke Keranjang"
        onDetected={handleBarcodeDetected}
        onClose={() => setScannerOpen(false)}
      />

      <MidtransPaymentModal
        open={midtransOpen}
        paymentMethod={paymentMethod}
        grossAmount={calculations.totalAmount}
        customerName={selectedCustomer?.name || 'Pelanggan Toko'}
        bankTransferInfo={store.bankTransferInfo}
        cartLines={cartLines}
        onPaid={({ gatewayProvider, gatewayOrderId }) =>
          executeFinalizeTransaction({ gatewayProvider, gatewayOrderId })
        }
        onCancel={() => setMidtransOpen(false)}
      />
    </div>
  );
};

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Edit3,
  ImagePlus,
  Layers,
  Package,
  Plus,
  ScanLine,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  CATEGORY_COLOR_CHOICES,
  UNIT_CHOICES,
  type Category,
  type Product,
  type StaffPermissionsSummary,
  type StoreProfile,
} from '../types/models';
import { formatFriendlyDatabaseError } from '../lib/supabase';
import { compressImageFileToBase64, formatNumber, formatRupiah } from '../lib/formatters';
import {
  deleteCategory,
  deleteProduct,
  saveCategory,
  saveProduct,
} from '../lib/storeRepository';
import { BarcodeScannerModal } from '../components/BarcodeScannerModal';
import { ConfirmModal } from '../components/ConfirmModal';

interface ProductsCategoriesViewProps {
  store: StoreProfile;
  products: Product[];
  categories: Category[];
  permissions: StaffPermissionsSummary;
  onNotify: (type: 'success' | 'error' | 'info', message: string) => void;
}

export const ProductsCategoriesView: React.FC<ProductsCategoriesViewProps> = ({
  store,
  products,
  categories,
  permissions,
  onNotify,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'PRODUCTS' | 'CATEGORIES'>('PRODUCTS');
  const [search, setSearch] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);

  // Product modal state
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [pName, setPName] = useState('');
  const [pCatId, setPCatId] = useState('');
  const [pBarcode, setPBarcode] = useState('');
  const [pCost, setPCost] = useState('');
  const [pSell, setPSell] = useState('');
  const [pStock, setPStock] = useState('');
  const [pUnit, setPUnit] = useState('pcs');
  const [pMinAlert, setPMinAlert] = useState('5');
  const [pImageBase64, setPImageBase64] = useState<string | undefined>(undefined);
  const [savingProduct, setSavingProduct] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);

  // Category modal state
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [cName, setCName] = useState('');
  const [cColor, setCColor] = useState(CATEGORY_COLOR_CHOICES[0]);
  const [savingCat, setSavingCat] = useState(false);

  // Confirm delete state
  const [deleteTarget, setDeleteTarget] = useState<
    { type: 'product'; item: Product } | { type: 'category'; item: Category } | null
  >(null);
  const [deleting, setDeleting] = useState(false);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (lowStockOnly && p.stock > p.minStockAlert) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.barcode.toLowerCase().includes(q) ||
        p.categoryName.toLowerCase().includes(q)
      );
    });
  }, [products, search, lowStockOnly]);

  const openNewProduct = () => {
    setEditingProduct(null);
    setPName('');
    setPCatId(categories[0]?.id || '');
    setPBarcode('');
    setPCost('');
    setPSell('');
    setPStock('10');
    setPUnit('pcs');
    setPMinAlert('5');
    setPImageBase64(undefined);
    setProductModalOpen(true);
  };

  const openEditProduct = (p: Product) => {
    setEditingProduct(p);
    setPName(p.name);
    setPCatId(p.categoryId);
    setPBarcode(p.barcode);
    setPCost(String(p.costPrice));
    setPSell(String(p.sellPrice));
    setPStock(String(p.stock));
    setPUnit(p.unit || 'pcs');
    setPMinAlert(String(p.minStockAlert));
    setPImageBase64(p.imageBase64);
    setProductModalOpen(true);
  };

  const handleUploadProductImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const b64 = await compressImageFileToBase64(file, 600, 140000);
      setPImageBase64(b64);
      onNotify('success', 'Foto produk siap disimpan.');
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Gagal memproses gambar.');
    }
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pName.trim()) {
      onNotify('error', 'Nama produk wajib diisi.');
      return;
    }
    const chosenCat = categories.find((c) => c.id === pCatId);
    setSavingProduct(true);
    try {
      await saveProduct(store, {
        id: editingProduct?.id,
        name: pName.trim(),
        categoryId: chosenCat?.id || '',
        categoryName: chosenCat?.name || 'Umum',
        barcode: pBarcode.trim(),
        costPrice: Math.max(0, Math.round(Number(pCost) || 0)),
        sellPrice: Math.max(0, Math.round(Number(pSell) || 0)),
        stock: Math.max(0, Math.round(Number(pStock) || 0)),
        unit: pUnit.trim() || 'pcs',
        minStockAlert: Math.max(0, Math.round(Number(pMinAlert) || 0)),
        imageBase64: pImageBase64,
      });
      setProductModalOpen(false);
      onNotify(
        'success',
        editingProduct ? 'Produk berhasil diperbarui.' : 'Produk baru ditambahkan.'
      );
    } catch (err) {
      onNotify('error', formatFriendlyDatabaseError(err));
    } finally {
      setSavingProduct(false);
    }
  };

  const openNewCategory = () => {
    setEditingCategory(null);
    setCName('');
    setCColor(CATEGORY_COLOR_CHOICES[0]);
    setCatModalOpen(true);
  };

  const openEditCategory = (cat: Category) => {
    setEditingCategory(cat);
    setCName(cat.name);
    setCColor(cat.colorHex || CATEGORY_COLOR_CHOICES[0]);
    setCatModalOpen(true);
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cName.trim()) {
      onNotify('error', 'Nama kategori wajib diisi.');
      return;
    }
    setSavingCat(true);
    try {
      await saveCategory(store, {
        id: editingCategory?.id,
        name: cName.trim(),
        colorHex: cColor,
      });
      setCatModalOpen(false);
      onNotify(
        'success',
        editingCategory ? 'Kategori diperbarui.' : 'Kategori baru ditambahkan.'
      );
    } catch (err) {
      onNotify('error', formatFriendlyDatabaseError(err));
    } finally {
      setSavingCat(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (deleteTarget.type === 'product') {
        await deleteProduct(store.id, deleteTarget.item.id);
        onNotify('success', `Produk "${deleteTarget.item.name}" dihapus.`);
      } else {
        await deleteCategory(store.id, deleteTarget.item.id);
        onNotify('success', `Kategori "${deleteTarget.item.name}" dihapus.`);
      }
      setDeleteTarget(null);
    } catch (err) {
      onNotify('error', formatFriendlyDatabaseError(err));
    } finally {
      setDeleting(false);
    }
  };

  const unitProfitPreview = (Number(pSell) || 0) - (Number(pCost) || 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">
            Produk &amp; Kategori
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Kelola harga modal, harga jual, stok, barcode, dan kategori barang
          </p>
        </div>

        <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-800 p-1 bg-white dark:bg-slate-900">
          <button
            type="button"
            onClick={() => setActiveSubTab('PRODUCTS')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
              activeSubTab === 'PRODUCTS'
                ? 'text-white'
                : 'text-slate-600 dark:text-slate-300'
            }`}
            style={
              activeSubTab === 'PRODUCTS'
                ? { backgroundColor: 'var(--brand-primary)' }
                : undefined
            }
          >
            Produk ({products.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('CATEGORIES')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
              activeSubTab === 'CATEGORIES'
                ? 'text-white'
                : 'text-slate-600 dark:text-slate-300'
            }`}
            style={
              activeSubTab === 'CATEGORIES'
                ? { backgroundColor: 'var(--brand-primary)' }
                : undefined
            }
          >
            Kategori ({categories.length})
          </button>
        </div>
      </div>

      {activeSubTab === 'PRODUCTS' && !permissions.canManageProducts && (
        <div className="p-3.5 rounded-xl bg-slate-100 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300">
          Akun Anda memiliki akses lihat-saja untuk katalog produk. Hubungi pemilik toko untuk izin ubah stok/produk.
        </div>
      )}

      {activeSubTab === 'CATEGORIES' && !permissions.canManageCategories && (
        <div className="p-3.5 rounded-xl bg-slate-100 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300">
          Akun Anda memiliki akses lihat-saja untuk kategori.
        </div>
      )}

      {activeSubTab === 'PRODUCTS' ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari produk, barcode, atau kategori..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white"
              />
            </div>

            <button
              type="button"
              onClick={() => setLowStockOnly((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border text-xs font-semibold transition-colors whitespace-nowrap ${
                lowStockOnly
                  ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              Stok Menipis
            </button>

            {permissions.canManageProducts && (
              <button
                type="button"
                onClick={openNewProduct}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-white text-xs font-semibold transition-colors whitespace-nowrap"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                <Plus className="w-4 h-4" />
                Tambah Produk
              </button>
            )}
          </div>

          {filteredProducts.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-10 text-center space-y-2">
              <Package className="w-9 h-9 text-slate-300 dark:text-slate-600 mx-auto" />
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                Belum ada produk sesuai filter
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
              {filteredProducts.map((p) => {
                const margin = p.sellPrice - p.costPrice;
                const isLow = p.stock <= p.minStockAlert;
                return (
                  <div
                    key={p.id}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex gap-3.5"
                  >
                    <div className="w-16 h-16 rounded-xl bg-slate-100 dark:bg-slate-800 overflow-hidden shrink-0 flex items-center justify-center">
                      {p.imageBase64 ? (
                        <img
                          src={`data:image/jpeg;base64,${p.imageBase64}`}
                          alt={p.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Package className="w-6 h-6 text-slate-400" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                            {p.name}
                          </h3>
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                            {p.categoryName || 'Umum'}
                            {p.barcode ? ` · ${p.barcode}` : ''}
                          </p>
                        </div>
                        {permissions.canManageProducts && (
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => openEditProduct(p)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
                              aria-label="Edit produk"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setDeleteTarget({ type: 'product', item: p })
                              }
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                              aria-label="Hapus produk"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs tabular-nums">
                        <div>
                          <span className="font-bold text-slate-900 dark:text-white">
                            {formatRupiah(p.sellPrice)}
                          </span>
                          <span className="text-slate-400">
                            {' '}
                            · Modal {formatRupiah(p.costPrice)} · Laba{' '}
                            <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                              {formatRupiah(margin)}
                            </span>
                          </span>
                        </div>
                        <span
                          className={`font-semibold ${
                            p.stock <= 0
                              ? 'text-red-600'
                              : isLow
                                ? 'text-amber-600'
                                : 'text-slate-700 dark:text-slate-200'
                          }`}
                        >
                          Stok: {formatNumber(p.stock)} {p.unit}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {permissions.canManageCategories && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={openNewCategory}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-white text-xs font-semibold transition-colors whitespace-nowrap"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                <Plus className="w-4 h-4" />
                Tambah Kategori
              </button>
            </div>
          )}

          {categories.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-10 text-center space-y-2">
              <Layers className="w-9 h-9 text-slate-300 dark:text-slate-600 mx-auto" />
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                Belum ada kategori dibuat
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {categories.map((cat) => {
                const count = products.filter((p) => p.categoryId === cat.id).length;
                return (
                  <div
                    key={cat.id}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className="w-4 h-4 rounded-full shrink-0"
                        style={{ backgroundColor: cat.colorHex }}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                          {cat.name}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {count} produk
                        </p>
                      </div>
                    </div>

                    {permissions.canManageCategories && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => openEditCategory(cat)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
                          aria-label="Edit kategori"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setDeleteTarget({ type: 'category', item: cat })
                          }
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                          aria-label="Hapus kategori"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Product Modal */}
      {productModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <form
            onSubmit={(e) => void handleSaveProduct(e)}
            className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                {editingProduct ? 'Edit Produk' : 'Tambah Produk Baru'}
              </h3>
              <button
                type="button"
                onClick={() => setProductModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 overflow-hidden shrink-0 flex items-center justify-center">
                  {pImageBase64 ? (
                    <img
                      src={`data:image/jpeg;base64,${pImageBase64}`}
                      alt="Preview"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Package className="w-6 h-6 text-slate-400" />
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
                    <ImagePlus className="w-3.5 h-3.5" />
                    Pilih Foto Produk
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => void handleUploadProductImage(e)}
                      className="hidden"
                    />
                  </label>
                  {pImageBase64 && (
                    <button
                      type="button"
                      onClick={() => setPImageBase64(undefined)}
                      className="text-xs font-medium text-red-600 hover:underline"
                    >
                      Hapus Foto
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="sm:col-span-2 space-y-1">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    Nama Produk *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={100}
                    value={pName}
                    onChange={(e) => setPName(e.target.value)}
                    placeholder="Contoh: Kopi Susu Gula Aren"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    Kategori
                  </label>
                  <select
                    value={pCatId}
                    onChange={(e) => setPCatId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                  >
                    <option value="">Umum</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    Barcode / SKU
                  </label>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      maxLength={64}
                      value={pBarcode}
                      onChange={(e) => setPBarcode(e.target.value)}
                      placeholder="Opsional"
                      className="flex-1 min-w-0 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setScannerOpen(true)}
                      className="px-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                      title="Scan barcode"
                    >
                      <ScanLine className="w-4 h-4 text-emerald-600" />
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    Harga Modal (Rp) *
                  </label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={pCost}
                    onChange={(e) => setPCost(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono tabular-nums"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    Harga Jual (Rp) *
                  </label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={pSell}
                    onChange={(e) => setPSell(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono tabular-nums"
                  />
                </div>

                <div className="sm:col-span-2 px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/70 text-xs flex items-center justify-between tabular-nums">
                  <span className="text-slate-500 dark:text-slate-400">
                    Estimasi Keuntungan per Unit
                  </span>
                  <span
                    className={`font-bold ${
                      unitProfitPreview >= 0
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-red-600'
                    }`}
                  >
                    {formatRupiah(unitProfitPreview)}
                  </span>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    Stok Saat Ini *
                  </label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={pStock}
                    onChange={(e) => setPStock(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono tabular-nums"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    Satuan
                  </label>
                  <select
                    value={pUnit}
                    onChange={(e) => setPUnit(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                  >
                    {UNIT_CHOICES.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2 space-y-1">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    Batas Peringatan Stok Menipis
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={pMinAlert}
                    onChange={(e) => setPMinAlert(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono tabular-nums"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 px-5 py-3.5 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setProductModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={savingProduct}
                className="px-5 py-2 rounded-xl text-white text-xs font-semibold disabled:opacity-60"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                {savingProduct ? 'Menyimpan...' : 'Simpan Produk'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Category Modal */}
      {catModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <form
            onSubmit={(e) => void handleSaveCategory(e)}
            className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                {editingCategory ? 'Edit Kategori' : 'Kategori Baru'}
              </h3>
              <button
                type="button"
                onClick={() => setCatModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  Nama Kategori *
                </label>
                <input
                  type="text"
                  required
                  maxLength={50}
                  value={cName}
                  onChange={(e) => setCName(e.target.value)}
                  placeholder="Contoh: Minuman Dingin"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  Warna Label
                </label>
                <div className="flex flex-wrap gap-2">
                  {CATEGORY_COLOR_CHOICES.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      onClick={() => setCColor(hex)}
                      className={`w-7 h-7 rounded-full border-2 transition-transform ${
                        cColor === hex
                          ? 'border-slate-900 dark:border-white scale-110'
                          : 'border-transparent'
                      }`}
                      style={{ backgroundColor: hex }}
                      aria-label={`Warna ${hex}`}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCatModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={savingCat}
                className="px-4 py-2 rounded-xl text-white text-xs font-semibold disabled:opacity-60"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                {savingCat ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          </form>
        </div>
      )}

      <BarcodeScannerModal
        open={scannerOpen}
        title="Scan Barcode Produk"
        onDetected={(code) => setPBarcode(code)}
        onClose={() => setScannerOpen(false)}
      />

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title={
          deleteTarget?.type === 'product' ? 'Hapus Produk?' : 'Hapus Kategori?'
        }
        message={
          deleteTarget
            ? `Yakin ingin menghapus "${deleteTarget.item.name}"? Tindakan ini tidak dapat dibatalkan.`
            : ''
        }
        confirmLabel="Hapus"
        danger
        loading={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

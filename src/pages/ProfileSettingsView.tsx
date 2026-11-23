import React, { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import {
  Building2,
  CheckCircle2,
  DatabaseBackup,
  Download,
  ImagePlus,
  LogOut,
  Moon,
  Plus,
  ShieldCheck,
  Smartphone,
  Sun,
  Trash2,
  Upload,
  UserPlus,
  Users,
} from 'lucide-react';
import {
  BRAND_PALETTES,
  BUSINESS_TYPE_CHOICES,
  type Category,
  type Customer,
  type MidtransConfigStatus,
  type PosTransaction,
  type Product,
  type StaffInvite,
  type StaffMember,
  type StoreLogoIconKey,
  type StoreProfile,
  type StoreThemePaletteKey,
  type UserRole,
} from '../types/models';
import { formatFriendlyDatabaseError } from '../lib/supabase';
import { compressImageFileToBase64 } from '../lib/formatters';
import {
  fetchApkDistributionInfo,
  fetchMidtransConfigStatus,
  type ApkDistributionInfo,
} from '../lib/midtransClient';
import {
  buildBackupJson,
  deleteInvite,
  inviteStaffAndShareAccess,
  removeStaffMember,
  restoreFromBackupJson,
  updateStaffPermissions,
  updateStoreSettings,
} from '../lib/storeRepository';
import { ConfirmModal } from '../components/ConfirmModal';
import {
  DynamicStoreLogo,
  renderStoreIconGlyph,
  STORE_ICON_OPTIONS,
} from '../components/DynamicStoreLogo';

interface ProfileSettingsViewProps {
  store: StoreProfile;
  userStores: StoreProfile[];
  role: UserRole;
  currentUid: string;
  currentEmail: string;
  staffList: StaffMember[];
  storeInvites: StaffInvite[];
  categories: Category[];
  products: Product[];
  customers: Customer[];
  transactions: PosTransaction[];
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onSwitchStore: (targetStore: StoreProfile) => void;
  onCreateAnotherStore: () => void;
  onSignOut: () => void;
  onNotify: (type: 'success' | 'error' | 'info', message: string) => void;
}

export const ProfileSettingsView: React.FC<ProfileSettingsViewProps> = ({
  store,
  userStores,
  role,
  currentUid,
  currentEmail,
  staffList,
  storeInvites,
  categories,
  products,
  customers,
  transactions,
  darkMode,
  onToggleDarkMode,
  onSwitchStore,
  onCreateAnotherStore,
  onSignOut,
  onNotify,
}) => {
  const [name, setName] = useState(store.name);
  const [businessType, setBusinessType] = useState(
    store.businessType || BUSINESS_TYPE_CHOICES[0]
  );
  const [ownerName, setOwnerName] = useState(store.ownerName);
  const [whatsapp, setWhatsapp] = useState(store.whatsapp);
  const [email, setEmail] = useState(store.email);
  const [address, setAddress] = useState(store.address);
  const [description, setDescription] = useState(store.description);
  const [receiptFooter, setReceiptFooter] = useState(store.receiptFooter);
  const [taxPercent, setTaxPercent] = useState(String(store.taxPercent));
  const [defaultDiscountPercent, setDefaultDiscountPercent] = useState(
    String(store.defaultDiscountPercent)
  );
  const [bankTransferInfo, setBankTransferInfo] = useState(store.bankTransferInfo);
  const [logoIconKey, setLogoIconKey] = useState<StoreLogoIconKey>(store.logoIconKey);
  const [themePaletteKey, setThemePaletteKey] = useState<StoreThemePaletteKey>(
    store.themePaletteKey
  );
  const [logoBase64, setLogoBase64] = useState<string | undefined>(store.logoBase64);
  const [savingStore, setSavingStore] = useState(false);

  // Midtrans & APK status
  const [midtransStatus, setMidtransStatus] = useState<MidtransConfigStatus | null>(null);
  const [apkInfo, setApkInfo] = useState<ApkDistributionInfo | null>(null);
  const isNativeApk = Capacitor.isNativePlatform();

  // Staff Invite Form
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [invKasir, setInvKasir] = useState(true);
  const [invProducts, setInvProducts] = useState(true);
  const [invCategories, setInvCategories] = useState(false);
  const [invTransactions, setInvTransactions] = useState(true);
  const [invReports, setInvReports] = useState(false);
  const [invSettings, setInvSettings] = useState(false);
  const [inviting, setInviting] = useState(false);

  // Restore JSON & Delete Staff confirmation
  const [pendingRestoreJson, setPendingRestoreJson] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [staffToRemove, setStaffToRemove] = useState<StaffMember | null>(null);
  const [removingStaff, setRemovingStaff] = useState(false);

  useEffect(() => {
    setName(store.name);
    setBusinessType(store.businessType || BUSINESS_TYPE_CHOICES[0]);
    setOwnerName(store.ownerName);
    setWhatsapp(store.whatsapp);
    setEmail(store.email);
    setAddress(store.address);
    setDescription(store.description);
    setReceiptFooter(store.receiptFooter);
    setTaxPercent(String(store.taxPercent));
    setDefaultDiscountPercent(String(store.defaultDiscountPercent));
    setBankTransferInfo(store.bankTransferInfo);
    setLogoIconKey(store.logoIconKey);
    setThemePaletteKey(store.themePaletteKey);
    setLogoBase64(store.logoBase64);
  }, [store]);

  useEffect(() => {
    fetchMidtransConfigStatus()
      .then(setMidtransStatus)
      .catch(() => setMidtransStatus({ configured: false, isProduction: false }));
    if (!isNativeApk) {
      fetchApkDistributionInfo().then(setApkInfo);
    }
  }, [isNativeApk]);

  const handleUploadLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const b64 = await compressImageFileToBase64(file, 480, 120000);
      setLogoBase64(b64);
      onNotify('success', 'Logo siap disimpan.');
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Gagal membaca logo.');
    }
  };

  const handleSaveStore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      onNotify('error', 'Nama toko wajib diisi.');
      return;
    }
    setSavingStore(true);
    try {
      await updateStoreSettings({
        ...store,
        name: name.trim(),
        businessType: businessType.trim(),
        ownerName: ownerName.trim(),
        whatsapp: whatsapp.trim(),
        email: email.trim(),
        address: address.trim(),
        description: description.trim(),
        receiptFooter: receiptFooter.trim(),
        taxPercent: Number(taxPercent) || 0,
        defaultDiscountPercent: Number(defaultDiscountPercent) || 0,
        bankTransferInfo: bankTransferInfo.trim(),
        logoIconKey,
        themePaletteKey,
        logoBase64,
      });
      onNotify('success', 'Pengaturan toko berhasil disimpan.');
    } catch (err) {
      onNotify('error', formatFriendlyDatabaseError(err));
    } finally {
      setSavingStore(false);
    }
  };

  const handleInviteStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteName.trim() || !inviteEmail.trim()) {
      onNotify('error', 'Nama dan email Google kasir wajib diisi.');
      return;
    }
    setInviting(true);
    try {
      await inviteStaffAndShareAccess({
        store,
        staffName: inviteName.trim(),
        staffEmail: inviteEmail.trim(),
        canAccessKasir: invKasir,
        canManageProducts: invProducts,
        canManageCategories: invCategories,
        canViewTransactions: invTransactions,
        canViewReports: invReports,
        canManageSettings: invSettings,
      });
      setInviteName('');
      setInviteEmail('');
      onNotify(
        'success',
        'Undangan kasir terkirim. Minta staf login memakai email Google tersebut.'
      );
    } catch (err) {
      onNotify('error', formatFriendlyDatabaseError(err));
    } finally {
      setInviting(false);
    }
  };

  const handleTogglePermission = async (
    staff: StaffMember,
    field: keyof Pick<
      StaffMember,
      | 'active'
      | 'canAccessKasir'
      | 'canManageProducts'
      | 'canManageCategories'
      | 'canViewTransactions'
      | 'canViewReports'
      | 'canManageSettings'
    >
  ) => {
    try {
      await updateStaffPermissions(store.id, {
        ...staff,
        [field]: !staff[field],
      });
      onNotify('success', `Hak akses ${staff.displayName} diperbarui.`);
    } catch (err) {
      onNotify('error', formatFriendlyDatabaseError(err));
    }
  };

  const handleConfirmRemoveStaff = async () => {
    if (!staffToRemove) return;
    setRemovingStaff(true);
    try {
      await removeStaffMember(store, staffToRemove);
      onNotify('success', `Akses ${staffToRemove.displayName} dicabut.`);
      setStaffToRemove(null);
    } catch (err) {
      onNotify('error', formatFriendlyDatabaseError(err));
    } finally {
      setRemovingStaff(false);
    }
  };

  const handleExportBackup = () => {
    const json = buildBackupJson({
      store,
      categories,
      products,
      customers,
      transactions,
    });
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Backup-${store.name.replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    onNotify('success', 'File backup JSON berhasil diunduh.');
  };

  const handleSelectRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      JSON.parse(text);
      setPendingRestoreJson(text);
    } catch {
      onNotify('error', 'File bukan JSON backup yang valid.');
    }
  };

  const handleConfirmRestore = async () => {
    if (!pendingRestoreJson) return;
    setRestoring(true);
    try {
      const counts = await restoreFromBackupJson({
        store,
        currentUid,
        jsonText: pendingRestoreJson,
      });
      setPendingRestoreJson(null);
      onNotify(
        'success',
        `Restore selesai: ${counts.categories} kategori, ${counts.products} produk, ${counts.customers} pelanggan, ${counts.transactions} transaksi.`
      );
    } catch (err) {
      onNotify('error', formatFriendlyDatabaseError(err));
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">
            Profil &amp; Pengaturan Toko
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Akun aktif: {currentEmail} · Peran: {role === 'OWNER' ? 'Pemilik' : 'Kasir'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleDarkMode}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap"
          >
            {darkMode ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4" />}
            {darkMode ? 'Mode Terang' : 'Mode Gelap'}
          </button>

          <button
            type="button"
            onClick={onSignOut}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-xs font-semibold text-red-700 dark:text-red-400 whitespace-nowrap"
          >
            <LogOut className="w-4 h-4" />
            Keluar
          </button>
        </div>
      </div>

      {/* Store Settings Form */}
      <form
        onSubmit={(e) => void handleSaveStore(e)}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-5"
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <DynamicStoreLogo
            storeName={name || store.name}
            logoIconKey={logoIconKey}
            logoBase64={logoBase64}
            themePaletteKey={themePaletteKey}
            size="xl"
          />
          <div className="space-y-2">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Identitas &amp; Tampilan Toko
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
                <ImagePlus className="w-3.5 h-3.5" />
                Ganti Logo
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => void handleUploadLogo(e)}
                  className="hidden"
                />
              </label>
              {logoBase64 && (
                <button
                  type="button"
                  onClick={() => setLogoBase64(undefined)}
                  className="text-xs font-medium text-red-600 hover:underline"
                >
                  Hapus Logo
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Nama Toko *
            </label>
            <input
              type="text"
              required
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Jenis Usaha
            </label>
            <select
              value={businessType}
              onChange={(e) => setBusinessType(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
            >
              {BUSINESS_TYPE_CHOICES.map((bt) => (
                <option key={bt} value={bt}>
                  {bt}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Nama Pemilik
            </label>
            <input
              type="text"
              maxLength={100}
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Nomor WhatsApp
            </label>
            <input
              type="tel"
              maxLength={40}
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Email Toko
            </label>
            <input
              type="email"
              maxLength={160}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
            />
          </div>

          <div className="sm:col-span-2 space-y-1">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Alamat Toko (tampil di kop struk)
            </label>
            <input
              type="text"
              maxLength={240}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
            />
          </div>

          <div className="sm:col-span-2 space-y-1">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Catatan Footer Struk
            </label>
            <input
              type="text"
              maxLength={240}
              value={receiptFooter}
              onChange={(e) => setReceiptFooter(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Pajak Penjualan (%)
            </label>
            <input
              type="number"
              min={0}
              max={100}
              step="0.5"
              value={taxPercent}
              onChange={(e) => setTaxPercent(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono tabular-nums"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Diskon Default Kasir (%)
            </label>
            <input
              type="number"
              min={0}
              max={100}
              step="0.5"
              value={defaultDiscountPercent}
              onChange={(e) => setDefaultDiscountPercent(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono tabular-nums"
            />
          </div>

          <div className="sm:col-span-2 space-y-1">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Info Rekening Transfer Bank
            </label>
            <input
              type="text"
              maxLength={240}
              value={bankTransferInfo}
              onChange={(e) => setBankTransferInfo(e.target.value)}
              placeholder="Contoh: BCA 1234567890 a.n. Budi Santoso"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Ikon Default Toko
            </label>
            <div className="grid grid-cols-3 gap-2">
              {STORE_ICON_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setLogoIconKey(opt.key)}
                  className={`flex flex-col items-center gap-1 p-2 rounded-xl border text-xs font-medium ${
                    logoIconKey === opt.key
                      ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {renderStoreIconGlyph(opt.key, 'w-4 h-4')}
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Tema Warna Aplikasi
            </label>
            <div className="grid grid-cols-1 gap-1.5">
              {Object.values(BRAND_PALETTES).map((pal) => (
                <button
                  key={pal.key}
                  type="button"
                  onClick={() => setThemePaletteKey(pal.key)}
                  className={`flex items-center justify-between px-3 py-1.5 rounded-xl border text-xs font-medium ${
                    themePaletteKey === pal.key
                      ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 text-slate-900 dark:text-white'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  <span>{pal.label}</span>
                  <span className="flex items-center gap-1">
                    <span
                      className="w-3.5 h-3.5 rounded-full"
                      style={{ backgroundColor: pal.primary }}
                    />
                    <span
                      className="w-3.5 h-3.5 rounded-full"
                      style={{ backgroundColor: pal.secondary }}
                    />
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>
              Midtrans Core API:{' '}
              {midtransStatus?.configured
                ? midtransStatus.isProduction
                  ? 'Aktif (Production)'
                  : 'Aktif (Sandbox)'
                : 'Belum dikonfigurasi di server'}
            </span>
          </div>
          <button
            type="submit"
            disabled={savingStore}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-white text-xs font-semibold disabled:opacity-60 whitespace-nowrap"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            <CheckCircle2 className="w-4 h-4" />
            {savingStore ? 'Menyimpan...' : 'Simpan Pengaturan'}
          </button>
        </div>
      </form>

      {/* Owner-Only Staff & RBAC Management */}
      {role === 'OWNER' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-5">
          <div className="flex items-center gap-2.5">
            <Users className="w-5 h-5 text-emerald-600" />
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Manajemen Staf &amp; Hak Akses Kasir
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Undang kasir dengan akun Google mereka dan atur hak akses setiap menu
              </p>
            </div>
          </div>

          <form
            onSubmit={(e) => void handleInviteStaff(e)}
            className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-3"
          >
            <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <UserPlus className="w-4 h-4" />
              Undang Kasir Baru
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                required
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                placeholder="Nama Kasir"
                className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs"
              />
              <input
                type="email"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="Email Google Kasir (contoh@gmail.com)"
                className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs"
              />
            </div>

            <div className="flex flex-wrap gap-3 text-xs text-slate-700 dark:text-slate-300">
              {[
                { label: 'Buka Kasir', checked: invKasir, set: setInvKasir },
                { label: 'Kelola Produk', checked: invProducts, set: setInvProducts },
                {
                  label: 'Kelola Kategori',
                  checked: invCategories,
                  set: setInvCategories,
                },
                {
                  label: 'Lihat Transaksi',
                  checked: invTransactions,
                  set: setInvTransactions,
                },
                { label: 'Lihat Laporan', checked: invReports, set: setInvReports },
                { label: 'Pengaturan', checked: invSettings, set: setInvSettings },
              ].map((perm) => (
                <label key={perm.label} className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={perm.checked}
                    onChange={(e) => perm.set(e.target.checked)}
                    className="rounded border-slate-300 text-emerald-700"
                  />
                  {perm.label}
                </label>
              ))}
            </div>

            <button
              type="submit"
              disabled={inviting}
              className="px-4 py-2 rounded-xl text-white text-xs font-semibold disabled:opacity-60 whitespace-nowrap"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              {inviting ? 'Mengirim Undangan...' : 'Kirim Undangan Kasir'}
            </button>
          </form>

          {storeInvites.filter((i) => i.status === 'PENDING').length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Undangan Menunggu Konfirmasi
              </h3>
              {storeInvites
                .filter((i) => i.status === 'PENDING')
                .map((inv) => (
                  <div
                    key={inv.id}
                    className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 text-xs"
                  >
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-white">
                        {inv.staffName} · {inv.staffEmail}
                      </p>
                      <p className="text-slate-500 dark:text-slate-400">
                        Menunggu kasir masuk dengan Google
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void deleteInvite(inv.id)}
                      className="text-red-600 hover:underline font-medium"
                    >
                      Batalkan
                    </button>
                  </div>
                ))}
            </div>
          )}

          <div className="space-y-2.5">
            <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Daftar Anggota Tim ({staffList.length})
            </h3>
            {staffList.map((staff) => (
              <div
                key={staff.id}
                className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      {staff.displayName}{' '}
                      <span className="text-xs font-normal text-slate-500">
                        ({staff.role === 'OWNER' ? 'Pemilik' : 'Kasir'})
                      </span>
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {staff.email}
                    </p>
                  </div>

                  {staff.role !== 'OWNER' && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleTogglePermission(staff, 'active')}
                        className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                          staff.active
                            ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
                            : 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300'
                        }`}
                      >
                        {staff.active ? 'Aktif' : 'Nonaktif'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setStaffToRemove(staff)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                        aria-label="Hapus staf"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                {staff.role !== 'OWNER' && (
                  <div className="flex flex-wrap gap-3 text-xs text-slate-600 dark:text-slate-300">
                    {(
                      [
                        ['canAccessKasir', 'Kasir'],
                        ['canManageProducts', 'Produk'],
                        ['canManageCategories', 'Kategori'],
                        ['canViewTransactions', 'Transaksi'],
                        ['canViewReports', 'Laporan'],
                        ['canManageSettings', 'Pengaturan'],
                      ] as const
                    ).map(([field, label]) => (
                      <label
                        key={field}
                        className="inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={staff[field]}
                          onChange={() => void handleTogglePermission(staff, field)}
                          className="rounded border-slate-300 text-emerald-700"
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Multi-Store Switcher */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Building2 className="w-5 h-5 text-emerald-600" />
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Toko Saya (Multi-Toko)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Setiap toko terisolasi penuh dengan ID toko masing-masing
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCreateAnotherStore}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-white text-xs font-semibold whitespace-nowrap"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            <Plus className="w-3.5 h-3.5" />
            Tambah Toko Baru
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {userStores.map((s) => {
            const isActive = s.id === store.id;
            return (
              <div
                key={s.id}
                className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 ${
                  isActive
                    ? 'border-emerald-600 bg-emerald-50/70 dark:bg-emerald-950/30'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                    {s.name}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {s.businessType || 'UMKM'} ·{' '}
                    {s.ownerUid === currentUid ? 'Pemilik' : 'Kasir'}
                  </p>
                </div>
                {isActive ? (
                  <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 shrink-0">
                    Aktif
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onSwitchStore(s)}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 shrink-0"
                  >
                    Buka Toko
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Android APK Distribution Card */}
      {!isNativeApk && apkInfo?.available && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Aplikasi Android (.apk) Siap Install
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Versi {apkInfo.versionName} · {apkInfo.minAndroid} ·{' '}
                {(apkInfo.sizeBytes / (1024 * 1024)).toFixed(1)} MB
              </p>
            </div>
          </div>
          <a
            href={apkInfo.downloadUrl}
            download={apkInfo.filename}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold whitespace-nowrap"
          >
            <Download className="w-4 h-4" />
            Unduh APK Release
          </a>
        </div>
      )}

      {/* Backup & Restore */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-2.5">
          <DatabaseBackup className="w-5 h-5 text-emerald-600" />
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Backup &amp; Restore Data Toko (JSON)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Cadangkan kategori, produk, pelanggan, dan riwayat transaksi ke file JSON lokal
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleExportBackup}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            <DatabaseBackup className="w-4 h-4 text-emerald-600" />
            Unduh Backup JSON
          </button>

          {role === 'OWNER' && (
            <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap">
              <Upload className="w-4 h-4 text-sky-600" />
              Restore dari JSON
              <input
                type="file"
                accept=".json,application/json"
                onChange={(e) => void handleSelectRestoreFile(e)}
                className="hidden"
              />
            </label>
          )}
        </div>
      </div>

      <ConfirmModal
        open={Boolean(staffToRemove)}
        title="Cabut Akses Staf?"
        message={
          staffToRemove
            ? `Yakin ingin menghapus akses "${staffToRemove.displayName}" (${staffToRemove.email}) dari toko?`
            : ''
        }
        confirmLabel="Cabut Akses"
        danger
        loading={removingStaff}
        onConfirm={() => void handleConfirmRemoveStaff()}
        onCancel={() => setStaffToRemove(null)}
      />

      <ConfirmModal
        open={Boolean(pendingRestoreJson)}
        title="Pulihkan Data dari Backup JSON?"
        message="Data kategori, produk, pelanggan, dan transaksi dari file backup akan ditulis ke toko aktif Anda."
        confirmLabel="Ya, Restore Sekarang"
        loading={restoring}
        onConfirm={() => void handleConfirmRestore()}
        onCancel={() => setPendingRestoreJson(null)}
      />
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Database,
  Download,
  ImagePlus,
  LogOut,
  Mail,
  ShieldCheck,
  Smartphone,
  Store,
  Trash2,
  UserCheck,
} from 'lucide-react';
import {
  formatFriendlyDatabaseError,
  getRememberMePreference,
  getSupabaseClientOrThrow,
  isSupabaseConfigured,
  setRememberMePreference,
  signInWithGoogleSupabase,
} from '../lib/supabase';
import { compressImageFileToBase64 } from '../lib/formatters';
import {
  fetchApkDistributionInfo,
  type ApkDistributionInfo,
} from '../lib/midtransClient';
import { acceptStaffInvite, createInitialStore } from '../lib/storeRepository';
import {
  BRAND_PALETTES,
  BUSINESS_TYPE_CHOICES,
  type StaffInvite,
  type StoreLogoIconKey,
  type StoreThemePaletteKey,
} from '../types/models';
import {
  DynamicStoreLogo,
  renderStoreIconGlyph,
  STORE_ICON_OPTIONS,
} from '../components/DynamicStoreLogo';

interface AuthLoginViewProps {
  offlineWarning?: string;
  onNotify: (type: 'success' | 'error' | 'info', message: string) => void;
}

export const AuthLoginView: React.FC<AuthLoginViewProps> = ({
  offlineWarning,
  onNotify,
}) => {
  const [rememberMe, setRememberMe] = useState(() => getRememberMePreference());
  const [signingIn, setSigningIn] = useState(false);
  const [authTab, setAuthTab] = useState<'GOOGLE' | 'EMAIL'>('GOOGLE');
  const [emailMode, setEmailMode] = useState<'LOGIN' | 'REGISTER'>('LOGIN');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [apkInfo, setApkInfo] = useState<ApkDistributionInfo | null>(null);

  const isNativeApk = Capacitor.isNativePlatform();

  useEffect(() => {
    if (!isNativeApk) {
      fetchApkDistributionInfo().then(setApkInfo);
    }
  }, [isNativeApk]);

  const handleGoogleAuth = async (intent: 'LOGIN' | 'REGISTER') => {
    if (!isSupabaseConfigured) {
      onNotify(
        'error',
        'Lengkapi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY pada file .env terlebih dahulu.'
      );
      return;
    }
    setSigningIn(true);
    try {
      setRememberMePreference(rememberMe);
      await signInWithGoogleSupabase();
      if (isNativeApk) {
        onNotify(
          'info',
          intent === 'REGISTER'
            ? 'Selesaikan login Google di browser, lalu aplikasi akan terbuka otomatis.'
            : 'Membuka login Google...'
        );
      }
    } catch (err) {
      onNotify('error', formatFriendlyDatabaseError(err));
    } finally {
      setSigningIn(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSupabaseConfigured) {
      onNotify(
        'error',
        'Lengkapi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY pada file .env terlebih dahulu.'
      );
      return;
    }
    if (!email.trim() || password.length < 6) {
      onNotify('error', 'Masukkan email yang valid dan kata sandi minimal 6 karakter.');
      return;
    }
    setSigningIn(true);
    try {
      setRememberMePreference(rememberMe);
      const client = getSupabaseClientOrThrow();
      if (emailMode === 'REGISTER') {
        const { data, error } = await client.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              full_name: fullName.trim(),
            },
          },
        });
        if (error) throw error;
        if (data.session) {
          onNotify('success', 'Akun berhasil dibuat. Lanjutkan pengaturan toko.');
        } else {
          onNotify(
            'info',
            'Akun dibuat! Cek kotak masuk email Anda untuk konfirmasi sebelum masuk (atau matikan Confirm Email di Supabase Auth).'
          );
        }
      } else {
        const { error } = await client.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        onNotify('success', 'Berhasil masuk ke akun Anda.');
      }
    } catch (err) {
      onNotify('error', formatFriendlyDatabaseError(err));
    } finally {
      setSigningIn(false);
    }
  };

  const formatBytesToMb = (bytes: number) =>
    bytes > 0 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : 'Siap unduh';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md space-y-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
          <div
            className="px-6 py-7 text-white space-y-3"
            style={{
              background: 'linear-gradient(135deg, #052e16 0%, #14532d 60%, #16a34a 100%)',
            }}
          >
            <div className="w-12 h-12 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center">
              <Store className="w-6 h-6 text-white" />
            </div>
            <div className="space-y-1">
              <h1 className="text-2xl font-bold tracking-tight">KASIR UMKM</h1>
              <p className="text-sm text-emerald-100 leading-relaxed">
                Aplikasi kasir modern untuk warung, toko kecil, kafe &amp; usaha perorangan. Tanpa syarat dokumen izin usaha.
              </p>
            </div>
          </div>

          <div className="p-6 space-y-5">
            {!isSupabaseConfigured ? (
              <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 space-y-1.5 text-xs text-amber-900 dark:text-amber-200">
                <div className="flex items-center gap-2 font-semibold">
                  <Database className="w-4 h-4 shrink-0" />
                  <span>Konfigurasi Supabase Diperlukan</span>
                </div>
                <p className="leading-relaxed">
                  Isi <code className="font-mono font-semibold">VITE_SUPABASE_URL</code> dan{' '}
                  <code className="font-mono font-semibold">VITE_SUPABASE_ANON_KEY</code> pada file{' '}
                  <code className="font-mono">.env</code> lalu jalankan SQL migration{' '}
                  <code className="font-mono">supabase/migrations/001_kasir_umkm_schema.sql</code> di Supabase SQL Editor.
                </p>
              </div>
            ) : (
              offlineWarning && (
                <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-200">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{offlineWarning}</span>
                </div>
              )
            )}

            <div className="grid grid-cols-2 rounded-xl border border-slate-200 dark:border-slate-700 p-1 bg-slate-50 dark:bg-slate-800/70">
              <button
                type="button"
                onClick={() => setAuthTab('GOOGLE')}
                className={`py-2 rounded-lg text-xs font-semibold transition-colors ${
                  authTab === 'GOOGLE'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                Akun Google
              </button>
              <button
                type="button"
                onClick={() => setAuthTab('EMAIL')}
                className={`py-2 rounded-lg text-xs font-semibold transition-colors ${
                  authTab === 'EMAIL'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                Email &amp; Sandi
              </button>
            </div>

            {authTab === 'GOOGLE' ? (
              <div className="space-y-3">
                <div className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Akun baru otomatis dibuat &amp; langsung isi nama toko</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Tidak perlu NIB, SIUP, NPWP, atau persetujuan admin</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Data tersimpan aman &amp; sinkron antar perangkat</span>
                  </div>
                </div>

                <label className="flex items-center gap-2.5 text-sm text-slate-700 dark:text-slate-300 cursor-pointer select-none pt-1">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
                  />
                  <span>Tetap masuk pada perangkat ini</span>
                </label>

                <button
                  type="button"
                  onClick={() => void handleGoogleAuth('LOGIN')}
                  disabled={signingIn}
                  className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-semibold text-sm transition-colors disabled:opacity-60 whitespace-nowrap"
                >
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="#EA4335"
                      d="M12 10.2v3.9h5.4c-.2 1.2-1.4 3.6-5.4 3.6-3.2 0-5.9-2.7-5.9-6s2.7-6 5.9-6c1.8 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.2 14.6 2.3 12 2.3 6.6 2.3 2.3 6.6 2.3 12s4.3 9.7 9.7 9.7c5.6 0 9.3-3.9 9.3-9.5 0-.6-.1-1.1-.2-1.6H12z"
                    />
                  </svg>
                  {signingIn ? 'Menghubungkan Google...' : 'Login dengan Google'}
                </button>

                <button
                  type="button"
                  onClick={() => void handleGoogleAuth('REGISTER')}
                  disabled={signingIn}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-emerald-700/40 dark:border-emerald-500/40 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 font-semibold text-sm transition-colors disabled:opacity-60 whitespace-nowrap"
                >
                  Daftar Toko Baru dengan Google
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <form onSubmit={(e) => void handleEmailAuth(e)} className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-700 dark:text-slate-200">
                    {emailMode === 'LOGIN' ? 'Masuk Akun Email' : 'Daftar Akun Email Baru'}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setEmailMode((m) => (m === 'LOGIN' ? 'REGISTER' : 'LOGIN'))
                    }
                    className="font-semibold text-emerald-700 dark:text-emerald-400 hover:underline"
                  >
                    {emailMode === 'LOGIN' ? 'Buat akun baru' : 'Sudah punya akun? Masuk'}
                  </button>
                </div>

                {emailMode === 'REGISTER' && (
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Nama Lengkap Pemilik"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                  />
                )}

                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Alamat Email"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                />

                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Kata Sandi (minimal 6 karakter)"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                />

                <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="rounded border-slate-300 text-emerald-700"
                  />
                  Tetap masuk pada perangkat ini
                </label>

                <button
                  type="submit"
                  disabled={signingIn}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold transition-colors disabled:opacity-60"
                >
                  <Mail className="w-4 h-4" />
                  {signingIn
                    ? 'Memproses...'
                    : emailMode === 'LOGIN'
                      ? 'Masuk dengan Email'
                      : 'Daftar & Lanjut Atur Toko'}
                </button>
              </form>
            )}

            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Terhubung langsung ke Supabase Auth &amp; PostgreSQL</span>
            </div>
          </div>
        </div>

        {!isNativeApk && apkInfo?.available && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                    Install Aplikasi Android (.apk)
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    v{apkInfo.versionName} · {apkInfo.minAndroid} ·{' '}
                    {formatBytesToMb(apkInfo.sizeBytes)}
                  </p>
                </div>
              </div>

              <a
                href={apkInfo.downloadUrl}
                download={apkInfo.filename}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                Unduh APK
              </a>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              Unduh langsung lewat browser HP tanpa kabel USB, ketuk file APK hasil unduhan, izinkan instalasi dari sumber ini, lalu buka aplikasi &amp; login Google.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

interface StoreOnboardingViewProps {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  pendingInvites: StaffInvite[];
  isAddingAnotherStore?: boolean;
  onCancelAddingStore?: () => void;
  onSignOut: () => void;
  onNotify: (type: 'success' | 'error' | 'info', message: string) => void;
}

export const StoreOnboardingView: React.FC<StoreOnboardingViewProps> = ({
  uid,
  email,
  displayName,
  photoURL,
  pendingInvites,
  isAddingAnotherStore = false,
  onCancelAddingStore,
  onSignOut,
  onNotify,
}) => {
  const [storeName, setStoreName] = useState('');
  const [businessType, setBusinessType] = useState(BUSINESS_TYPE_CHOICES[0]);
  const [ownerName, setOwnerName] = useState(displayName || '');
  const [whatsapp, setWhatsapp] = useState('');
  const [address, setAddress] = useState('');
  const [description, setDescription] = useState('');
  const [logoIconKey, setLogoIconKey] = useState<StoreLogoIconKey>('STORE');
  const [themePaletteKey, setThemePaletteKey] = useState<StoreThemePaletteKey>('EMERALD');
  const [logoBase64, setLogoBase64] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  const handleUploadLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const b64 = await compressImageFileToBase64(file, 480, 120000);
      setLogoBase64(b64);
      onNotify('success', 'Logo toko berhasil diunggah.');
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'Gagal memproses logo.');
    }
  };

  const handleAcceptInvite = async (invite: StaffInvite) => {
    setAcceptingId(invite.id);
    try {
      await acceptStaffInvite({
        uid,
        email,
        displayName: displayName || invite.staffName,
        invite,
      });
      onNotify('success', `Berhasil bergabung sebagai Kasir di ${invite.storeName}.`);
    } catch (err) {
      onNotify('error', formatFriendlyDatabaseError(err));
    } finally {
      setAcceptingId(null);
    }
  };

  const handleCreateStore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeName.trim() || !businessType.trim() || !address.trim() || !whatsapp.trim()) {
      onNotify(
        'error',
        'Nama toko, jenis usaha, alamat toko, dan nomor WhatsApp wajib diisi.'
      );
      return;
    }
    setSubmitting(true);
    try {
      await createInitialStore({
        uid,
        email,
        ownerName: ownerName.trim() || displayName || 'Pemilik Toko',
        storeName: storeName.trim(),
        businessType: businessType.trim(),
        address: address.trim(),
        whatsapp: whatsapp.trim(),
        description,
        logoIconKey,
        themePaletteKey,
        logoBase64,
      });
      onNotify('success', `Toko "${storeName.trim()}" siap digunakan!`);
      if (onCancelAddingStore) onCancelAddingStore();
    } catch (err) {
      onNotify('error', formatFriendlyDatabaseError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-8 px-4 sm:px-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl px-5 py-4">
          <div className="flex items-center gap-3 min-w-0">
            {photoURL && (
              <img
                src={photoURL}
                alt={displayName || 'Profil'}
                className="w-10 h-10 rounded-full border border-slate-200 dark:border-slate-700 object-cover shrink-0"
              />
            )}
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Terhubung sebagai Pemilik Usaha
              </p>
              <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                {displayName || 'Pengguna'} · {email}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isAddingAnotherStore && onCancelAddingStore && (
              <button
                type="button"
                onClick={onCancelAddingStore}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Kembali
              </button>
            )}
            <button
              type="button"
              onClick={onSignOut}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
            >
              <LogOut className="w-3.5 h-3.5" />
              Keluar
            </button>
          </div>
        </div>

        {!isAddingAnotherStore && pendingInvites.length > 0 && (
          <div className="bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-900/60 rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center">
                <UserCheck className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                  Undangan Kasir Tersedia
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Anda diundang untuk bergabung sebagai staf kasir toko berikut.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {pendingInvites.map((inv) => (
                <div
                  key={inv.id}
                  className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      {inv.storeName}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Peran: Kasir · Akses:{' '}
                      {[
                        inv.canAccessKasir && 'Kasir',
                        inv.canManageProducts && 'Produk',
                        inv.canViewTransactions && 'Riwayat',
                        inv.canViewReports && 'Laporan',
                      ]
                        .filter(Boolean)
                        .join(', ') || 'Kasir'}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={acceptingId === inv.id}
                    onClick={() => void handleAcceptInvite(inv)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold transition-colors whitespace-nowrap disabled:opacity-60"
                  >
                    {acceptingId === inv.id ? 'Memproses...' : 'Terima Undangan'}
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <form
          onSubmit={(e) => void handleCreateStore(e)}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-6"
        >
          <div className="space-y-1">
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">
              {isAddingAnotherStore
                ? 'Tambah Toko / Cabang Baru'
                : 'Pengaturan Toko Pertama Kali'}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Lengkapi identitas toko Anda untuk langsung masuk ke dashboard kasir. Tidak memerlukan NIB, SIUP, atau NPWP.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
            <DynamicStoreLogo
              storeName={storeName || 'Toko UMKM'}
              logoIconKey={logoIconKey}
              logoBase64={logoBase64}
              themePaletteKey={themePaletteKey}
              size="xl"
            />
            <div className="flex-1 space-y-2.5">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  {storeName.trim() || 'Nama Toko Anda'}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {businessType} · Pratinjau logo &amp; warna tema
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 cursor-pointer">
                  <ImagePlus className="w-3.5 h-3.5" />
                  Unggah Logo (Opsional)
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
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Hapus Logo
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Nama Toko *
              </label>
              <input
                type="text"
                required
                maxLength={60}
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                placeholder="Contoh: Warung Kopi Nusantara"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Jenis Usaha *
              </label>
              <select
                required
                value={businessType}
                onChange={(e) => setBusinessType(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
              >
                {BUSINESS_TYPE_CHOICES.map((bt) => (
                  <option key={bt} value={bt}>
                    {bt}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Nomor WhatsApp Toko *
              </label>
              <input
                type="tel"
                required
                maxLength={40}
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                placeholder="0812xxxxxxxx"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Alamat Toko *
              </label>
              <input
                type="text"
                required
                maxLength={240}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Jl. Merdeka No. 12, Bandung"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Nama Pemilik Toko (Opsional)
              </label>
              <input
                type="text"
                maxLength={100}
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder="Nama pemilik usaha"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Deskripsi Usaha (Opsional)
              </label>
              <input
                type="text"
                maxLength={300}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Minuman kopi kekinian & jajanan lokal"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Ikon Toko (jika tanpa logo foto)
              </label>
              <div className="grid grid-cols-3 gap-2">
                {STORE_ICON_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setLogoIconKey(opt.key)}
                    className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border text-xs font-medium transition-colors ${
                      logoIconKey === opt.key
                        ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    {renderStoreIconGlyph(opt.key, 'w-4 h-4')}
                    <span>{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Palet Warna Toko
              </label>
              <div className="grid grid-cols-1 gap-2">
                {Object.values(BRAND_PALETTES).map((pal) => (
                  <button
                    key={pal.key}
                    type="button"
                    onClick={() => setThemePaletteKey(pal.key)}
                    className={`flex items-center justify-between px-3 py-2 rounded-xl border text-xs font-medium transition-colors ${
                      themePaletteKey === pal.key
                        ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 text-slate-900 dark:text-white'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span>{pal.label}</span>
                    <span className="flex items-center gap-1">
                      <span
                        className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: pal.primary }}
                      />
                      <span
                        className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: pal.secondary }}
                      />
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-bold tracking-wide transition-colors disabled:opacity-60 whitespace-nowrap"
          >
            {submitting
              ? 'Menyimpan Pengaturan Toko...'
              : 'SIMPAN PENGATURAN & MASUK DASHBOARD'}
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};

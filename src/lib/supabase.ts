import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

export const ANDROID_OAUTH_REDIRECT_URL = 'com.aistudio.kasirumkm.qzvtmk://login-callback';

const rawSupabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '');
const rawSupabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

export function isValidSupabaseConfig(url: string, key: string): boolean {
  if (!url || !key) return false;
  if (url.includes('YOUR_PROJECT') || key.includes('YOUR_')) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export const isSupabaseConfigured = isValidSupabaseConfig(rawSupabaseUrl, rawSupabaseAnonKey);

const REMEMBER_ME_PREF_KEY = 'kasir_umkm_remember_me';

export function getRememberMePreference(): boolean {
  try {
    return localStorage.getItem(REMEMBER_ME_PREF_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function setRememberMePreference(remember: boolean): void {
  try {
    localStorage.setItem(REMEMBER_ME_PREF_KEY, String(remember));
  } catch {
    // Ignore storage error
  }
}

const adaptiveAuthStorage = {
  getItem(key: string): string | null {
    try {
      return localStorage.getItem(key) ?? sessionStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string): void {
    try {
      if (Capacitor.isNativePlatform() || getRememberMePreference()) {
        localStorage.setItem(key, value);
        sessionStorage.removeItem(key);
      } else {
        sessionStorage.setItem(key, value);
        localStorage.removeItem(key);
      }
    } catch {
      // Ignore storage error
    }
  },
  removeItem(key: string): void {
    try {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    } catch {
      // Ignore storage error
    }
  },
};

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(rawSupabaseUrl, rawSupabaseAnonKey, {
      auth: {
        flowType: 'pkce',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: !Capacitor.isNativePlatform(),
        storage: adaptiveAuthStorage,
      },
    })
  : null;

export function getSupabaseClientOrThrow(): SupabaseClient {
  if (!supabase) {
    throw new Error(
      'Konfigurasi Supabase belum diisi. Lengkapi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY di file .env.'
    );
  }
  return supabase;
}

export function getOAuthRedirectUrl(): string {
  if (Capacitor.isNativePlatform()) {
    return ANDROID_OAUTH_REDIRECT_URL;
  }
  return `${window.location.origin}/`;
}

export async function signInWithGoogleSupabase(): Promise<void> {
  const client = getSupabaseClientOrThrow();
  const redirectTo = getOAuthRedirectUrl();

  if (Capacitor.isNativePlatform()) {
    const { data, error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        skipBrowserRedirect: true,
        queryParams: {
          prompt: 'select_account',
        },
      },
    });
    if (error) throw error;
    if (!data?.url) {
      throw new Error('Supabase tidak mengembalikan URL login Google.');
    }
    await Browser.open({ url: data.url });
    return;
  }

  const { error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      queryParams: {
        prompt: 'select_account',
      },
    },
  });
  if (error) throw error;
}

export function registerAndroidDeepLinkAuthListener(
  onNotify?: (type: 'success' | 'error' | 'info', message: string) => void
): () => void {
  if (!Capacitor.isNativePlatform() || !supabase) {
    return () => undefined;
  }

  const listenerPromise = CapacitorApp.addListener('appUrlOpen', async ({ url }) => {
    if (!url || !url.startsWith(ANDROID_OAUTH_REDIRECT_URL)) return;

    await Browser.close().catch(() => undefined);

    try {
      const parsed = new URL(url);
      const code = parsed.searchParams.get('code');
      const errorDesc =
        parsed.searchParams.get('error_description') || parsed.searchParams.get('error');

      if (errorDesc) {
        onNotify?.('error', decodeURIComponent(errorDesc));
        return;
      }

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) throw error;
        onNotify?.('success', 'Berhasil masuk dengan akun Google.');
        return;
      }

      if (parsed.hash) {
        const hashParams = new URLSearchParams(parsed.hash.replace(/^#/, ''));
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');
        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;
          onNotify?.('success', 'Berhasil masuk dengan akun Google.');
        }
      }
    } catch (err) {
      onNotify?.('error', formatFriendlyDatabaseError(err));
    }
  });

  return () => {
    void listenerPromise.then((handle) => handle.remove());
  };
}

export async function testSupabaseConnection(): Promise<{
  ok: boolean;
  offlineMessage?: string;
}> {
  if (!isSupabaseConfigured || !supabase) {
    return {
      ok: false,
      offlineMessage:
        'VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY belum diisi pada file .env.',
    };
  }
  try {
    const { error } = await supabase.auth.getSession();
    if (error) {
      return { ok: false, offlineMessage: error.message };
    }
    return { ok: true };
  } catch {
    return {
      ok: false,
      offlineMessage:
        'Tidak dapat terhubung ke server Supabase. Periksa URL project atau koneksi internet Anda.',
    };
  }
}

export function getUserDisplayName(user: User | null): string {
  if (!user) return '';
  const meta = (user.user_metadata || {}) as Record<string, unknown>;
  return (
    String(meta.full_name || meta.name || '').trim() ||
    (user.email ? user.email.split('@')[0] : 'Pengguna')
  );
}

export function getUserAvatarUrl(user: User | null): string | undefined {
  if (!user) return undefined;
  const meta = (user.user_metadata || {}) as Record<string, unknown>;
  const raw = String(meta.avatar_url || meta.picture || '').trim();
  return raw || undefined;
}

export function formatFriendlyDatabaseError(err: unknown): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === 'object' && err !== null && 'message' in err
        ? String((err as { message: unknown }).message)
        : String(err);

  const lower = raw.toLowerCase();
  if (lower.includes('invalid login credentials')) {
    return 'Email atau kata sandi tidak cocok.';
  }
  if (lower.includes('email not confirmed')) {
    return 'Email belum dikonfirmasi. Cek kotak masuk Anda atau nonaktifkan konfirmasi email di Supabase Auth.';
  }
  if (lower.includes('user already registered')) {
    return 'Email sudah terdaftar. Silakan masuk atau gunakan Login dengan Google.';
  }
  if (lower.includes('row-level security') || lower.includes('permission denied')) {
    return 'Akses ditolak oleh kebijakan keamanan RLS. Pastikan Anda masuk sebagai pemilik atau kasir aktif toko.';
  }
  if (lower.includes('jwt') && lower.includes('expired')) {
    return 'Sesi login berakhir. Silakan masuk kembali.';
  }
  if (lower.includes('failed to fetch') || lower.includes('networkerror')) {
    return 'Koneksi ke Supabase gagal. Periksa koneksi internet dan VITE_SUPABASE_URL Anda.';
  }
  return raw || 'Terjadi kesalahan pada koneksi database Supabase.';
}

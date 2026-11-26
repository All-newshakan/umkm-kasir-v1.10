import { Capacitor } from '@capacitor/core';
import type {
  CartLine,
  MidtransChargeResult,
  MidtransConfigStatus,
  PaymentMethod,
} from '../types/models';
import { getCartLineTotals } from '../types/models';
import { supabase } from './supabase';


async function getAuthenticatedRequestHeaders(): Promise<Record<string, string>> {
  if (!supabase) throw new Error('Supabase belum dikonfigurasi. Silakan masuk kembali.');
  const { data, error } = await supabase.auth.getSession();
  const session = data.session;
  if (error || !session?.access_token || !session.user.id) {
    throw new Error('Sesi login tidak valid. Silakan masuk kembali.');
  }
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` };
}

export interface ApkDistributionInfo {
  available: boolean;
  filename: string;
  sizeBytes: number;
  minAndroid: string;
  versionName: string;
  downloadUrl: string;
}

export function isLocalOrInsecureHost(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();
    const isLocalHost =
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host.endsWith('.local');
    return isLocalHost || parsed.protocol !== 'https:';
  } catch {
    return true;
  }
}

/**
 * Backend aplikasi kasir sudah terhubung langsung ke Supabase (Auth + PostgreSQL).
 * Proxy API backend Express bersifat OPSIONAL dan hanya diperlukan bila Anda mengaktifkan
 * pembayaran Midtrans dinamis (Server Key) melalui VITE_MIDTRANS_PROXY_URL.
 */
export function getOptionalMidtransProxyUrl(): string | null {
  const configured = (import.meta.env.VITE_MIDTRANS_PROXY_URL || '').trim().replace(/\/+$/, '');
  if (Capacitor.isNativePlatform()) {
    if (configured && !isLocalOrInsecureHost(configured)) {
      return configured;
    }
    return null;
  }
  return configured || '';
}

export async function fetchApkDistributionInfo(): Promise<ApkDistributionInfo | null> {
  if (Capacitor.isNativePlatform()) return null;
  try {
    const res = await fetch('/api/app/apk-info');
    if (!res.ok) return null;
    return (await res.json()) as ApkDistributionInfo;
  } catch {
    return null;
  }
}

export async function fetchMidtransConfigStatus(): Promise<MidtransConfigStatus> {
  const baseUrl = getOptionalMidtransProxyUrl();
  if (baseUrl === null) {
    return { configured: false, isProduction: false };
  }
  try {
    const res = await fetch(`${baseUrl}/api/midtrans/config-status`);
    if (!res.ok) {
      return { configured: false, isProduction: false };
    }
    return (await res.json()) as MidtransConfigStatus;
  } catch {
    return { configured: false, isProduction: false };
  }
}

export async function createMidtransCharge(params: {
  orderId: string;
  grossAmount: number;
  method: PaymentMethod;
  subChannel: string;
  customerName: string;
  cartLines: CartLine[];
}): Promise<MidtransChargeResult> {
  const baseUrl = getOptionalMidtransProxyUrl();
  if (baseUrl === null) {
    throw new Error(
      'Proxy Midtrans opsional belum dikonfigurasi untuk APK (VITE_MIDTRANS_PROXY_URL). Gunakan metode Tunai atau QRIS Manual.'
    );
  }
  const headers = await getAuthenticatedRequestHeaders();
  const { data: sessionData } = await supabase!.auth.getSession();
  const orderId = `POS-${sessionData.session!.user.id.slice(0, 8)}-${params.orderId.replace(/^POS-/, '')}`.slice(0, 50);
  const res = await fetch(`${baseUrl}/api/midtrans/charge`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      orderId,
      grossAmount: Math.round(params.grossAmount),
      method: params.method,
      subChannel: params.subChannel,
      customerName: params.customerName || 'Pelanggan Toko',
      items: params.cartLines.map((line) => {
        const totals = getCartLineTotals(line);
        const unitPrice = Math.max(1, Math.round(totals.netTotal / Math.max(1, line.quantity)));
        return {
          id: line.product.id,
          name: line.product.name.slice(0, 48),
          price: unitPrice,
          quantity: line.quantity,
        };
      }),
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Gagal membuat transaksi Midtrans.');
  }
  return data as MidtransChargeResult;
}

export async function checkMidtransStatus(orderId: string): Promise<{
  orderId: string;
  transactionStatus: string;
  fraudStatus: string;
  statusMessage: string;
}> {
  const baseUrl = getOptionalMidtransProxyUrl();
  if (baseUrl === null) {
    throw new Error('Proxy Midtrans opsional belum dikonfigurasi.');
  }
  const headers = await getAuthenticatedRequestHeaders();
  const res = await fetch(`${baseUrl}/api/midtrans/status/${encodeURIComponent(orderId)}`, { headers });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Gagal memeriksa status Midtrans.');
  }
  return data;
}

export async function cancelMidtransOrder(orderId: string): Promise<void> {
  const baseUrl = getOptionalMidtransProxyUrl();
  if (!orderId || baseUrl === null) return;
  try {
    const headers = await getAuthenticatedRequestHeaders();
    await fetch(`${baseUrl}/api/midtrans/cancel/${encodeURIComponent(orderId)}`, {
      method: 'POST',
      headers,
    });
  } catch {
    // Ignore cancel network issues
  }
}

import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const rawEnvPort = Number(process.env.PORT || 0);
const nginxPort = Number(process.env.NGINX_PORT || 0);
const defaultAppPort = Number(process.env.DEFAULT_APP_PORT || 3000);
const PORT = rawEnvPort && rawEnvPort !== nginxPort ? rawEnvPort : defaultAppPort;

app.use(express.json({ limit: '1mb' }));

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (
    origin &&
    (origin === 'https://localhost' ||
      origin === 'http://localhost' ||
      origin === 'capacitor://localhost' ||
      origin.endsWith('.run.app'))
  ) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  }
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

function resolveApkPath(): string | null {
  const candidates = [
    path.resolve(__dirname, 'downloads', 'kasir-umkm-release.apk'),
    path.resolve(__dirname, 'public', 'downloads', 'kasir-umkm-release.apk'),
    path.resolve(__dirname, 'dist', 'downloads', 'kasir-umkm-release.apk'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

app.get('/api/app/apk-info', (_req, res) => {
  const apkPath = resolveApkPath();
  if (!apkPath) {
    res.json({
      available: false,
      filename: 'kasir-umkm-release.apk',
      sizeBytes: 0,
      minAndroid: 'Android 8.0+ (API 26)',
      versionName: '1.1.0',
      downloadUrl: '/downloads/kasir-umkm-release.apk',
    });
    return;
  }
  const stat = fs.statSync(apkPath);
  res.json({
    available: true,
    filename: 'kasir-umkm-release.apk',
    sizeBytes: stat.size,
    minAndroid: 'Android 8.0+ (API 26)',
    versionName: '1.1.0',
    downloadUrl: '/downloads/kasir-umkm-release.apk',
  });
});

app.get('/downloads/kasir-umkm-release.apk', (_req, res) => {
  const apkPath = resolveApkPath();
  if (!apkPath) {
    res.status(404).json({ error: 'File APK release belum tersedia.' });
    return;
  }
  res.setHeader('Content-Type', 'application/vnd.android.package-archive');
  res.setHeader('Content-Disposition', 'attachment; filename="kasir-umkm-release.apk"');
  res.sendFile(apkPath);
});

function getMidtransConfig() {
  const serverKey = (process.env.MIDTRANS_SERVER_KEY || '').trim();
  const isProduction = (process.env.MIDTRANS_IS_PRODUCTION || '').trim().toLowerCase() === 'true';
  const baseUrl = isProduction ? 'https://api.midtrans.com' : 'https://api.sandbox.midtrans.com';
  return { serverKey, isProduction, baseUrl };
}

function getAuthHeader(serverKey: string) {
  return `Basic ${Buffer.from(`${serverKey}:`).toString('base64')}`;
}

async function getAuthenticatedUserId(req: express.Request): Promise<string | null> {
  const authorization = req.headers.authorization || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  const supabaseUrl = (process.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const anonKey = (process.env.VITE_SUPABASE_ANON_KEY || '').trim();
  if (!token || !supabaseUrl || !anonKey) return null;
  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return null;
    const user = (await response.json()) as { id?: string };
    return typeof user.id === 'string' && user.id ? user.id : null;
  } catch { return null; }
}

function isOrderOwnedByUser(orderId: string, userId: string): boolean {
  return orderId.startsWith(`POS-${userId.slice(0, 8)}-`);
}

app.get('/api/health', (_req, res) => {
  const supabaseUrl = (process.env.VITE_SUPABASE_URL || '').trim();
  const supabaseAnonKey = (process.env.VITE_SUPABASE_ANON_KEY || '').trim();
  const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
  const { serverKey, isProduction } = getMidtransConfig();
  res.json({
    ok: true,
    service: 'kasir-umkm-server',
    port: PORT,
    database: {
      provider: 'supabase-postgresql',
      configured: supabaseConfigured,
    },
    midtrans: {
      configured: serverKey.length > 0,
      isProduction,
    },
  });
});

app.get('/api/midtrans/config-status', (_req, res) => {
  const { serverKey, isProduction } = getMidtransConfig();
  res.json({
    configured: serverKey.length > 0,
    isProduction,
  });
});

interface ChargeRequestBody {
  orderId?: string;
  grossAmount?: number;
  method?: 'QRIS' | 'VIRTUAL_ACCOUNT' | 'EWALLET' | 'TRANSFER';
  subChannel?: string;
  customerName?: string;
  items?: Array<{
    id: string;
    name: string;
    price: number;
    quantity: number;
  }>;
}

app.post('/api/midtrans/charge', async (req, res) => {
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'Sesi login tidak valid. Silakan masuk kembali.' });
      return;
    }
    const { serverKey, baseUrl, isProduction } = getMidtransConfig();
    if (!serverKey) {
      res.status(400).json({
        error: 'Midtrans Server Key belum dikonfigurasi pada server (.env / MIDTRANS_SERVER_KEY).',
      });
      return;
    }

    const body = (req.body || {}) as ChargeRequestBody;
    const grossAmount = Math.round(Number(body.grossAmount || 0));
    const orderId = (body.orderId || '').trim().slice(0, 50);
    if (!isOrderOwnedByUser(orderId, userId)) {
      res.status(403).json({ error: 'ID transaksi tidak sesuai dengan akun yang sedang login.' });
      return;
    }
    const method = body.method || 'QRIS';
    const subChannel = (body.subChannel || '').trim().toLowerCase();
    const customerName = (body.customerName || 'Pelanggan Toko').trim().slice(0, 60) || 'Pelanggan Toko';

    if (!Number.isSafeInteger(grossAmount) || grossAmount <= 0 || grossAmount > 1000000000) {
      res.status(400).json({ error: 'Nominal pembayaran harus lebih dari Rp 0.' });
      return;
    }

    const payload: Record<string, unknown> = {
      transaction_details: {
        order_id: orderId,
        gross_amount: grossAmount,
      },
      customer_details: {
        first_name: customerName,
      },
    };

    if (Array.isArray(body.items) && body.items.length > 0) {
      const sanitizedItems = body.items.map((item) => ({
        id: String(item.id || 'item').slice(0, 50),
        price: Math.max(0, Math.round(Number(item.price || 0))),
        quantity: Math.max(1, Math.round(Number(item.quantity || 1))),
        name: String(item.name || 'Produk').slice(0, 50),
      }));
      const itemSum = sanitizedItems.reduce((acc, item) => acc + item.price * item.quantity, 0);
      if (itemSum === grossAmount) {
        payload.item_details = sanitizedItems;
      }
    }

    if (method === 'QRIS') {
      payload.payment_type = 'qris';
      payload.qris = { acquirer: 'gopay' };
    } else if (method === 'VIRTUAL_ACCOUNT' || method === 'TRANSFER') {
      const bank = subChannel || 'bca';
      if (bank === 'permata') {
        payload.payment_type = 'permata';
      } else {
        payload.payment_type = 'bank_transfer';
        payload.bank_transfer = { bank };
      }
    } else if (method === 'EWALLET') {
      const wallet = subChannel || 'gopay';
      if (wallet === 'shopeepay') {
        payload.payment_type = 'shopeepay';
        payload.shopeepay = {
          callback_url: 'https://kasirumkm.app/payment-callback',
        };
      } else {
        payload.payment_type = 'gopay';
        payload.gopay = {
          enable_callback: true,
          callback_url: 'https://kasirumkm.app/payment-callback',
        };
      }
    } else {
      res.status(400).json({ error: `Metode ${method} tidak didukung Midtrans.` });
      return;
    }

    const upstream = await fetch(`${baseUrl}/v2/charge`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: getAuthHeader(serverKey),
      },
      body: JSON.stringify(payload),
    });

    const data = (await upstream.json()) as Record<string, unknown>;
    const statusCode = String(data.status_code || '');

    if (!upstream.ok || (statusCode && !['200', '201', '202'].includes(statusCode))) {
      const msg =
        String(data.status_message || '') ||
        (Array.isArray(data.validation_messages) ? data.validation_messages.join(', ') : '') ||
        `Gagal membuat tagihan Midtrans (HTTP ${upstream.status})`;
      res.status(upstream.ok ? 400 : upstream.status).json({ error: msg, raw: data });
      return;
    }

    const actions = Array.isArray(data.actions)
      ? (data.actions as Array<{ name?: string; url?: string }>)
      : [];
    const vaNumbers = Array.isArray(data.va_numbers)
      ? (data.va_numbers as Array<{ bank?: string; va_number?: string }>)
      : [];

    const qrActionUrl =
      actions.find((a) => a.name === 'generate-qr-code' || a.name === 'generate-qr-code-v2')?.url || '';
    const deeplinkUrl = actions.find((a) => a.name === 'deeplink-redirect')?.url || '';
    const vaObj = vaNumbers[0];
    const permataVa = typeof data.permata_va_number === 'string' ? data.permata_va_number : '';
    const resolvedVa = vaObj?.va_number || permataVa;
    const resolvedBank = (vaObj?.bank || (permataVa ? 'PERMATA' : subChannel || 'BANK')).toUpperCase();

    res.json({
      orderId: String(data.order_id || orderId),
      transactionId: String(data.transaction_id || ''),
      transactionStatus: String(data.transaction_status || 'pending'),
      fraudStatus: String(data.fraud_status || ''),
      grossAmount,
      qrString: typeof data.qr_string === 'string' ? data.qr_string : '',
      qrImageUrl: qrActionUrl,
      deeplinkUrl,
      vaNumber: resolvedVa,
      bankName: resolvedBank,
      expiryTime: String(data.expiry_time || ''),
      isProduction,
    });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Terjadi kesalahan saat menghubungi Midtrans.',
    });
  }
});

app.get('/api/midtrans/status/:orderId', async (req, res) => {
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'Sesi login tidak valid. Silakan masuk kembali.' });
      return;
    }
    if (!isOrderOwnedByUser(req.params.orderId, userId)) {
      res.status(403).json({ error: 'Anda tidak memiliki akses ke transaksi ini.' });
      return;
    }
    const { serverKey, baseUrl } = getMidtransConfig();
    if (!serverKey) {
      res.status(400).json({ error: 'Midtrans Server Key belum dikonfigurasi.' });
      return;
    }
    const orderId = encodeURIComponent(req.params.orderId);
    const upstream = await fetch(`${baseUrl}/v2/${orderId}/status`, {
      headers: {
        Accept: 'application/json',
        Authorization: getAuthHeader(serverKey),
      },
    });
    const data = (await upstream.json()) as Record<string, unknown>;
    if (!upstream.ok) {
      res.status(upstream.status).json({
        error: String(data.status_message || `HTTP ${upstream.status}`),
      });
      return;
    }
    res.json({
      orderId: String(data.order_id || req.params.orderId),
      transactionStatus: String(data.transaction_status || 'pending'),
      fraudStatus: String(data.fraud_status || ''),
      statusMessage: String(data.status_message || ''),
    });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Gagal memeriksa status pembayaran.',
    });
  }
});

app.post('/api/midtrans/cancel/:orderId', async (req, res) => {
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'Sesi login tidak valid. Silakan masuk kembali.' });
      return;
    }
    if (!isOrderOwnedByUser(req.params.orderId, userId)) {
      res.status(403).json({ error: 'Anda tidak memiliki akses ke transaksi ini.' });
      return;
    }
    const { serverKey, baseUrl } = getMidtransConfig();
    if (!serverKey) {
      res.json({ cancelled: false });
      return;
    }
    const orderId = encodeURIComponent(req.params.orderId);
    await fetch(`${baseUrl}/v2/${orderId}/cancel`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: getAuthHeader(serverKey),
      },
    });
    res.json({ cancelled: true });
  } catch {
    res.json({ cancelled: false });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`KASIR UMKM server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();

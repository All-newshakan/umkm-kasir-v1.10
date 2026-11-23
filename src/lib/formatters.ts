export function formatRupiah(amount: number): string {
  const rounded = Math.round(amount);
  const abs = Math.abs(rounded);
  const formatted = new Intl.NumberFormat('id-ID').format(abs);
  return rounded < 0 ? `-Rp ${formatted}` : `Rp ${formatted}`;
}

export function formatNumber(amount: number): string {
  return new Intl.NumberFormat('id-ID').format(Math.round(amount));
}

export function formatCompactRupiah(amount: number): string {
  const abs = Math.abs(amount);
  const prefix = amount < 0 ? '-' : '';
  if (abs >= 1_000_000_000) {
    return `${prefix}Rp ${(abs / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  }
  if (abs >= 1_000_000) {
    return `${prefix}Rp ${(abs / 1_000_000).toFixed(1).replace(/\.0$/, '')}jt`;
  }
  if (abs >= 1_000) {
    return `${prefix}Rp ${Math.round(abs / 1_000)}rb`;
  }
  return formatRupiah(amount);
}

export function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    const fn = (value as { toDate?: () => Date }).toDate;
    if (typeof fn === 'function') return fn();
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export function formatDateTime(date: Date | null | undefined): string {
  if (!date) return 'Baru saja';
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function formatDateOnly(date: Date | null | undefined): string {
  if (!date) return '-';
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function formatShortDate(date: Date): string {
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
  }).format(date);
}

export function formatDateInputValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatInvoiceTimestamp(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${y}${m}${d}-${hh}${mm}${ss}`;
}

export function generateStoreInitials(storeName: string): string {
  const cleaned = storeName.trim();
  if (!cleaned) return 'KU';
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0][0]}${words[1][0]}`.toUpperCase();
  }
  return cleaned.slice(0, 2).toUpperCase();
}

export function formatPhoneForWhatsApp(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('0')) return `62${digits.slice(1)}`;
  if (digits.startsWith('62')) return digits;
  return `62${digits}`;
}

export async function compressImageFileToBase64(
  file: File,
  maxDimension = 640,
  maxBase64Length = 145000
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca file gambar.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Format gambar tidak didukung.'));
      img.onload = () => {
        const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas tidak tersedia untuk memproses gambar.'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);

        let quality = 0.82;
        let dataUrl = canvas.toDataURL('image/jpeg', quality);
        let base64 = dataUrl.split(',')[1] || '';

        while (base64.length > maxBase64Length && quality > 0.3) {
          quality -= 0.12;
          dataUrl = canvas.toDataURL('image/jpeg', quality);
          base64 = dataUrl.split(',')[1] || '';
        }

        if (base64.length > maxBase64Length) {
          reject(new Error('Ukuran gambar terlalu besar setelah dikompresi (maks ~150KB).'));
          return;
        }
        resolve(base64);
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import type { PosTransaction, StoreProfile } from '../types/models';
import { formatDateTime, formatNumber, formatRupiah } from './formatters';

export interface ProductBreakdownRow {
  productName: string;
  categoryName: string;
  quantity: number;
  revenue: number;
  profit: number;
}

export function buildReceiptPlainText(store: StoreProfile, tx: PosTransaction): string {
  const lines: string[] = [];
  lines.push(`*${store.name.toUpperCase()}*`);
  if (store.address) lines.push(store.address);
  if (store.whatsapp) lines.push(`WA: ${store.whatsapp}`);
  lines.push('--------------------------------');
  lines.push(`No Struk : ${tx.invoiceNumber}`);
  lines.push(`Tanggal  : ${formatDateTime(tx.createdAt)}`);
  lines.push(`Kasir    : ${tx.cashierName}`);
  if (tx.customerName) lines.push(`Pelanggan: ${tx.customerName}`);
  if (tx.note) lines.push(`Catatan  : ${tx.note}`);
  lines.push('--------------------------------');
  tx.items.forEach((item) => {
    lines.push(`${item.productName}`);
    lines.push(
      `  ${item.quantity} ${item.unit} x ${formatRupiah(item.sellPrice)} = ${formatRupiah(item.lineTotal)}`
    );
    if ((item.discountAmount || 0) > 0) {
      lines.push(`  Diskon item: -${formatRupiah(item.discountAmount || 0)}`);
    }
  });
  lines.push('--------------------------------');
  lines.push(`Subtotal : ${formatRupiah(tx.subtotal)}`);
  if (tx.discountAmount > 0) {
    lines.push(`Diskon   : -${formatRupiah(tx.discountAmount)}`);
  }
  if (tx.taxAmount > 0) {
    lines.push(`Pajak    : ${formatRupiah(tx.taxAmount)}`);
  }
  lines.push(`*TOTAL   : ${formatRupiah(tx.totalAmount)}*`);
  lines.push(`Bayar (${tx.paymentMethod}): ${formatRupiah(tx.cashReceived)}`);
  if (tx.paymentMethod === 'TUNAI') {
    lines.push(`Kembali  : ${formatRupiah(tx.changeAmount)}`);
  }
  if ((tx.pointsEarned || 0) > 0 || (tx.pointsRedeemed || 0) > 0) {
    lines.push(
      `Poin     : +${tx.pointsEarned || 0} / -${tx.pointsRedeemed || 0} poin`
    );
  }
  lines.push('--------------------------------');
  lines.push(store.receiptFooter || 'Terima kasih telah berbelanja!');
  return lines.join('\n');
}

export async function shareReceiptViaWhatsApp(
  store: StoreProfile,
  tx: PosTransaction
): Promise<'shared' | 'whatsapp'> {
  const text = buildReceiptPlainText(store, tx);
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({
        title: `Struk ${tx.invoiceNumber} - ${store.name}`,
        text,
      });
      return 'shared';
    } catch {
      // User dismissed or unsupported, fall through to WhatsApp link
    }
  }
  const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  return 'whatsapp';
}

export function exportReceiptPdf(store: StoreProfile, tx: PosTransaction): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [80, Math.max(150, 105 + tx.items.length * 10)],
  });

  let y = 10;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(store.name.toUpperCase(), 40, y, { align: 'center' });
  y += 5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  if (store.address) {
    const addrLines = doc.splitTextToSize(store.address, 68);
    doc.text(addrLines, 40, y, { align: 'center' });
    y += addrLines.length * 3.5;
  }
  if (store.whatsapp) {
    doc.text(`Telp/WA: ${store.whatsapp}`, 40, y, { align: 'center' });
    y += 4;
  }

  doc.line(5, y, 75, y);
  y += 4;
  doc.text(`No: ${tx.invoiceNumber}`, 5, y);
  y += 4;
  doc.text(`Tgl: ${formatDateTime(tx.createdAt)}`, 5, y);
  y += 4;
  doc.text(`Kasir: ${tx.cashierName}`, 5, y);
  y += 4;
  if (tx.customerName) {
    doc.text(`Pelanggan: ${tx.customerName}`, 5, y);
    y += 4;
  }
  doc.line(5, y, 75, y);
  y += 4;

  tx.items.forEach((item) => {
    doc.setFont('helvetica', 'bold');
    doc.text(item.productName.slice(0, 38), 5, y);
    y += 3.5;
    doc.setFont('helvetica', 'normal');
    doc.text(`${item.quantity} ${item.unit} x ${formatRupiah(item.sellPrice)}`, 5, y);
    doc.text(formatRupiah(item.lineTotal), 75, y, { align: 'right' });
    y += 4.5;
  });

  doc.line(5, y, 75, y);
  y += 4;
  doc.text('Subtotal', 5, y);
  doc.text(formatRupiah(tx.subtotal), 75, y, { align: 'right' });
  y += 4;
  if (tx.discountAmount > 0) {
    doc.text('Diskon', 5, y);
    doc.text(`-${formatRupiah(tx.discountAmount)}`, 75, y, { align: 'right' });
    y += 4;
  }
  if (tx.taxAmount > 0) {
    doc.text('Pajak', 5, y);
    doc.text(formatRupiah(tx.taxAmount), 75, y, { align: 'right' });
    y += 4;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('TOTAL', 5, y);
  doc.text(formatRupiah(tx.totalAmount), 75, y, { align: 'right' });
  y += 5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Bayar (${tx.paymentMethod})`, 5, y);
  doc.text(formatRupiah(tx.cashReceived), 75, y, { align: 'right' });
  y += 4;
  if (tx.paymentMethod === 'TUNAI') {
    doc.text('Kembali', 5, y);
    doc.text(formatRupiah(tx.changeAmount), 75, y, { align: 'right' });
    y += 4;
  }

  doc.line(5, y, 75, y);
  y += 5;
  const footerLines = doc.splitTextToSize(
    store.receiptFooter || 'Terima kasih telah berbelanja!',
    68
  );
  doc.text(footerLines, 40, y, { align: 'center' });

  doc.save(`Struk-${tx.invoiceNumber}.pdf`);
}

export function exportSalesReportPdf(params: {
  store: StoreProfile;
  periodLabel: string;
  totalRevenue: number;
  totalProfit: number;
  totalCost: number;
  totalTransactions: number;
  totalItemsSold: number;
  productRows: ProductBreakdownRow[];
}): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  let y = 16;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(`Laporan Penjualan - ${params.store.name}`, 14, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Periode: ${params.periodLabel}`, 14, y);
  y += 4;
  doc.text(`Dicetak pada: ${formatDateTime(new Date())}`, 14, y);
  y += 8;

  doc.setDrawColor(200);
  doc.line(14, y, 196, y);
  y += 7;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Ringkasan Kinerja', 14, y);
  y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const summaryPairs: Array<[string, string]> = [
    ['Total Penjualan (Omzet)', formatRupiah(params.totalRevenue)],
    ['Keuntungan Bersih', formatRupiah(params.totalProfit)],
    ['Total Modal Terjual', formatRupiah(params.totalCost)],
    ['Jumlah Transaksi', `${formatNumber(params.totalTransactions)} transaksi`],
    ['Total Item Terjual', `${formatNumber(params.totalItemsSold)} item`],
  ];
  summaryPairs.forEach(([label, val]) => {
    doc.text(label, 14, y);
    doc.setFont('helvetica', 'bold');
    doc.text(val, 110, y);
    doc.setFont('helvetica', 'normal');
    y += 5.5;
  });

  y += 4;
  doc.line(14, y, 196, y);
  y += 7;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Rincian Produk Terjual', 14, y);
  y += 6;

  doc.setFontSize(9);
  doc.text('Produk', 14, y);
  doc.text('Kategori', 84, y);
  doc.text('Qty', 124, y, { align: 'right' });
  doc.text('Omzet', 160, y, { align: 'right' });
  doc.text('Laba', 196, y, { align: 'right' });
  y += 2.5;
  doc.line(14, y, 196, y);
  y += 5;

  doc.setFont('helvetica', 'normal');
  params.productRows.forEach((row) => {
    if (y > 275) {
      doc.addPage();
      y = 18;
    }
    doc.text(row.productName.slice(0, 34), 14, y);
    doc.text((row.categoryName || 'Umum').slice(0, 18), 84, y);
    doc.text(String(row.quantity), 124, y, { align: 'right' });
    doc.text(formatRupiah(row.revenue), 160, y, { align: 'right' });
    doc.text(formatRupiah(row.profit), 196, y, { align: 'right' });
    y += 5.5;
  });

  doc.save(`Laporan-${params.store.name.replace(/\s+/g, '-')}-${Date.now()}.pdf`);
}

export function exportSalesReportExcel(params: {
  store: StoreProfile;
  periodLabel: string;
  totalRevenue: number;
  totalProfit: number;
  totalCost: number;
  totalTransactions: number;
  totalItemsSold: number;
  productRows: ProductBreakdownRow[];
  transactions: PosTransaction[];
}): void {
  const wb = XLSX.utils.book_new();

  const summarySheetData = [
    ['Laporan Penjualan KASIR UMKM'],
    ['Toko', params.store.name],
    ['Periode', params.periodLabel],
    ['Diekspor', formatDateTime(new Date())],
    [],
    ['Metrik', 'Nilai'],
    ['Total Penjualan (Omzet)', params.totalRevenue],
    ['Keuntungan Bersih', params.totalProfit],
    ['Total Modal Terjual', params.totalCost],
    ['Total Transaksi', params.totalTransactions],
    ['Total Produk Terjual', params.totalItemsSold],
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summarySheetData);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Ringkasan');

  const productSheetData = [
    ['Produk', 'Kategori', 'Qty Terjual', 'Omzet (Rp)', 'Keuntungan (Rp)'],
    ...params.productRows.map((r) => [
      r.productName,
      r.categoryName || 'Umum',
      r.quantity,
      r.revenue,
      r.profit,
    ]),
  ];
  const wsProducts = XLSX.utils.aoa_to_sheet(productSheetData);
  XLSX.utils.book_append_sheet(wb, wsProducts, 'Rincian Produk');

  const txSheetData = [
    [
      'No Invoice',
      'Tanggal',
      'Kasir',
      'Pelanggan',
      'Metode Pembayaran',
      'Subtotal',
      'Diskon',
      'Pajak',
      'Total',
      'Laba',
      'Catatan',
    ],
    ...params.transactions.map((t) => [
      t.invoiceNumber,
      formatDateTime(t.createdAt),
      t.cashierName,
      t.customerName || '-',
      t.paymentMethod,
      t.subtotal,
      t.discountAmount,
      t.taxAmount,
      t.totalAmount,
      t.totalProfit,
      t.note || '',
    ]),
  ];
  const wsTx = XLSX.utils.aoa_to_sheet(txSheetData);
  XLSX.utils.book_append_sheet(wb, wsTx, 'Transaksi');

  XLSX.writeFile(wb, `Laporan-Penjualan-${params.store.name.replace(/\s+/g, '-')}.xlsx`);
}

export async function printThermalBluetooth(
  store: StoreProfile,
  tx: PosTransaction
): Promise<void> {
  const nav = navigator as Navigator & {
    bluetooth?: {
      requestDevice: (opts: unknown) => Promise<{
        gatt?: {
          connect: () => Promise<{
            getPrimaryServices: () => Promise<
              Array<{
                getCharacteristics: () => Promise<
                  Array<{
                    properties: { write?: boolean; writeWithoutResponse?: boolean };
                    writeValue: (data: BufferSource) => Promise<void>;
                  }>
                >;
              }>
            >;
          }>;
        };
      }>;
    };
  };

  if (!nav.bluetooth) {
    throw new Error(
      'Browser ini belum mendukung Web Bluetooth ESC/POS. Gunakan tombol Cetak Browser / PDF Struk.'
    );
  }

  const device = await nav.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: [
      '000018f0-0000-1000-8000-00805f9b34fb',
      'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
      '49535343-fe7d-4ae5-8fa9-9fafd205e455',
    ],
  });

  const server = await device.gatt?.connect();
  if (!server) throw new Error('Gagal menghubungkan ke printer Bluetooth.');

  const services = await server.getPrimaryServices();
  let writableChar: {
    writeValue: (data: BufferSource) => Promise<void>;
  } | null = null;

  for (const svc of services) {
    const chars = await svc.getCharacteristics();
    for (const ch of chars) {
      if (ch.properties.write || ch.properties.writeWithoutResponse) {
        writableChar = ch;
        break;
      }
    }
    if (writableChar) break;
  }

  if (!writableChar) {
    throw new Error('Karakteristik tulis printer thermal tidak ditemukan.');
  }

  const text = `${buildReceiptPlainText(store, tx)}\n\n\n`;
  const encoder = new TextEncoder();
  const init = new Uint8Array([0x1b, 0x40]);
  const body = encoder.encode(text);
  const cut = new Uint8Array([0x1d, 0x56, 0x41, 0x10]);

  const combined = new Uint8Array(init.length + body.length + cut.length);
  combined.set(init, 0);
  combined.set(body, init.length);
  combined.set(cut, init.length + body.length);

  const chunkSize = 100;
  for (let i = 0; i < combined.length; i += chunkSize) {
    const chunk = combined.slice(i, i + chunkSize);
    await writableChar.writeValue(chunk);
  }
}

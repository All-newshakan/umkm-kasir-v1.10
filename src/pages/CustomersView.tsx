import React, { useMemo, useState } from 'react';
import {
  Award,
  Edit3,
  Mail,
  MapPin,
  Phone,
  Plus,
  Search,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import type { Customer, PosTransaction, StoreProfile } from '../types/models';
import { formatFriendlyDatabaseError } from '../lib/supabase';
import { formatDateTime, formatNumber, formatRupiah } from '../lib/formatters';
import {
  adjustCustomerPoints,
  deleteCustomer,
  saveCustomer,
} from '../lib/storeRepository';
import { ConfirmModal } from '../components/ConfirmModal';

interface CustomersViewProps {
  store: StoreProfile;
  customers: Customer[];
  transactions: PosTransaction[];
  onSelectTransaction: (tx: PosTransaction) => void;
  onNotify: (type: 'success' | 'error' | 'info', message: string) => void;
}

export const CustomersView: React.FC<CustomersViewProps> = ({
  store,
  customers,
  transactions,
  onSelectTransaction,
  onNotify,
}) => {
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<'ALL' | 'HAS_POINTS' | 'LOYAL'>('ALL');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [loyaltyPoints, setLoyaltyPoints] = useState('0');
  const [saving, setSaving] = useState(false);

  const [detailCustomerId, setDetailCustomerId] = useState<string | null>(null);
  const [customPointsDelta, setCustomPointsDelta] = useState('');
  const [adjustingPoints, setAdjustingPoints] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState(false);

  const detailCustomer = useMemo(
    () => customers.find((c) => c.id === detailCustomerId) || null,
    [customers, detailCustomerId]
  );

  const kpis = useMemo(() => {
    const totalPoints = customers.reduce((acc, c) => acc + c.loyaltyPoints, 0);
    const totalSpent = customers.reduce((acc, c) => acc + c.totalSpent, 0);
    return {
      count: customers.length,
      totalPoints,
      totalSpent,
    };
  }, [customers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return customers.filter((c) => {
      if (filterMode === 'HAS_POINTS' && c.loyaltyPoints <= 0) return false;
      if (filterMode === 'LOYAL' && c.visitCount < 3) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q)
      );
    });
  }, [customers, search, filterMode]);

  const detailTransactions = useMemo(() => {
    if (!detailCustomer) return [];
    return transactions.filter((t) => t.customerId === detailCustomer.id);
  }, [transactions, detailCustomer]);

  const openNewModal = () => {
    setEditingCustomer(null);
    setName('');
    setPhone('');
    setEmail('');
    setAddress('');
    setNotes('');
    setLoyaltyPoints('0');
    setModalOpen(true);
  };

  const openEditModal = (c: Customer) => {
    setEditingCustomer(c);
    setName(c.name);
    setPhone(c.phone);
    setEmail(c.email);
    setAddress(c.address);
    setNotes(c.notes);
    setLoyaltyPoints(String(c.loyaltyPoints));
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      onNotify('error', 'Nama pelanggan wajib diisi.');
      return;
    }
    setSaving(true);
    try {
      await saveCustomer(store, {
        id: editingCustomer?.id,
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        address: address.trim(),
        notes: notes.trim(),
        loyaltyPoints: Math.max(0, Math.round(Number(loyaltyPoints) || 0)),
      });
      setModalOpen(false);
      onNotify(
        'success',
        editingCustomer ? 'Data pelanggan diperbarui.' : 'Pelanggan baru ditambahkan.'
      );
    } catch (err) {
      onNotify('error', formatFriendlyDatabaseError(err));
    } finally {
      setSaving(false);
    }
  };

  const handlePointsDelta = async (delta: number) => {
    if (!detailCustomer || delta === 0) return;
    setAdjustingPoints(true);
    try {
      await adjustCustomerPoints(store.id, detailCustomer, delta);
      setCustomPointsDelta('');
      onNotify(
        'success',
        `Poin ${detailCustomer.name} ${delta > 0 ? `+${delta}` : delta} diperbarui.`
      );
    } catch (err) {
      onNotify('error', formatFriendlyDatabaseError(err));
    } finally {
      setAdjustingPoints(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteCustomer(store.id, deleteTarget.id);
      if (detailCustomerId === deleteTarget.id) setDetailCustomerId(null);
      setDeleteTarget(null);
      onNotify('success', 'Data pelanggan dihapus.');
    } catch (err) {
      onNotify('error', formatFriendlyDatabaseError(err));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">
            Pelanggan &amp; Poin Loyalitas
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            1 poin per Rp 10.000 belanja · Tukar 1 poin = potongan Rp 100 di kasir
          </p>
        </div>
        <button
          type="button"
          onClick={openNewModal}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-white text-xs font-semibold transition-colors whitespace-nowrap"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          <Plus className="w-4 h-4" />
          Tambah Pelanggan
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-1">
          <p className="text-xs text-slate-500 dark:text-slate-400">Total Pelanggan</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
            {formatNumber(kpis.count)}
          </p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-1">
          <p className="text-xs text-slate-500 dark:text-slate-400">Total Poin Aktif</p>
          <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 tabular-nums">
            {formatNumber(kpis.totalPoints)} poin
          </p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-1">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Akumulasi Belanja Member
          </p>
          <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
            {formatRupiah(kpis.totalSpent)}
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama, nomor HP, atau email..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm"
          />
        </div>
        <div className="flex items-center gap-1.5">
          {[
            { key: 'ALL' as const, label: 'Semua' },
            { key: 'HAS_POINTS' as const, label: 'Punya Poin' },
            { key: 'LOYAL' as const, label: 'Langganan (3+)' },
          ].map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilterMode(f.key)}
              className={`px-3.5 py-2 rounded-xl border text-xs font-semibold transition-colors whitespace-nowrap ${
                filterMode === f.key
                  ? 'text-white border-transparent'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
              }`}
              style={
                filterMode === f.key
                  ? { backgroundColor: 'var(--brand-primary)' }
                  : undefined
              }
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-12 text-center space-y-2">
            <Users className="w-9 h-9 text-slate-300 dark:text-slate-600 mx-auto" />
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
              Belum ada data pelanggan
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.map((c) => (
              <div
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/40"
              >
                <button
                  type="button"
                  onClick={() => setDetailCustomerId(c.id)}
                  className="flex-1 min-w-[200px] text-left space-y-0.5"
                >
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    {c.name}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {c.phone || 'Tanpa HP'} · {formatNumber(c.visitCount)} kunjungan ·
                    Belanja {formatRupiah(c.totalSpent)}
                  </p>
                </button>

                <div className="flex items-center gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => setDetailCustomerId(c.id)}
                    className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 dark:text-amber-400 tabular-nums hover:underline"
                  >
                    <Award className="w-3.5 h-3.5" />
                    {formatNumber(c.loyaltyPoints)} poin
                  </button>
                  <button
                    type="button"
                    onClick={() => openEditModal(c)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
                    aria-label="Edit pelanggan"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(c)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                    aria-label="Hapus pelanggan"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Customer Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <form
            onSubmit={(e) => void handleSave(e)}
            className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                {editingCustomer ? 'Edit Pelanggan' : 'Pelanggan Baru'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-3.5">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  Nama Lengkap *
                </label>
                <input
                  type="text"
                  required
                  maxLength={100}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    No HP / WhatsApp
                  </label>
                  <input
                    type="tel"
                    maxLength={40}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    Poin Awal
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={loyaltyPoints}
                    onChange={(e) => setLoyaltyPoints(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono tabular-nums"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  Email
                </label>
                <input
                  type="email"
                  maxLength={160}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  Alamat
                </label>
                <input
                  type="text"
                  maxLength={240}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  Catatan
                </label>
                <input
                  type="text"
                  maxLength={300}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Preferensi atau catatan pelanggan..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 px-5 py-3.5 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 rounded-xl text-white text-xs font-semibold disabled:opacity-60"
                style={{ backgroundColor: 'var(--brand-primary)' }}
              >
                {saving ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Detail Drawer */}
      {detailCustomer && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/60">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 h-full flex flex-col border-l border-slate-200 dark:border-slate-800 shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {detailCustomer.name}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {formatNumber(detailCustomer.visitCount)} kunjungan · Total{' '}
                  {formatRupiah(detailCustomer.totalSpent)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailCustomerId(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              <div className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
                {detailCustomer.phone && (
                  <p className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    {detailCustomer.phone}
                  </p>
                )}
                {detailCustomer.email && (
                  <p className="flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5 text-slate-400" />
                    {detailCustomer.email}
                  </p>
                )}
                {detailCustomer.address && (
                  <p className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    {detailCustomer.address}
                  </p>
                )}
                {detailCustomer.notes && (
                  <p className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300">
                    {detailCustomer.notes}
                  </p>
                )}
              </div>

              <div className="p-4 rounded-2xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                    Saldo Poin Loyalitas
                  </span>
                  <span className="text-lg font-bold text-amber-700 dark:text-amber-400 tabular-nums">
                    {formatNumber(detailCustomer.loyaltyPoints)} poin
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {[10, 50, -10].map((delta) => (
                    <button
                      key={delta}
                      type="button"
                      disabled={adjustingPoints}
                      onClick={() => void handlePointsDelta(delta)}
                      className="px-3 py-1.5 rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-amber-100/60"
                    >
                      {delta > 0 ? `+${delta}` : delta} poin
                    </button>
                  ))}
                </div>

                <div className="flex gap-2">
                  <input
                    type="number"
                    value={customPointsDelta}
                    onChange={(e) => setCustomPointsDelta(e.target.value)}
                    placeholder="Sesuaikan (+/-)"
                    className="flex-1 px-3 py-1.5 rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-950 text-xs font-mono"
                  />
                  <button
                    type="button"
                    disabled={adjustingPoints || !customPointsDelta}
                    onClick={() =>
                      void handlePointsDelta(Math.round(Number(customPointsDelta) || 0))
                    }
                    className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold disabled:opacity-50"
                  >
                    Terapkan
                  </button>
                </div>
              </div>

              <div className="space-y-2.5">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Riwayat Belanja ({detailTransactions.length})
                </h4>
                {detailTransactions.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Belum ada transaksi atas nama pelanggan ini.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {detailTransactions.map((tx) => (
                      <button
                        key={tx.id}
                        type="button"
                        onClick={() => {
                          setDetailCustomerId(null);
                          onSelectTransaction(tx);
                        }}
                        className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-left"
                      >
                        <div>
                          <p className="text-xs font-bold font-mono text-slate-900 dark:text-white">
                            {tx.invoiceNumber}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            {formatDateTime(tx.createdAt)} · {tx.paymentMethod}
                          </p>
                        </div>
                        <p className="text-xs font-bold text-slate-900 dark:text-white tabular-nums">
                          {formatRupiah(tx.totalAmount)}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Hapus Data Pelanggan?"
        message={
          deleteTarget
            ? `Yakin ingin menghapus data pelanggan "${deleteTarget.name}"?`
            : ''
        }
        confirmLabel="Hapus"
        danger
        loading={deleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

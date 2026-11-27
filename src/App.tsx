import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import {
  BarChart3,
  LayoutDashboard,
  Loader2,
  LogOut,
  Moon,
  Package,
  Receipt,
  Settings,
  ShieldAlert,
  ShoppingCart,
  Sun,
  Users,
} from 'lucide-react';
import {
  BRAND_PALETTES,
  getStaffPermissions,
  type Category,
  type Customer,
  type PosTransaction,
  type Product,
  type StaffInvite,
  type StaffMember,
  type StoreProfile,
  type UserProfile,
} from './types/models';
import {
  formatFriendlyDatabaseError,
  getUserAvatarUrl,
  getUserDisplayName,
  registerAndroidDeepLinkAuthListener,
  supabase,
  testSupabaseConnection,
} from './lib/supabase';
import {
  ensureUserProfile,
  subscribeAllStaff,
  subscribeCategories,
  subscribeCustomers,
  subscribePendingInvites,
  subscribeProducts,
  subscribeStaffMember,
  subscribeStore,
  subscribeStoreInvites,
  subscribeTransactions,
  subscribeUserProfile,
  subscribeUserStores,
  switchActiveStore,
} from './lib/storeRepository';
import { DynamicStoreLogo } from './components/DynamicStoreLogo';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastContainer, type ToastMessage } from './components/ToastContainer';
import { AuthLoginView, StoreOnboardingView } from './pages/AuthAndOnboardingView';
import { CashierView } from './pages/CashierView';
import { CustomersView } from './pages/CustomersView';
import { DashboardView, type AppTab } from './pages/DashboardView';
import { ProductsCategoriesView } from './pages/ProductsCategoriesView';
import { ProfileSettingsView } from './pages/ProfileSettingsView';
import { ReceiptView } from './pages/ReceiptView';
import { ReportsView } from './pages/ReportsView';
import { TransactionsHistoryView } from './pages/TransactionsHistoryView';

function MainApp() {
  const [authReady, setAuthReady] = useState(false);
  // Do not start RLS-protected data subscriptions until the authenticated
  // user's profile/owner membership repair RPC has completed.
  const [accessRepairReady, setAccessRepairReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [offlineWarning, setOfflineWarning] = useState<string>('');

  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [pendingInvites, setPendingInvites] = useState<StaffInvite[]>([]);

  const [store, setStore] = useState<StoreProfile | null>(null);
  const [userStores, setUserStores] = useState<StoreProfile[]>([]);
  const [creatingNewStore, setCreatingNewStore] = useState(false);
  const [storeLoaded, setStoreLoaded] = useState(false);
  const [staffMember, setStaffMember] = useState<StaffMember | null>(null);
  const [allStaff, setAllStaff] = useState<StaffMember[]>([]);
  const [storeInvites, setStoreInvites] = useState<StaffInvite[]>([]);

  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [transactions, setTransactions] = useState<PosTransaction[]>([]);

  const [activeTab, setActiveTab] = useState<AppTab>('DASHBOARD');
  const [selectedReceiptTx, setSelectedReceiptTx] = useState<PosTransaction | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('kasir_umkm_dark') === 'true';
    } catch {
      return false;
    }
  });

  const notify = useCallback(
    (type: 'success' | 'error' | 'info', message: string) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [...prev.slice(-3), { id, type, message }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4500);
    },
    []
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) root.classList.add('dark');
    else root.classList.remove('dark');
    try {
      localStorage.setItem('kasir_umkm_dark', String(darkMode));
    } catch {
      // Ignore storage error
    }
  }, [darkMode]);

  // Apply dynamic store CSS brand palette
  useEffect(() => {
    const pal =
      BRAND_PALETTES[store?.themePaletteKey || 'EMERALD'] || BRAND_PALETTES.EMERALD;
    const style = document.documentElement.style;
    style.setProperty('--brand-primary', pal.primary);
    style.setProperty('--brand-primary-dark', pal.primaryDark);
    style.setProperty('--brand-secondary', pal.secondary);
    style.setProperty('--brand-accent', pal.accent);
    style.setProperty('--brand-soft', pal.soft);
  }, [store?.themePaletteKey]);

  // Boot Supabase connection check, deep-link listener & auth session listener
  useEffect(() => {
    void testSupabaseConnection().then((res) => {
      if (!res.ok && res.offlineMessage) {
        setOfflineWarning(res.offlineMessage);
      }
    });

    const unsubDeepLink = registerAndroidDeepLinkAuthListener(notify);

    if (!supabase) {
      setAuthReady(true);
      return () => {
        unsubDeepLink();
      };
    }

    const applySessionUser = (nextUser: User | null) => {
      setUser(nextUser);
      setAuthReady(true);
      setAccessRepairReady(false);

      // Clear data from any previous session before bootstrapping the new one.
      setUserProfile(null);
      setProfileLoaded(false);
      setStore(null);
      setStoreLoaded(false);
      setStaffMember(null);
      setPendingInvites([]);
      setUserStores([]);
      setAllStaff([]);
      setStoreInvites([]);
      setCategories([]);
      setProducts([]);
      setCustomers([]);
      setTransactions([]);

      if (nextUser) {
        void (async () => {
          try {
            // This SECURITY DEFINER RPC repairs the owner/profile link. Data
            // subscriptions must wait until it has finished to avoid querying
            // RLS-protected tables with incomplete membership state.
            await ensureUserProfile(nextUser);
          } catch (err) {
            notify('error', formatFriendlyDatabaseError(err));
          } finally {
            setAccessRepairReady(true);
          }
        })();
      } else {
        setAccessRepairReady(true);
      }
    };

    void supabase.auth.getSession().then(({ data }) => {
      applySessionUser(data.session?.user ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      applySessionUser(session?.user ?? null);
    });

    return () => {
      unsubDeepLink();
      subscription.unsubscribe();
    };
  }, [notify]);

  // Subscribe userProfile + pending invites for signed-in user
  useEffect(() => {
    if (!user || !accessRepairReady) return;
    setProfileLoaded(false);
    const emailLower = (user.email || '').trim().toLowerCase();

    const unsubProfile = subscribeUserProfile(
      user.id,
      (profile) => {
        setUserProfile(profile);
        setProfileLoaded(true);
      },
      (err) => {
        setProfileLoaded(true);
        notify('error', formatFriendlyDatabaseError(err));
      }
    );

    const unsubInvites = emailLower
      ? subscribePendingInvites(
          emailLower,
          (invites) => setPendingInvites(invites),
          (err) => notify('error', formatFriendlyDatabaseError(err))
        )
      : () => undefined;

    const unsubUserStores = subscribeUserStores(
      user.id,
      (storesList) => setUserStores(storesList),
      (err) => notify('error', formatFriendlyDatabaseError(err))
    );

    return () => {
      unsubProfile();
      unsubInvites();
      unsubUserStores();
    };
  }, [user, accessRepairReady, notify]);

  useEffect(() => {
    if (
      user &&
      accessRepairReady &&
      profileLoaded &&
      !userProfile?.activeStoreId &&
      userStores.length > 0 &&
      !creatingNewStore
    ) {
      void switchActiveStore({
        uid: user.id,
        email: user.email || '',
        displayName: getUserDisplayName(user),
        store: userStores[0],
      }).catch(() => undefined);
    }
  }, [user, accessRepairReady, profileLoaded, userProfile?.activeStoreId, userStores, creatingNewStore]);

  // Subscribe active store, staff record & store collections
  useEffect(() => {
    const storeId = userProfile?.activeStoreId;
    const emailLower = (user?.email || '').trim().toLowerCase();
    if (!user || !accessRepairReady || !storeId || !emailLower) {
      setStore(null);
      setStoreLoaded(true);
      return;
    }

    setStoreLoaded(false);
    const onSubErr = (err: unknown) => {
      notify('error', formatFriendlyDatabaseError(err));
    };

    const unsubStore = subscribeStore(
      storeId,
      (s) => {
        setStore(s);
        setStoreLoaded(true);
      },
      (err) => {
        setStoreLoaded(true);
        onSubErr(err);
      }
    );

    const unsubStaff = subscribeStaffMember(
      storeId,
      user.id,
      (m) => setStaffMember(m),
      onSubErr
    );

    const unsubCats = subscribeCategories(storeId, emailLower, setCategories, onSubErr);
    const unsubProds = subscribeProducts(storeId, emailLower, setProducts, onSubErr);
    const unsubCusts = subscribeCustomers(storeId, emailLower, setCustomers, onSubErr);
    const unsubTxs = subscribeTransactions(storeId, emailLower, setTransactions, onSubErr);

    let unsubAllStaff: () => void = () => {};
    let unsubStoreInvites: () => void = () => {};
    if (userProfile?.role === 'OWNER') {
      unsubAllStaff = subscribeAllStaff(storeId, user.id, setAllStaff, onSubErr);
      unsubStoreInvites = subscribeStoreInvites(
        storeId,
        user.id,
        setStoreInvites,
        onSubErr
      );
    }

    return () => {
      unsubStore();
      unsubStaff();
      unsubCats();
      unsubProds();
      unsubCusts();
      unsubTxs();
      unsubAllStaff();
      unsubStoreInvites();
    };
  }, [user, accessRepairReady, userProfile?.activeStoreId, userProfile?.role, notify]);

  const role = userProfile?.role || 'OWNER';
  const permissions = useMemo(
    () => getStaffPermissions(role, staffMember),
    [role, staffMember]
  );

  const navItems = useMemo(
    () =>
      [
        {
          tab: 'DASHBOARD' as AppTab,
          label: 'Beranda',
          icon: LayoutDashboard,
          allowed: true,
        },
        {
          tab: 'CASHIER' as AppTab,
          label: 'Kasir',
          icon: ShoppingCart,
          allowed: permissions.canAccessKasir,
        },
        {
          tab: 'PRODUCTS' as AppTab,
          label: 'Produk',
          icon: Package,
          allowed: true,
        },
        {
          tab: 'TRANSACTIONS' as AppTab,
          label: 'Transaksi',
          icon: Receipt,
          allowed: permissions.canViewTransactions,
        },
        {
          tab: 'CUSTOMERS' as AppTab,
          label: 'Pelanggan',
          icon: Users,
          allowed: true,
        },
        {
          tab: 'REPORTS' as AppTab,
          label: 'Laporan',
          icon: BarChart3,
          allowed: permissions.canViewReports,
        },
        {
          tab: 'SETTINGS' as AppTab,
          label: 'Toko',
          icon: Settings,
          allowed: permissions.canManageSettings,
        },
      ].filter((item) => item.allowed),
    [permissions]
  );

  // Redirect away from unauthorized tab if permissions changed live
  useEffect(() => {
    if (!navItems.some((n) => n.tab === activeTab)) {
      setActiveTab('DASHBOARD');
    }
  }, [navItems, activeTab]);

  const handleSignOut = async () => {
    try {
      if (supabase) {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
      }
      notify('info', 'Anda telah keluar dari akun.');
    } catch (err) {
      notify('error', formatFriendlyDatabaseError(err));
    }
  };

  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <Loader2 className="w-7 h-7 animate-spin text-emerald-700" />
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
        <AuthLoginView offlineWarning={offlineWarning} onNotify={notify} />
      </>
    );
  }

  if (!profileLoaded || (userProfile?.activeStoreId && !storeLoaded)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-300">
        <Loader2 className="w-7 h-7 animate-spin text-emerald-700" />
        <p className="text-sm font-medium">Memuat data toko...</p>
      </div>
    );
  }

  const userDisplayName = getUserDisplayName(user);
  const userAvatarUrl = getUserAvatarUrl(user);

  if (!userProfile?.activeStoreId || !store || creatingNewStore) {
    return (
      <>
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
        <StoreOnboardingView
          uid={user.id}
          email={user.email || ''}
          displayName={userDisplayName}
          photoURL={userAvatarUrl}
          pendingInvites={pendingInvites}
          isAddingAnotherStore={Boolean(store && creatingNewStore)}
          onCancelAddingStore={() => setCreatingNewStore(false)}
          onSignOut={() => void handleSignOut()}
          onNotify={notify}
        />
      </>
    );
  }

  if (role === 'KASIR' && staffMember && !staffMember.active) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
        <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 text-center space-y-4">
          <div className="w-12 h-12 rounded-xl bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Akses Kasir Dinonaktifkan
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Pemilik toko {store.name} menonaktifkan akses staf untuk akun{' '}
              {user.email}. Hubungi pemilik toko untuk mengaktifkan kembali.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold"
          >
            <LogOut className="w-4 h-4" />
            Keluar Akun
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col md:flex-row">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:w-64 lg:w-68 shrink-0 flex-col bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 sticky top-0 h-screen">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3">
          <DynamicStoreLogo
            storeName={store.name}
            logoIconKey={store.logoIconKey}
            logoBase64={store.logoBase64}
            themePaletteKey={store.themePaletteKey}
            size="md"
          />
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
              {store.name}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {role === 'OWNER' ? 'Pemilik' : 'Kasir'} ·{' '}
              {userProfile.displayName || userDisplayName}
            </p>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.tab;
            return (
              <button
                key={item.tab}
                type="button"
                onClick={() => setActiveTab(item.tab)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-colors whitespace-nowrap ${
                  active
                    ? 'text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70'
                }`}
                style={active ? { backgroundColor: 'var(--brand-primary)' } : undefined}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setDarkMode((v) => !v)}
            className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            {darkMode ? (
              <Sun className="w-3.5 h-3.5 text-amber-500" />
            ) : (
              <Moon className="w-3.5 h-3.5" />
            )}
            {darkMode ? 'Terang' : 'Gelap'}
          </button>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
            title="Keluar"
            aria-label="Keluar"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      {/* Mobile Top Bar */}
      <header className="md:hidden sticky top-0 z-30 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <DynamicStoreLogo
            storeName={store.name}
            logoIconKey={store.logoIconKey}
            logoBase64={store.logoBase64}
            themePaletteKey={store.themePaletteKey}
            size="sm"
          />
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
              {store.name}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              {role === 'OWNER' ? 'Pemilik' : 'Kasir'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setDarkMode((v) => !v)}
          className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
          aria-label="Ubah tema"
        >
          {darkMode ? (
            <Sun className="w-4 h-4 text-amber-500" />
          ) : (
            <Moon className="w-4 h-4" />
          )}
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 min-w-0 p-4 sm:p-6 pb-24 md:pb-8 max-w-7xl w-full mx-auto">
        {activeTab === 'DASHBOARD' && (
          <DashboardView
            store={store}
            products={products}
            transactions={transactions}
            customers={customers}
            permissions={permissions}
            role={role}
            onNavigate={setActiveTab}
            onSelectTransaction={setSelectedReceiptTx}
          />
        )}

        {activeTab === 'CASHIER' && permissions.canAccessKasir && (
          <CashierView
            store={store}
            currentUid={user.id}
            cashierName={userProfile.displayName || userDisplayName || 'Kasir'}
            products={products}
            categories={categories}
            customers={customers}
            onTransactionCompleted={(tx) => setSelectedReceiptTx(tx)}
            onNotify={notify}
          />
        )}

        {activeTab === 'PRODUCTS' && (
          <ProductsCategoriesView
            store={store}
            products={products}
            categories={categories}
            permissions={permissions}
            onNotify={notify}
          />
        )}

        {activeTab === 'TRANSACTIONS' && permissions.canViewTransactions && (
          <TransactionsHistoryView
            transactions={transactions}
            onSelectTransaction={setSelectedReceiptTx}
          />
        )}

        {activeTab === 'CUSTOMERS' && (
          <CustomersView
            store={store}
            customers={customers}
            transactions={transactions}
            onSelectTransaction={setSelectedReceiptTx}
            onNotify={notify}
          />
        )}

        {activeTab === 'REPORTS' && permissions.canViewReports && (
          <ReportsView
            store={store}
            transactions={transactions}
            categories={categories}
            products={products}
            onSelectTransaction={setSelectedReceiptTx}
            onNotify={notify}
          />
        )}

        {activeTab === 'SETTINGS' && permissions.canManageSettings && (
          <ProfileSettingsView
            store={store}
            userStores={userStores}
            role={role}
            currentUid={user.id}
            currentEmail={user.email || ''}
            staffList={allStaff}
            storeInvites={storeInvites}
            categories={categories}
            products={products}
            customers={customers}
            transactions={transactions}
            darkMode={darkMode}
            onToggleDarkMode={() => setDarkMode((v) => !v)}
            onSwitchStore={(target) => {
              void switchActiveStore({
                uid: user.id,
                email: user.email || '',
                displayName: userDisplayName,
                store: target,
              })
                .then(() => {
                  setActiveTab('DASHBOARD');
                  notify('success', `Beralih ke toko "${target.name}".`);
                })
                .catch((err) => notify('error', formatFriendlyDatabaseError(err)));
            }}
            onCreateAnotherStore={() => setCreatingNewStore(true)}
            onSignOut={() => void handleSignOut()}
            onNotify={notify}
          />
        )}
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 px-1 py-1 flex items-center justify-around">
        {navItems.slice(0, 5).map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.tab;
          return (
            <button
              key={item.tab}
              type="button"
              onClick={() => setActiveTab(item.tab)}
              className={`flex flex-col items-center justify-center gap-0.5 px-2 py-1.5 rounded-xl text-[11px] font-medium min-w-[56px] ${
                active
                  ? 'font-bold'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
              style={active ? { color: 'var(--brand-primary)' } : undefined}
            >
              <Icon className="w-4 h-4" />
              <span className="truncate max-w-[60px]">{item.label}</span>
            </button>
          );
        })}
        {navItems.length > 5 && (
          <button
            type="button"
            onClick={() =>
              setActiveTab(
                activeTab === 'SETTINGS' && permissions.canViewReports
                  ? 'REPORTS'
                  : permissions.canManageSettings
                    ? 'SETTINGS'
                    : 'REPORTS'
              )
            }
            className={`flex flex-col items-center justify-center gap-0.5 px-2 py-1.5 rounded-xl text-[11px] font-medium min-w-[56px] ${
              activeTab === 'REPORTS' || activeTab === 'SETTINGS'
                ? 'font-bold'
                : 'text-slate-500 dark:text-slate-400'
            }`}
            style={
              activeTab === 'REPORTS' || activeTab === 'SETTINGS'
                ? { color: 'var(--brand-primary)' }
                : undefined
            }
          >
            <Settings className="w-4 h-4" />
            <span>Lainnya</span>
          </button>
        )}
      </nav>

      {selectedReceiptTx && (
        <ReceiptView
          store={store}
          transaction={selectedReceiptTx}
          onClose={() => setSelectedReceiptTx(null)}
          onNotify={notify}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <MainApp />
    </ErrorBoundary>
  );
}

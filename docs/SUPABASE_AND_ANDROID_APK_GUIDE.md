# Panduan Integrasi Supabase & Build APK Android — KASIR UMKM

Aplikasi **KASIR UMKM** menggunakan **Supabase** (`@supabase/supabase-js`) secara langsung sebagai backend cloud dan database **PostgreSQL**, serta dibungkus menjadi aplikasi Android native (`.apk`) menggunakan **Capacitor**.

Karena seluruh autentikasi dan transaksi berjalan langsung melalui HTTPS ke Supabase SDK + Row Level Security (RLS), variabel `VITE_API_BASE_URL` tidak lagi diperlukan untuk operasional toko dan **tidak ada alamat `localhost` di dalam APK release**.

---

## 1. Mengambil Project URL dan Publishable / Anon Key Supabase

1. Masuk ke [Supabase Dashboard](https://supabase.com/dashboard) dan buat proyek baru (misal nama: `kasir-umkm`, region: **Singapore / Southeast Asia**).
2. Buka menu **Project Settings** (ikon roda gigi di kiri bawah) -> **Data API** (atau **API**).
3. Salin dua nilai publik berikut:
   - **Project URL** (contoh: `https://xyzcompany.supabase.co`) -> isi ke `VITE_SUPABASE_URL`
   - **Publishable Key** / **anon public key** -> isi ke `VITE_SUPABASE_ANON_KEY`
4. Masukkan ke file `.env` di root proyek:

```env
VITE_SUPABASE_URL=https://PROJECT_REF_ANDA.supabase.co
VITE_SUPABASE_ANON_KEY=KEY_PUBLISHABLE_ATAU_ANON_ANDA
```

> **Keamanan Penting:** Jangan pernah menyalin **`service_role` key** ke `.env` (`VITE_*`), frontend, atau APK Android.

---

## 2. Menjalankan SQL Migration (10 Tabel + Trigger + RLS + Atomic RPC)

1. Di Supabase Dashboard, buka menu **SQL Editor** -> **New query**.
2. Buka file `supabase/migrations/001_kasir_umkm_schema.sql` dari proyek ini, salin seluruh isinya, lalu jalankan (**Run**).
3. Script tersebut membuat:
   - **10 tabel berelasi dengan UUID**: `profiles`, `stores`, `store_members`, `store_settings`, `categories`, `products`, `customers`, `transactions`, `transaction_details`, `payments`.
   - **Trigger otomatis** `handle_new_user()` untuk membuat baris `profiles` saat pengguna baru masuk via Google atau Email.
   - **Row Level Security (RLS)** ketat pada semua tabel berdasarkan `store_members` dan `auth.uid()`.
   - **Atomic RPC PostgreSQL**:
     - `create_store_with_owner(...)` — membuat toko, `store_settings`, `store_members` (`OWNER`), dan memperbarui `profiles.active_store_id` sekaligus.
     - `accept_store_invite(...)` — menerima undangan kasir (`STAFF`/`KASIR`).
     - `complete_pos_checkout(...)` — mencatat `transactions`, `transaction_details`, `payments`, mengurangi stok produk, dan menghitung poin loyalitas pelanggan secara atomik.

---

## 3. Konfigurasi Google OAuth (Web & Android Deep Link)

### A. Google Cloud Console
1. Buka [Google Cloud Console](https://console.cloud.google.com/) -> **APIs & Services** -> **Credentials**.
2. Pilih **Create Credentials** -> **OAuth client ID** -> **Web application**.
3. Pada **Authorized redirect URIs**, tambahkan callback milik Supabase Anda:
   ```text
   https://PROJECT_REF_ANDA.supabase.co/auth/v1/callback
   ```
4. Salin **Client ID** dan **Client Secret**.

### B. Supabase Authentication Providers & Redirect URLs
1. Di Supabase Dashboard -> **Authentication** -> **Providers** -> **Google**, aktifkan Google, lalu tempel **Client ID** dan **Client Secret** dari Google Cloud Console.
2. Buka **Authentication** -> **URL Configuration**:
   - **Site URL**: isi URL aplikasi web produksi Anda (atau `http://localhost:3000` saat development).
   - **Redirect URLs** (tambahkan **semua** URL berikut agar Web & APK Android berfungsi):
     ```text
     http://localhost:3000/**
     https://URL-PUBLIK-APP-ANDA.run.app/**
     com.aistudio.kasirumkm.qzvtmk://login-callback
     ```

### Alur Login Google di Android APK:
- Pengguna menekan **Login dengan Google** atau **Daftar Toko Baru dengan Google**.
- Aplikasi membuka Chrome Custom Tab (`@capacitor/browser`) untuk login akun Google yang aman.
- Setelah selesai, Supabase mengarahkan kembali ke `com.aistudio.kasirumkm.qzvtmk://login-callback` yang ditangkap `AndroidManifest.xml` & `@capacitor/app` -> menukar kode PKCE menjadi session tersimpan aman -> otomatis masuk ke Pengaturan Toko Pertama Kali (tanpa syarat NIB/SIUP/NPWP) atau langsung ke Dashboard Kasir.

---

## 4. Build Android APK Release & Install Tanpa Kabel USB

Pastikan `.env` sudah terisi `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY`, lalu jalankan:

```bash
npm install
npm run build
npx cap sync android
cd android && ./gradlew assembleRelease
```

Salin hasil APK siap install:
```bash
cp android/app/build/outputs/apk/release/app-release.apk downloads/kasir-umkm-release.apk
```

### Cara Install di HP Android (Tanpa USB / Tanpa Android Studio):
1. Buka URL web KASIR UMKM di browser HP Android (Chrome), lalu klik tombol **Unduh APK** (atau akses `/downloads/kasir-umkm-release.apk`).
2. Ketuk file `kasir-umkm-release.apk` setelah selesai diunduh.
3. Jika diminta, izinkan **Install aplikasi dari sumber ini**.
4. Buka aplikasi **KASIR UMKM**, login menggunakan akun Google, atur profil toko, dan aplikasi kasir siap dipakai.

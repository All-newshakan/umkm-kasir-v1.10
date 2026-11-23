# Panduan Build APK Release, Google OAuth, Database & Distribusi — KASIR UMKM

Dokumen ini menjelaskan arsitektur hybrid Capacitor Android + Web, cara membangun ulang file `.apk` release yang ditandatangani, konfigurasi Firebase & Google OAuth, konfigurasi server Midtrans, serta panduan instalasi langsung di perangkat Android tanpa kabel USB.

---

## 1. Arsitektur Proyek

- **Frontend Web & POS**: React 19 + TypeScript + Tailwind CSS v4 + Vite (`src/`, `index.html`).
- **Backend Proxy & Hosting APK**: Express (`server.ts` pada port `3000`) untuk proxy pembayaran Midtrans Core API v2 (`/api/midtrans/*`) dan distribusi file APK (`/downloads/kasir-umkm-release.apk`).
- **Database & Autentikasi**: Firebase Authentication (Google Sign-In & Email/Password) + Cloud Firestore (`firebase-applet-config.json`, `firestore.rules`, `firebase-blueprint.json`).
- **Android Native Wrapper**: Capacitor Android (`capacitor.config.ts`, folder `android/`) membungkus bundle `dist/` ke aplikasi Android native (minimal **Android 8.0 Oreo / API 26**, target SDK 36) dengan bridge native **Google Credential Manager** (`AndroidGoogleAuth`) dan izin kamera/Bluetooth.

---

## 2. Konfigurasi Database & Backend

### A. Firebase & Firestore
- File konfigurasi proyek Firebase Web tersimpan di `firebase-applet-config.json`.
- Database ID aktif: `ai-studio-kasirumkm-a126d141-24e0-4ee9-bf87-c616ecc0d8b4`.
- Skema entitas dan jalur koleksi terdokumentasi di `firebase-blueprint.json` mencakup:
  - `users/{userId}` — Profil pengguna & penunjuk `activeStoreId` (mendukung multi-toko).
  - `stores/{storeId}` — Profil toko, `businessType` (jenis usaha), tema warna, pajak, dan daftar anggota.
  - `stores/{storeId}/staff/{staffUid}` — Anggota toko (`OWNER` / `KASIR`) beserta izin fitur granular.
  - `staffInvites/{inviteId}` — Undangan staf kasir berbasis email Google.
  - `stores/{storeId}/categories/{categoryId}` — Kategori produk per toko.
  - `stores/{storeId}/products/{productId}` — Produk, modal, harga jual, stok, barcode.
  - `stores/{storeId}/customers/{customerId}` — Data pelanggan & saldo poin loyalitas.
  - `stores/{storeId}/transactions/{transactionId}` — Transaksi kasir, rincian item (`items`), pembayaran (`paymentMethod`, `gatewayProvider`, `gatewayOrderId`).
- Security Rules (`firestore.rules`) mengisolasi seluruh data berdasarkan `storeId` dan `memberUids` / `memberEmails`.

### B. Environment Variables Server & API URL (`.env`)
Salin `.env.example` menjadi `.env` di root proyek (**jangan pernah commit `.env` ke Git**):

```env
# 1. Pengembangan Lokal (Web):
# Kosongkan agar web memanggil Express same-origin (http://localhost:3000),
# atau isi http://localhost:3000 jika server & Vite dipisah.
#
# 2. Build APK Release (Android):
# WAJIB isi URL HTTPS publik backend yang sudah di-deploy (JANGAN gunakan localhost!).
# Pastikan URL mengembalikan HTTP 200 pada /api/health sebelum build APK.
VITE_API_BASE_URL=

# [OPSIONAL] Set "true" untuk Midtrans Production, atau "false" untuk Sandbox
MIDTRANS_IS_PRODUCTION=false

# [OPSIONAL] Server Key Midtrans dari Dashboard Midtrans (Settings -> Access Keys)
MIDTRANS_SERVER_KEY=
```

> **Penting mengenai status backend**:
> - Autentikasi Google, registrasi pengguna, pembuatan toko otomatis, produk, stok, pelanggan, dan transaksi langsung memakai **Firebase Auth & Cloud Firestore** (`firebase-applet-config.json`), sehingga langsung bekerja di Web maupun APK selama perangkat memiliki internet.
> - Endpoint Express (`server.ts`: `/api/health`, `/api/app/apk-info`, `/api/midtrans/*`) berjalan lokal di `http://localhost:3000`. Untuk APK Android, deploy terlebih dahulu aplikasi/server ini ke Cloud Run (`Shared App`) atau server HTTPS publik Anda agar endpoint backend dapat diakses dari HP Android (bukan `404` atau terhalang halaman login dev preview).

---

## 3. Konfigurasi Google OAuth & Signing Key

### A. Mengaktifkan Login Google pada APK Android (Penting untuk Produksi)
Aplikasi Web dan APK menggunakan Firebase project `brave-tranquility-8drm3` dengan Web Client ID di `firebase-applet-config.json` (`oAuthClientId`).
Agar **Google Sign-In Native** (Credential Manager) di dalam file APK berjalan di semua HP Android:

1. Dapatkan **SHA-1** dan **SHA-256** dari keystore release yang dipakai menandatangani APK:
   ```bash
   keytool -list -v -keystore android/kasir-umkm-release.jks -alias kasirumkm
   ```
   Nilai fingerprint dari keystore release saat ini (`android/kasir-umkm-release.jks`):
   - **SHA-1**: `98:78:BE:84:49:22:2E:37:7B:23:40:9E:DC:64:D7:4E:4E:44:1D:9E`
   - **SHA-256**: `1B:25:C5:9D:06:14:63:F3:23:53:71:E2:BF:33:B9:FC:28:32:19:6C:A0:DB:FC:F3:AE:24:EC:E4:9E:FE:AD:B8`
2. Buka **Firebase Console** -> pilih proyek `brave-tranquility-8drm3` -> **Project Settings** -> **Your apps** -> **Add app (Android)**.
3. Masukkan Android package name: `com.aistudio.kasirumkm.qzvtmk`.
4. Tempelkan **SHA-1** dan **SHA-256** di atas pada pengaturan Android App di Firebase Console.
5. Simpan perubahan (bila memakai `google-services.json`, letakkan di `android/app/google-services.json`; untuk autentikasi Credential Manager saat ini sudah langsung membaca `oAuthClientId` dari `firebase-applet-config.json` selama **Package Name + SHA-1** sudah terdaftar di proyek Firebase/Google Cloud yang sama).
6. *(Opsional)* Jika ingin memakai tab **Email & Sandi**, buka **Firebase Console -> Authentication -> Sign-in method** lalu aktifkan **Email/Password**.

### B. Mengelola Release Keystore Sendiri
File `android/keystore.properties` berisi konfigurasi penandatanganan APK (di-ignore oleh `.gitignore`):
```properties
storeFile=../kasir-umkm-release.jks
storePassword=<ISI_PASSWORD_KEYSTORE_ANDA>
keyAlias=kasirumkm
keyPassword=<ISI_PASSWORD_KEY_ANDA>
```
> **Penting**: Simpan file `.jks` dan password Anda di tempat aman. Setiap update versi APK di masa depan **wajib** memakai keystore yang sama agar pengguna Android bisa langsung memperbarui aplikasi tanpa menghapus data.

---

## 4. Cara Build Ulang APK Release

1. Pastikan dependensi terpasang:
   ```bash
   npm install
   ```
2. Build web bundle & sinkronkan ke proyek Capacitor Android:
   ```bash
   npm run build
   npx cap sync android
   ```
3. Build APK Release bertanda tangan melalui Gradle:
   ```bash
   cd android
   ./gradlew assembleRelease
   ```
4. File APK output tersedia di:
   `android/app/build/outputs/apk/release/app-release.apk`
5. Salin ke folder distribusi server agar dapat diunduh lewat browser HP (di luar `public/` agar tidak ikut terbungkus ulang ke dalam APK):
   ```bash
   mkdir -p downloads
   cp android/app/build/outputs/apk/release/app-release.apk downloads/kasir-umkm-release.apk
   ```

---

## 5. Panduan Instalasi APK di HP Android (Tanpa USB)

1. Buka browser Chrome/Android di HP Anda dan akses URL aplikasi atau link langsung:
   `<URL_APLIKASI>/downloads/kasir-umkm-release.apk`
2. Tunggu hingga file `kasir-umkm-release.apk` selesai diunduh.
3. Ketuk notifikasi unduhan selesai atau buka folder **Downloads / File Manager**, lalu ketuk `kasir-umkm-release.apk`.
4. Jika muncul peringatan keamanan, pilih **Pengaturan (Settings)** -> aktifkan **Izinkan dari sumber ini (Allow from this source)** untuk browser Anda, lalu kembali dan tekan **Install**.
5. Setelah terpasang, ketuk **Buka (Open)**.
6. Login dengan akun Google -> isi **Nama Toko, Jenis Usaha, Alamat, dan Nomor WhatsApp** -> tekan **SIMPAN PENGATURAN & MASUK DASHBOARD**.

---

## 6. Opsi Distribusi Lainnya

- **Download Langsung dari Aplikasi / Website**: Sudah aktif melalui endpoint `/downloads/kasir-umkm-release.apk` dan tombol **Unduh APK** di halaman Login & Pengaturan Toko.
- **Google Play Store (Tahap Lanjutan)**: Jalankan `./gradlew bundleRelease` di folder `android/` untuk menghasilkan file `.aab` (`android/app/build/outputs/bundle/release/app-release.aab`) yang siap diunggah ke Google Play Console.

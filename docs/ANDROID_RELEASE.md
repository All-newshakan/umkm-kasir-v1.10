# Panduan build dan rilis APK KASIR UMKM

## GitHub Actions secrets

Sebelum workflow Android APK dapat membuat APK yang terhubung ke database, tambahkan secrets berikut di Settings > Secrets and variables > Actions:

- `VITE_SUPABASE_URL`: Project URL Supabase (HTTPS).
- `VITE_SUPABASE_ANON_KEY`: Supabase publishable/anon key. Jangan gunakan service-role key.
- `VITE_MIDTRANS_PROXY_URL`: URL HTTPS backend Express yang sudah dideploy dan dapat diakses publik. Wajib untuk pembayaran Midtrans dinamis; boleh kosong bila hanya menguji tunai dan QRIS/transfer manual.
- Untuk APK rilis bertanda tangan, tambahkan `ANDROID_KEYSTORE_BASE64`, `ANDROID_STORE_PASSWORD`, `ANDROID_KEY_ALIAS`, dan `ANDROID_KEY_PASSWORD`.

Jangan pernah menyimpan Supabase service-role key atau Midtrans Server Key di aplikasi Android, source frontend, atau GitHub repository. Simpan Midtrans Server Key hanya sebagai environment variable backend `MIDTRANS_SERVER_KEY`. Set `MIDTRANS_IS_PRODUCTION=false` untuk pengujian Sandbox.

## Google Sign-In Android

Di Supabase Dashboard > Authentication > URL Configuration, tambahkan redirect URL berikut:

`com.aistudio.kasirumkm.qzvtmk://login-callback`

Aktifkan Google provider di Authentication > Providers dan isi OAuth Client ID/Secret Google yang sesuai. Pastikan konfigurasi OAuth mengizinkan callback Supabase project URL. Uji login dari perangkat Android fisik; browser harus kembali ke aplikasi melalui deep link.

## Database Supabase

Jika skema database belum pernah dipasang, jalankan `supabase/migrations/001_kasir_umkm_schema.sql` satu kali melalui Supabase Dashboard > SQL Editor. Jangan jalankan ulang pada database produksi tanpa backup dan peninjauan migrasi.

## Build APK

Workflow `Android APK` menjalankan pemeriksaan TypeScript, build web, Capacitor sync, lalu Gradle `assembleDebug`. Jika berhasil, unduh artifact `KASIR-UMKM-Android-APK` dari halaman run GitHub Actions. File di dalam artifact bernama `app-debug.apk` dan dapat dipasang pada perangkat Android untuk pengujian.

## Sebelum rilis publik

- Uji login email dan Google, pendaftaran, onboarding toko, serta sesi setelah aplikasi ditutup/dibuka.
- Uji produk, stok, transaksi tunai, QRIS manual, transfer manual, laporan, dan pergantian toko.
- Uji Midtrans Sandbox termasuk pembayaran berhasil, pending, gagal, kedaluwarsa, dan callback/webhook.
- Terapkan verifikasi webhook Midtrans di backend sebelum mengaktifkan pembayaran produksi.
- Buat Android release signing key dan simpan sebagai GitHub Actions secrets; jangan commit ke repository.
- Build APK release bertanda tangan, uji instalasi/upgrade, dan simpan signing key dengan aman.

Jika signing secrets belum tersedia, workflow hanya menghasilkan APK debug untuk pengujian. Jika keempat signing secrets tersedia, workflow juga menghasilkan APK release bertanda tangan. Simpan keystore asli dan kata sandinya secara aman; jangan commit ke repository. Jangan membuat keystore baru untuk setiap update karena pengguna tidak dapat memasang pembaruan di atas aplikasi yang ditandatangani dengan kunci berbeda.

# Panduan build dan rilis APK KASIR UMKM

## GitHub Actions secrets

Sebelum workflow Android APK dapat membuat APK yang terhubung ke database, tambahkan secrets berikut di Settings > Secrets and variables > Actions:

- `VITE_SUPABASE_URL`: Project URL Supabase (HTTPS).
- `VITE_SUPABASE_ANON_KEY`: Supabase publishable/anon key. Jangan gunakan service-role key.
- `VITE_MIDTRANS_PROXY_URL`: URL HTTPS backend Express yang sudah dideploy dan dapat diakses publik. Wajib untuk pembayaran Midtrans dinamis; boleh kosong bila hanya menguji tunai dan QRIS/transfer manual.

Jangan pernah menyimpan Supabase service-role key atau Midtrans Server Key di aplikasi Android, source frontend, atau GitHub repository. Simpan Midtrans Server Key hanya sebagai environment variable backend `MIDTRANS_SERVER_KEY`. Set `MIDTRANS_IS_PRODUCTION=false` untuk pengujian Sandbox.

## Google Sign-In Android

Di Supabase Dashboard > Authentication > URL Configuration, tambahkan redirect URL berikut:

`com.aistudio.kasirumkm.qzvtmk://login-callback`

Aktifkan Google provider di Authentication > Providers dan isi OAuth Client ID/Secret Google yang sesuai. Pastikan konfigurasi OAuth mengizinkan callback Supabase project URL. Uji login dari perangkat Android fisik; browser harus kembali ke aplikasi melalui deep link.

## Build APK

Workflow `Android APK` menjalankan pemeriksaan TypeScript, build web, Capacitor sync, lalu Gradle `assembleDebug`. Jika berhasil, unduh artifact `KASIR-UMKM-Android-APK` dari halaman run GitHub Actions. File di dalam artifact bernama `app-debug.apk` dan dapat dipasang pada perangkat Android untuk pengujian.

## Sebelum rilis publik

- Uji login email dan Google, pendaftaran, onboarding toko, serta sesi setelah aplikasi ditutup/dibuka.
- Uji produk, stok, transaksi tunai, QRIS manual, transfer manual, laporan, dan pergantian toko.
- Uji Midtrans Sandbox termasuk pembayaran berhasil, pending, gagal, kedaluwarsa, dan callback/webhook.
- Terapkan verifikasi webhook Midtrans di backend sebelum mengaktifkan pembayaran produksi.
- Buat Android release signing key dan simpan sebagai GitHub Actions secrets; jangan commit ke repository.
- Build APK release bertanda tangan, uji instalasi/upgrade, dan simpan signing key dengan aman.

APK debug dari workflow ini ditujukan untuk pengujian terkontrol, bukan distribusi publik final.

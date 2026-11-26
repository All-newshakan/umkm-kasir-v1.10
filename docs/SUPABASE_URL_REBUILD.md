# Supabase URL configuration for Android builds

Set the GitHub Actions secret `VITE_SUPABASE_URL` to the Supabase project root URL, without `/rest/v1/` or a trailing slash.

The Android APK embeds Vite environment values at build time. After changing this secret, a new workflow run is required before installing the updated APK.

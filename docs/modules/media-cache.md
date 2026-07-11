# Module: Media Cache

## Purpose

Owns cover image lazy loading, Android-native cover caching, idle/preemptive cover preloading, export-safe cover source resolution, cover cache size reporting, cache clearing, and cover/gallery save helpers.

## Main Files

- `src/components/LazyCoverImage.vue`: lazy cover component, intersection observer, native cache resolution, retry after cache invalidation, loading/fallback UI.
- `src/lib/cover-cache.ts`: Android-native cover cache directory, metadata validation, inflight load dedupe, decode checks, cache size, invalidation, and clearing.
- `src/lib/cover-preload.ts`: idle/preemptive cover warming with dedupe, concurrency, and optional timeout.
- `src/lib/mdb-assets.ts`: remote MDB cover URL construction from the cover flag and index revision.
- `src/lib/b50-export.ts`: export-safe image source conversion and native temporary cache for html2canvas.
- `src/lib/native-image-saver.ts`: browser download or Android `ImageSaver` plugin wrapper for saving image sources.
- `src/views/HomeView.vue`: visible and cached skill cover preload targets.
- `src/views/B50View.vue`: B50 preview/export cover maps.
- `src/views/SongDetailView.vue`: cover lightbox and save-to-gallery flow.
- `src/views/ChartPreviewView.vue`: annotation screenshot export cover source resolution.
- `src/views/SettingsView.vue`: cover cache size display and clear action.
- `android/app/src/main/java/com/gddata/gitadora/ImageSaverPlugin.java`: native MediaStore image save implementation.

## Data Flow

1. Song/catalog code resolves cover URLs from the unified MDB cover flag and fixed R2 object path.
2. Views pass source URLs and cache keys to `LazyCoverImage.vue` or export helpers.
3. `LazyCoverImage.vue` waits until visible unless `eager` is set.
4. On Android with a remote source and cache key, `resolveCoverImageSource()` resolves or downloads a cached file under `Directory.Data`.
5. Cached files are validated by metadata, size, content length, and browser image decode.
6. Preload helpers warm likely-needed covers without blocking route rendering.
7. Export helpers convert image sources into data URLs or native-readable cache data before html2canvas.
8. Chart annotation export resolves the song cover through the same export-safe path before rendering the hidden export card.
9. Settings reads cache size and can remove the native cache directory.

## Important Contracts

- Native cover cache is used only when `Capacitor.getPlatform() !== 'web'`, the source is remote, and a cache key exists.
- `createCoverCacheKey()` should be used for stable per-song cache keys.
- MDB cover URLs are derived, not stored per song; change object naming in `src/lib/mdb-assets.ts`.
- Cached cover files have sidecar metadata files; file and metadata validity are checked together.
- Cover downloads write to a temp file first, then rename into the stable cache path.
- Cache failures should degrade to original image URLs where possible.
- Export-safe image sources are not the same as display image sources.

## Common Change Points

- Change lazy loading behavior: start in `src/components/LazyCoverImage.vue`.
- Change native cache validation or storage location: edit `src/lib/cover-cache.ts`.
- Change preload limits or target selection: inspect the owning view and `src/lib/cover-preload.ts`.
- Change B50 or chart-annotation export image handling: inspect `src/lib/b50-export.ts`, `src/views/B50View.vue`, and `src/views/ChartPreviewView.vue`.
- Change cover save-to-gallery behavior: inspect `src/lib/native-image-saver.ts`, `SongDetailView.vue`, and `ImageSaverPlugin.java`.
- Change cache management UI: inspect `src/views/SettingsView.vue`.

## Pitfalls

- Do not assume `Filesystem` APIs exist on web.
- Do not skip decode validation for native cached files; corrupt images should be invalidated.
- Do not let preload failures block user-facing route loading.
- Do not use display-only `convertFileSrc()` URLs blindly for html2canvas export.
- Do not clear cache state without clearing the in-memory resolved source maps.

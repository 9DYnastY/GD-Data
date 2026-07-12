# GD Data AI Context

## Project Summary

GD Data is a Vue 3 + TypeScript + Vite app packaged in a Capacitor Android shell. It supports GITADORA song browsing, local MDB catalog data, BJMANIA score views and persistent play history, B50 export, DTX chart previews, cover/media caching, app updates, and Android-native bridges.

This documentation is an AI navigation layer. It is intentionally smaller than the codebase. Source code remains the authority.

## Architecture Shape

- `src/main.ts`: Vue bootstrap, router install, global press feedback, and remote MDB resource-index preload.
- `src/App.vue`: root shell, route outlet, shared background, bottom navigation, Android back button, and app-update dialog.
- `src/router/index.ts`: route table and scroll restoration.
- `src/views/`: route-level screens and page-owned state.
- `src/components/`: reusable visual components with little cross-route state.
- `src/lib/`: shared domain logic, parsing, caching, export helpers, and platform adapters.
- `src/lib/bjmania/`: BJMANIA auth, HTTP/native transport, gRPC-web/protobuf helpers, parsing, and snapshot cache.
- `src/types/`: shared song and BJMANIA contracts.
- `public/`: URL-addressed runtime assets and data such as local MDB binaries, fonts, background media, and version logos.
- `src/assets/`: Vite-bundled artwork imported by components.
- `android/app/src/main/java/com/gddata/gitadora/`: Capacitor Android plugins, native login, WebView activities, session handling, image saving, and installer handoff.

## Runtime Shape

- Web development uses Vite.
- Deployment uses the Cloudflare Vite plugin and Wrangler scripts in `package.json`.
- Android packaging uses Capacitor with `appId` `com.gddata.gitadora` and `webDir` `dist`.
- There is no Pinia/Vuex store; views own most state with Vue composition primitives.
- Shared state is narrow and explicit, mainly app-update refs and module-level catalog/resource caches.
- Android-only behavior is guarded through `Capacitor.getPlatform()` or small wrapper helpers.

## Read By Task

| Task | Read |
|---|---|
| Song list, search, filters, difficulty ruler, BIN parsing, unified MDB supplements/resources, Remy links, version logos | `docs/modules/song-catalog.md` |
| BJMANIA login, auth, profile, best scores, persistent recent plays, hot songs, protocol parsing | `docs/modules/bjmania.md` |
| B50 poster, B50 score cards, html2canvas export, image output | `docs/modules/b50-export.md` |
| DTX chart preview, MDB chart index, parser, static canvas, realtime playback, A-B loop, drum annotations, annotation export | `docs/modules/chart-preview.md` |
| Cover loading, preload, native cover cache, export-safe image sources | `docs/modules/media-cache.md` |
| Android update manifest, APK download, installer handoff, update dialog | `docs/modules/app-update.md` |
| Capacitor plugins, native BJMANIA transport, native WebView, image saver, Android session bridge | `docs/modules/android-bridge.md` |

## Common Source Entry Points

| Area | Start Here |
|---|---|
| App shell and route transitions | `src/App.vue` |
| Route definitions | `src/router/index.ts` |
| Song catalog state | `src/lib/song-catalog.ts` |
| Song normalization | `src/lib/song-normalizer.ts` |
| BJMANIA snapshot | `src/lib/bjmania/client.ts` |
| BJMANIA runtime dispatch | `src/lib/bjmania/http.ts` |
| BJMANIA local play history | `src/lib/bjmania/recent-history.ts` |
| Play-history calendar helpers | `src/lib/bjmania/recent-history-calendar.ts` |
| Snapshot + history merge | `src/lib/bjmania/snapshot-persistence.ts` |
| Global transient messages | `src/lib/app-toast.ts`, `src/components/AppToast.vue` |
| Shared Skill/history top bar | `src/components/AppPrimaryTopBar.vue` |
| Play-history calendar UI | `src/components/RecentHistoryCalendar.vue` |
| B50 selection | `src/lib/b50.ts` |
| Image export | `src/lib/b50-export.ts` |
| Cover cache | `src/lib/cover-cache.ts` |
| DTX loading | `src/lib/chart-preview-loader.ts` |
| Chart audio playback | `src/lib/chart-preview-audio.ts` |
| Chart A-B loop range | `src/lib/chart-preview-loop.ts` |
| Unified MDB index/cache | `src/lib/mdb-index.ts` |
| Unified MDB resource URLs | `src/lib/mdb-assets.ts` |
| Android plugin registration | `android/app/src/main/java/com/gddata/gitadora/MainActivity.java` |

## Working Rules For AI

- Read this file first, then the relevant module doc.
- Treat `.planning/codebase/*.md` as generated reference snapshots, not maintained docs.
- Read current source files before making claims or changing docs.
- Keep docs navigational: paths, ownership, data flow, invariants, and pitfalls.
- Keep route-specific loading/error/filter state inside the owning route view unless an existing shared module already owns it.
- Prefer existing wrappers over direct Capacitor plugin calls from views.
- Preserve web/native runtime splits; many helpers intentionally degrade to web fallbacks.
- Keep public URL assets in `public/` when code fetches or references `/...` paths.
- Keep imported UI artwork in `src/assets/`.
- Do not hand-edit generated build output, `.planning/codebase/*.md`, `dist/`, or `node_modules/`.

## Project-Specific Pitfalls

- `first_ver` in MDB data contains separate GF/DM version values; version filters must respect the selected instrument family.
- The unified MDB index is remote R2 data; local BIN parsing remains the song metadata authority.
- BJMANIA web and Android runtimes use different transport paths but should return the same frontend data contracts.
- BJMANIA recent plays are an upstream rolling window. Every successful live snapshot is merged into an account-scoped IndexedDB history; never replace the accumulated store with only the latest response.
- The play-history route always displays one selected local day (default today) and does not support an unselected all-entries mode.
- History monthly stats ignore search; day heatmap intensity and the selected-day list still honor search.
- History list pages of 50 auto-load near the bottom via IntersectionObserver; do not reintroduce a load-more button.
- Calendar day cells opt out of global press-feedback so selected float/glow is not delayed by WAAPI transform animations.
- Native BJMANIA binary fetches are intentionally restricted to trusted HTTPS BJMANIA asset hosts.
- Cover cache behavior is Android-native only; web display should continue to work without native cache APIs.
- Export image paths must be html2canvas-safe and often need data URLs or native cache conversion.
- App update auto prompts are Android-only and throttled in localStorage.
- DTX chart preview has separate static and realtime renderers; do not mix their canvas sizing, gesture, or playback assumptions.
- DTX chart preview only exposes charts present in both unified MDB resources and official BIN difficulty data.
- Chart audio uses a shared Web Audio context and keeps only the active decoded track; do not reintroduce `HTMLAudioElement.currentTime` as the realtime chart clock or cache decoded songs.
- Drum chart annotations are tied to the exact DTX chart URL and are exported through the shared image-export/native image-save pipeline.
- Chart bookmarks are shared by A-B playback and annotation export. A valid range enables export even when it contains no L/R annotations, and playback clamps the range to the active audio/DTX timeline.
- Some user-facing Chinese strings in source currently contain mojibake; do not rewrite broad text encoding while doing unrelated changes.

## Verification Hints

- Use `rg --files` or `Test-Path` to confirm documented paths.
- Use `npm run build` for TypeScript/Vite validation when code changes.
- Use `node --test tests/chart-preview-loop.test.mjs` for A-B range and seek logic.
- Use `node --test tests/bjmania-recent-history.test.mjs` for recent-play identity and normalization logic.
- Use `node --test tests/bjmania-recent-history-calendar.test.mjs` for calendar date ranges and month grids.
- Use Android/Capacitor checks only when native plugin behavior changes.
- For docs-only changes, path existence checks are usually enough.

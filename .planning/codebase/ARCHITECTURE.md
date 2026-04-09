# Architecture

**Analysis Date:** 2026-04-09

## Pattern Overview

**Overall:** Route-driven Vue single-page application inside a Capacitor Android shell, with feature utilities in `src/lib/` and native BJMANIA bridge code in `android/app/src/main/java/com/gddata/gitadora/`.

**Key Characteristics:**
- App bootstrap is thin: `index.html` mounts `src/main.ts`, and `src/main.ts` only wires `src/App.vue`, `src/router/index.ts`, and `src/style.css`.
- Route views in `src/views/` own screen state, loading, filtering, and user interaction; shared rendering lives in `src/components/`.
- Data access stays client-side. The app reads the song catalog from `public/M32_mdb_11_merged_remy.json`, calls BJMANIA from `src/lib/bjmania/`, and bridges native-only behavior through Capacitor plugins registered in `android/app/src/main/java/com/gddata/gitadora/MainActivity.java`.

## Layers

**Bootstrap and Shell:**
- Purpose: Start the Vue app, provide shared chrome, and attach Android-specific shell behavior.
- Location: `index.html`, `src/main.ts`, `src/App.vue`
- Contains: DOM mount point, root app creation, shared background video/poster, bottom navigation, Android back-button handling.
- Depends on: `src/router/index.ts`, `src/components/AppBottomNav.vue`, `@capacitor/app`, `@capacitor/core`
- Used by: Every routed screen.

**Routing and Screens:**
- Purpose: Map URLs to screens and keep page-level state close to the page.
- Location: `src/router/index.ts`, `src/views/HomeView.vue`, `src/views/SkillView.vue`, `src/views/B50View.vue`, `src/views/SongDetailView.vue`
- Contains: Lazy-loaded routes, page-local refs/computed/watchers, loading and error states, filter/search logic, route-query driven mode switches.
- Depends on: `src/components/`, `src/lib/`, `src/types/`
- Used by: `src/App.vue` through `<RouterView />`.

**Reusable UI Components:**
- Purpose: Render reusable cards, grids, nav, and board widgets without owning application-wide state.
- Location: `src/components/`
- Contains: Visual building blocks such as `src/components/SongCard.vue`, `src/components/DifficultyGrid.vue`, `src/components/SkillScoreCard.vue`, `src/components/B50Poster.vue`, `src/components/LazyCoverImage.vue`
- Depends on: `src/types/`, selective helpers in `src/lib/`, and bundled assets in `src/assets/`
- Used by: Route views in `src/views/`

**Song Catalog Domain and Normalization:**
- Purpose: Fetch the static song dataset once and convert raw JSON into UI-ready models.
- Location: `src/lib/song-catalog.ts`, `src/lib/song-normalizer.ts`, `src/types/song.ts`
- Contains: Catalog fetch memoization, raw-to-view-model normalization, difficulty slot shaping, search/sort fields, cover cache key generation.
- Depends on: `public/M32_mdb_11_merged_remy.json`, `src/lib/cover-cache.ts`
- Used by: `src/views/HomeView.vue`, `src/views/SongDetailView.vue`, `src/views/SkillView.vue`, `src/views/B50View.vue`

**BJMANIA Integration and Protocol Adaptation:**
- Purpose: Talk to BJMANIA, parse mixed JSON/gRPC/protobuf responses, and project them into score/recent-play view models.
- Location: `src/lib/bjmania/client.ts`, `src/lib/bjmania/http.ts`, `src/lib/bjmania/cache.ts`, `src/lib/bjmania/grpc-web.ts`, `src/lib/bjmania/protobuf.ts`, `src/lib/bjmania/native-api.ts`, `src/lib/bjmania/native-auth.ts`, `src/types/bjmania.ts`
- Contains: HTTP transport selection, protobuf encode/decode, snapshot assembly, localStorage cache, score/recent mapping, native plugin wrappers.
- Depends on: Web `fetch`, Capacitor plugin registration, BJMANIA endpoints, `src/types/song.ts`
- Used by: `src/views/SkillView.vue`, `src/views/B50View.vue`, `src/lib/b50.ts`

**Media Cache and Export Pipeline:**
- Purpose: Resolve remote cover art for both live rendering and poster export, then save rendered output on web or native.
- Location: `src/lib/cover-cache.ts`, `src/lib/b50-export.ts`, `src/lib/b50.ts`
- Contains: Native cover file cache, export-safe image resolution, html2canvas rendering, B50 poster sizing and row bucketing.
- Depends on: `@capacitor/filesystem`, `@capacitor/file-transfer`, `html2canvas`, `src/components/B50Poster.vue`
- Used by: `src/components/LazyCoverImage.vue`, `src/views/SkillView.vue`, `src/views/B50View.vue`

**Native Android Shell and Plugins:**
- Purpose: Host the web app, preserve BJMANIA login session, and expose native BJMANIA operations to the Vue layer.
- Location: `android/app/src/main/java/com/gddata/gitadora/MainActivity.java`, `android/app/src/main/java/com/gddata/gitadora/BjmaniaAuthPlugin.java`, `android/app/src/main/java/com/gddata/gitadora/BjmaniaApiPlugin.java`, `android/app/src/main/java/com/gddata/gitadora/BjmaniaSessionManager.java`, `android/app/src/main/java/com/gddata/gitadora/BjmaniaLoginActivity.java`, `android/app/src/main/java/com/gddata/gitadora/BjmaniaCookieJar.java`
- Contains: Capacitor plugin registration, embedded WebView login flow, OkHttp session reuse, cookie sync between WebView and native HTTP calls, host allowlist for binary fetches.
- Depends on: Capacitor Android, OkHttp, Android WebView and cookie manager.
- Used by: `src/lib/bjmania/native-auth.ts`, `src/lib/bjmania/native-api.ts`, and indirectly `src/lib/bjmania/http.ts`

## Data Flow

**Song Catalog Flow:**

1. `src/views/HomeView.vue`, `src/views/SongDetailView.vue`, `src/views/SkillView.vue`, and `src/views/B50View.vue` call `loadSongCatalog()` or `loadSongByMusicId()` from `src/lib/song-catalog.ts`.
2. `src/lib/song-catalog.ts` fetches `public/M32_mdb_11_merged_remy.json` once, memoizes the promise, and maps `mdb_data` through `normalizeSong()` in `src/lib/song-normalizer.ts`.
3. `src/lib/song-normalizer.ts` produces `SongViewModel` records from `src/types/song.ts`, adding derived search text, display labels, difficulty slots, tags, and cover metadata consumed by components.

**BJMANIA Snapshot Flow:**

1. `src/views/SkillView.vue` and `src/views/B50View.vue` start from `loadBjmaniaSkillSnapshotCache()` in `src/lib/bjmania/cache.ts` for fast restore, then call `loadBjmaniaGitadoraSnapshot()` in `src/lib/bjmania/client.ts`.
2. `src/lib/bjmania/client.ts` resolves auth state, profiles, profile details, best scores, recent plays, and hot song IDs through `src/lib/bjmania/http.ts`, `src/lib/bjmania/grpc-web.ts`, and `src/lib/bjmania/protobuf.ts`.
3. The snapshot is mapped into `BjmaniaScoreListItem[]` and `BjmaniaRecentListItem[]`, then persisted back through `saveBjmaniaSkillSnapshotCache()` for later reuse.

**Transport Selection Flow:**

1. `src/lib/bjmania/http.ts` decides between plain web `fetch` and native Capacitor plugin calls by checking `isNativeBjmaniaApi()` and `isNativeBjmaniaHttp()`.
2. Web runtime sends cookies with `credentials: 'include'`; native runtime delegates to `BjmaniaApiPlugin` and `BjmaniaAuthPlugin`.
3. `android/app/src/main/java/com/gddata/gitadora/BjmaniaSessionManager.java` keeps WebView and OkHttp sessions aligned so native calls and embedded login share authentication state.

**Cover and Export Flow:**

1. `src/components/LazyCoverImage.vue` waits for intersection, then resolves source URLs through `src/lib/cover-cache.ts`.
2. `src/lib/cover-cache.ts` keeps native cover downloads in the app data directory and falls back to the original remote URL on failure.
3. `src/views/B50View.vue` and `src/views/SkillView.vue` use `src/lib/b50-export.ts` to resolve export-safe images, render DOM nodes with `html2canvas`, and save to browser download or native documents storage.

## State Management

**State Management:**
- There is no centralized Vue store. No Pinia or Vuex usage is present under `src/`.
- Screen state is local to each route component and stored with `ref()`, `reactive()`, `computed()`, and `watch()` inside `src/views/HomeView.vue`, `src/views/SkillView.vue`, `src/views/B50View.vue`, and `src/views/SongDetailView.vue`.
- Short-lived UI state such as open menus, visible counts, loading flags, and selected modes stays in the owning view.
- Persistent client state is limited to `window.localStorage`: `src/views/HomeView.vue` stores the last search query, and `src/lib/bjmania/cache.ts` stores the latest BJMANIA snapshot payload.
- Route state is also used as state: `src/views/B50View.vue` derives the current family from `route.query.family`, and `src/App.vue` branches shell behavior based on `route.name` and `route.meta.showBottomNav`.

## Key Abstractions

**SongViewModel:**
- Purpose: Normalized, UI-ready representation of a song record.
- Examples: `src/types/song.ts`, `src/lib/song-normalizer.ts`, `src/components/SongCard.vue`
- Pattern: Raw JSON is normalized once, then every consumer reads the same derived shape instead of reinterpreting raw fields.

**BjmaniaGitadoraSnapshot:**
- Purpose: Full authenticated BJMANIA state required by Skill and B50 screens.
- Examples: `src/types/bjmania.ts`, `src/lib/bjmania/client.ts`, `src/lib/bjmania/cache.ts`
- Pattern: Assemble several remote calls into one coarse-grained snapshot, then cache and project it into screen-specific lists.

**BjmaniaScoreListItem / BjmaniaRecentListItem:**
- Purpose: Flatten BJMANIA score protocol data into UI rows with song metadata attached.
- Examples: `src/types/bjmania.ts`, `src/lib/bjmania/client.ts`, `src/components/SkillScoreCard.vue`, `src/components/B50ScoreCard.vue`
- Pattern: Feature-specific view models built on top of shared domain objects.

**Native Plugin Adapters:**
- Purpose: Hide Capacitor registration details behind typed TypeScript wrappers.
- Examples: `src/lib/bjmania/native-api.ts`, `src/lib/bjmania/native-auth.ts`, `android/app/src/main/java/com/gddata/gitadora/BjmaniaApiPlugin.java`, `android/app/src/main/java/com/gddata/gitadora/BjmaniaAuthPlugin.java`
- Pattern: Thin frontend adapter calling a named plugin, with real implementation living in Android Java classes.

**Protocol Utilities:**
- Purpose: Keep protobuf and gRPC-web framing out of page code.
- Examples: `src/lib/bjmania/grpc-web.ts`, `src/lib/bjmania/protobuf.ts`
- Pattern: Low-level transport helpers are isolated under `src/lib/bjmania/` and only consumed by `src/lib/bjmania/client.ts`.

## Entry Points

**Web Document Entry:**
- Location: `index.html`
- Triggers: Browser load, Vite dev server, Capacitor WebView bootstrap.
- Responsibilities: Provide `#app` mount target and load `src/main.ts`.

**Vue Bootstrap Entry:**
- Location: `src/main.ts`
- Triggers: Imported from `index.html`
- Responsibilities: Create the Vue app, install the router, mount `src/App.vue`, and apply `src/style.css`.

**Application Shell Entry:**
- Location: `src/App.vue`
- Triggers: First mounted Vue component.
- Responsibilities: Render the route outlet, decide when to show bottom navigation/shared background, and intercept Android back-button behavior.

**Router Entry:**
- Location: `src/router/index.ts`
- Triggers: Used by `src/main.ts`
- Responsibilities: Define the four routes, lazy-load route views, and restore scroll position.

**Native Host Entry:**
- Location: `android/app/src/main/java/com/gddata/gitadora/MainActivity.java`
- Triggers: Android launcher activity.
- Responsibilities: Register Capacitor plugins and host the built web bundle from `dist/`.

## Error Handling

**Strategy:** Lower-level library modules throw `Error`; route views own `loading` and `error` refs and translate failures into user-visible messages.

**Patterns:**
- Fetch and mapping helpers such as `src/lib/song-catalog.ts` and `src/lib/bjmania/client.ts` throw on non-success responses or invalid upstream state.
- Views such as `src/views/HomeView.vue`, `src/views/SkillView.vue`, `src/views/B50View.vue`, and `src/views/SongDetailView.vue` catch errors, store a message in a local ref, and keep rendering fallback cards.
- Best-effort caches in `src/lib/bjmania/cache.ts`, `src/lib/cover-cache.ts`, and `src/lib/b50-export.ts` swallow storage or download failures and degrade to uncached behavior.
- Native plugins reject invalid input early, for example `android/app/src/main/java/com/gddata/gitadora/BjmaniaApiPlugin.java` refuses non-HTTPS or non-BJMANIA hosts for binary fetches.

## Cross-Cutting Concerns

**Logging:** No centralized web logging layer is present. Web code mainly surfaces errors through UI state; native login/session classes such as `android/app/src/main/java/com/gddata/gitadora/BjmaniaLoginActivity.java` use `Log.d(...)` for runtime diagnostics.

**Validation:** Input validation is local and defensive. Examples include numeric route checks in `src/views/SongDetailView.vue`, protobuf field parsing in `src/lib/bjmania/protobuf.ts`, and binary-host allowlisting in `android/app/src/main/java/com/gddata/gitadora/BjmaniaApiPlugin.java`.

**Authentication:** BJMANIA authentication is session-cookie based. Web login redirects to `BJMANIA_BASE_URL` from `src/lib/bjmania/http.ts`; native login opens `android/app/src/main/java/com/gddata/gitadora/BjmaniaLoginActivity.java`, then `BjmaniaSessionManager` syncs WebView cookies into native OkHttp requests.

---

*Architecture analysis: 2026-04-09*

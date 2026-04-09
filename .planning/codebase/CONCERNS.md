# Codebase Concerns

**Analysis Date:** 2026-04-09

## Highest Priority Next Work

1. Add automated coverage around the BJMANIA login/session bridge, protobuf decoding, score mapping, and B50 export flow in `src/lib/bjmania/*.ts`, `src/views/SkillView.vue`, `src/views/B50View.vue`, and `android/app/src/main/java/com/gddata/gitadora/*.java`.
2. Fix user-facing mojibake strings and remove dead B50 export code in `src/App.vue`, `src/views/HomeView.vue`, `src/views/B50View.vue`, `src/lib/song-catalog.ts`, and `src/views/SkillView.vue`.
3. Harden Android auth/config defaults in `android/app/src/main/AndroidManifest.xml`, `android/app/src/main/res/xml/config.xml`, and `android/app/src/main/java/com/gddata/gitadora/BjmaniaLoginActivity.java`.
4. Add cache freshness and account binding for `src/lib/bjmania/cache.ts`, `src/views/SkillView.vue`, and `src/views/B50View.vue` so stale snapshots do not masquerade as live state.
5. Reduce startup/runtime weight from `public/5_background.mp4`, `public/M32_mdb_11_merged_remy.json`, `src/App.vue`, and `src/views/HomeView.vue`.

## Tech Debt

**Monolithic screen components with mixed responsibilities:**
- Issue: `src/views/SkillView.vue` (1009 lines), `src/views/HomeView.vue` (998 lines), and `src/views/B50View.vue` (614 lines) combine API orchestration, cache restore, router control, export logic, filtering/sorting, DOM observers, template markup, and large scoped CSS in single files.
- Files: `src/views/SkillView.vue`, `src/views/HomeView.vue`, `src/views/B50View.vue`
- Impact: high review cost, fragile edits, duplicated reactive patterns (`IntersectionObserver`, document-level pointer handlers, cache restore/bootstrap flows), and poor unit-testability.
- Fix approach: extract composables for catalog filtering, BJMANIA bootstrap/auth, B50 export, and shared observer utilities; keep page files focused on view composition.

**Dead state and unreachable export branch in Skill page:**
- Issue: `handleGenerateB50()` in `src/views/SkillView.vue` returns immediately after `router.push()`, so the export logic below the early return never executes.
- Files: `src/views/SkillView.vue`
- Impact: `generatingB50`, `b50ExportShellRef`, `b50ExportRow`, and `b50ExportCoverSrc` remain legacy state that increases maintenance cost and misleads future changes.
- Fix approach: delete the unreachable branch or move the in-place export flow behind an explicit feature flag/alternate action.

**Snapshot cache has no freshness or identity policy:**
- Issue: `src/lib/bjmania/cache.ts` stores `savedAt`, but `src/views/SkillView.vue` and `src/views/B50View.vue` restore cached snapshots without checking age, user id, or session generation.
- Files: `src/lib/bjmania/cache.ts`, `src/views/SkillView.vue`, `src/views/B50View.vue`
- Impact: stale or previous-account data can be shown as if it were current, especially after app reopen, expired sessions, or login changes.
- Fix approach: validate cache age and account identity before restore, and define a clear offline-mode policy instead of unconditional replay.

**Custom protocol decoding is hand-maintained and schema-blind:**
- Issue: the BJMANIA integration relies on handwritten gRPC-Web framing and protobuf parsing instead of generated contracts.
- Files: `src/lib/bjmania/client.ts`, `src/lib/bjmania/protobuf.ts`, `src/lib/bjmania/grpc-web.ts`
- Impact: upstream field or wire-format changes can silently corrupt score mapping, hot-song detection, or recent-play decoding.
- Fix approach: capture real payload fixtures, add contract tests, and fail fast on unexpected schema/version changes instead of silently continuing.

## Known Bugs

**User-facing strings are saved in broken encoding:**
- Symptoms: multiple labels and error messages render as mojibake instead of readable Chinese, including the exit toast, search placeholder, catalog load failure, and B50 export messages.
- Files: `src/App.vue`, `src/views/HomeView.vue`, `src/views/B50View.vue`, `src/lib/song-catalog.ts`
- Trigger: any user path that surfaces status text, placeholder text, or failure messaging.
- Workaround: none inside the app; the source strings need to be re-saved with correct encoding and verified in runtime.

**Skill page still carries a broken B50 export code path:**
- Symptoms: the handler navigates to `/skill/b50`, then immediately exits; the legacy export block below it never runs.
- Files: `src/views/SkillView.vue`
- Trigger: tapping the B50 action from the skill page.
- Workaround: users can still reach the dedicated B50 page, but the in-component export branch is dead and should not be trusted.

**B50 page can keep showing stale data after live refresh failure:**
- Symptoms: `bootstrapPage()` restores cached snapshot data first and only shows an error if live hydration fails before any cache was restored.
- Files: `src/views/B50View.vue`, `src/lib/bjmania/cache.ts`
- Trigger: expired BJMANIA session, upstream outage, or network error after a previous successful cached session.
- Workaround: manually sign out and reload; the page has no built-in stale-data indicator or cache age display.

## Security Considerations

**Android backup and wide origin allowances are more permissive than necessary:**
- Risk: `android:allowBackup="true"` allows platform backups of app data, while Cordova config still whitelists `<access origin="*"/>`.
- Files: `android/app/src/main/AndroidManifest.xml`, `android/app/src/main/res/xml/config.xml`
- Current mitigation: native binary fetches are host-restricted in `android/app/src/main/java/com/gddata/gitadora/BjmaniaApiPlugin.java`.
- Recommendations: disable backup for release or explicitly exclude auth/session storage, and replace the wildcard origin allowlist with the minimum host set the app actually needs.

**Login WebView enables broad capabilities and third-party cookies:**
- Risk: the login flow enables JavaScript, DOM storage, database storage, and third-party cookies in `BjmaniaLoginActivity`.
- Files: `android/app/src/main/java/com/gddata/gitadora/BjmaniaLoginActivity.java`
- Current mitigation: `android/app/src/main/java/com/gddata/gitadora/BjmaniaSessionManager.java` normalizes `Referer`, injects XSRF headers, and restricts native binary fetches to HTTPS BJMANIA hosts.
- Recommendations: confirm which capabilities are strictly required, disable third-party cookies if BJMANIA login works without them, and document the minimum safe WebView configuration.

**Local snapshot data is stored in plain `localStorage`:**
- Risk: full skill snapshot data persists in browser storage without encryption, TTL, or user binding.
- Files: `src/lib/bjmania/cache.ts`, `src/views/SkillView.vue`, `src/views/B50View.vue`
- Current mitigation: manual clearing on sign-out in `src/views/SkillView.vue`.
- Recommendations: treat the cache as sensitive profile data, expire it aggressively, and move to secure native storage if long-lived persistence is required.

**Verbose login tracing remains in native code:**
- Risk: `Log.d(...)` in the Android login flow records URLs and auth-probe outcomes.
- Files: `android/app/src/main/java/com/gddata/gitadora/BjmaniaLoginActivity.java`
- Current mitigation: logs are debug-level only.
- Recommendations: gate logs behind build config and strip sensitive flow logging from release builds.

## Performance Bottlenecks

**Entire song catalog is fetched and re-sorted on the main thread:**
- Problem: `src/lib/song-catalog.ts` loads `public/M32_mdb_11_merged_remy.json` (3,885,651 bytes) into memory, normalizes every song in `src/lib/song-normalizer.ts`, and `src/views/HomeView.vue` re-filters/re-sorts the full array reactively on every search/filter/sort change.
- Files: `public/M32_mdb_11_merged_remy.json`, `src/lib/song-catalog.ts`, `src/lib/song-normalizer.ts`, `src/views/HomeView.vue`, `src/views/SongDetailView.vue`
- Cause: all catalog operations happen in a single cached in-memory array on the UI thread, with no debounce, indexing, worker offload, or virtualization.
- Improvement path: precompute searchable indexes, debounce text search, consider workerizing normalization/filtering, and replace repeated linear lookups with keyed maps.

**Bottom-nav pages always preload a 17.1 MB background video:**
- Problem: the shared shell renders `public/5_background.mp4` whenever `route.meta.showBottomNav === true`, with `preload="auto"` and autoplay on mobile.
- Files: `src/App.vue`, `public/5_background.mp4`
- Cause: the shared background is treated as a default shell asset rather than an opt-in enhancement.
- Improvement path: use a static image or low-bitrate variant by default, lazy-enable video for capable devices, and measure startup memory/jank on low-end Android hardware.

**B50 export path multiplies network, file I/O, base64, and canvas work in one interaction:**
- Problem: `src/views/B50View.vue` prepares cover sources concurrently, may download/cache remote images, and then renders a scale-2 `html2canvas` export in `src/lib/b50-export.ts`.
- Files: `src/views/B50View.vue`, `src/lib/b50-export.ts`, `src/lib/cover-cache.ts`, `src/components/LazyCoverImage.vue`
- Cause: preview and export asset preparation are tightly coupled, and export-safe fallbacks expand images into base64/data URLs before canvas rendering.
- Improvement path: split preview vs export pipelines, memoize export-ready assets, cap poster export concurrency, and benchmark memory usage on actual Android devices.

## Fragile Areas

**BJMANIA auth/session bridge spans web, native WebView, and OkHttp cookie state:**
- Files: `src/lib/bjmania/http.ts`, `src/lib/bjmania/native-api.ts`, `src/lib/bjmania/native-auth.ts`, `src/lib/bjmania/client.ts`, `android/app/src/main/java/com/gddata/gitadora/BjmaniaSessionManager.java`, `android/app/src/main/java/com/gddata/gitadora/BjmaniaLoginActivity.java`
- Why fragile: the flow depends on WebView cookies, native cookie mirroring, hand-built CSRF handling, auth probes, and error classification from exception message text.
- Safe modification: change one layer at a time, keep request/response fixtures for `GetProfiles`, `GetGitadoraProfile`, `GetGitadoraMBestScoreEx`, and `/api/auth/me`, and verify both web and native login paths after every change.
- Test coverage: no meaningful integration coverage exists; the only Android unit test is the placeholder `android/app/src/test/java/com/getcapacitor/myapp/ExampleUnitTest.java`.

**Cover resolution and poster export hide failures behind silent fallbacks:**
- Files: `src/lib/cover-cache.ts`, `src/lib/b50-export.ts`, `src/components/LazyCoverImage.vue`, `src/views/B50View.vue`, `src/views/SkillView.vue`
- Why fragile: failures are commonly swallowed, race protection relies on sequence counters, and behavior differs between web and native runtimes.
- Safe modification: return explicit result objects instead of silently falling back to the original source, and add reproducible tests for web/native cover handling and export.
- Test coverage: none.

**Android build output depends on local sync state that is not versioned:**
- Files: `package.json`, `android/.gitignore`
- Why fragile: `npm run android:sync` is the only scripted path that rebuilds web assets and copies them into Android, while `android/.gitignore` excludes `app/src/main/assets/public` and generated config files from version control.
- Safe modification: treat sync as part of every Android build/release pipeline and enforce it in CI or documented release steps.
- Test coverage: no automated check verifies that the Android bundle matches the current web source.

## Scaling Limits

**Catalog and media footprint will hit low-memory devices first:**
- Current capacity: one 3.9 MB song catalog, many cover images, and a 17.1 MB shell video can coexist in the same app process.
- Limit: search/filter interactions and B50 export will degrade or crash sooner on lower-end Android devices than in desktop browsers.
- Scaling path: move heavy catalog work off the main thread, compress shell media, and measure/export within explicit device budgets.

**Version metadata requires source changes for every new game release:**
- Current capacity: version labels and ordering are hard-coded in `src/lib/song-normalizer.ts`.
- Limit: a new GF/DM version lands as an unknown numeric key until the app is rebuilt and redistributed.
- Scaling path: derive version labeling/order from the catalog itself or a version manifest instead of fixed lookup tables.

## Dependencies at Risk

**BJMANIA WebUI / asset contract:**
- Risk: the app depends on undocumented BJMANIA endpoints, protobuf field numbers, and the asset manifest format staying stable.
- Impact: score parsing, hot-song tagging, login, and snapshot hydration in `src/lib/bjmania/client.ts` can break without a package upgrade signal.
- Migration plan: store fixture payloads, version the external contract in tests, and isolate mapping assumptions behind validation helpers.

**`html2canvas`:**
- Risk: poster rendering depends on browser/WebView canvas behavior and cross-origin image support.
- Impact: B50 export can fail or omit covers in `src/lib/b50-export.ts` and `src/views/B50View.vue`.
- Migration plan: evaluate a native share/export path or server-side/off-main-thread composition if export becomes a core feature.

**Tencent captcha script:**
- Risk: web login depends on a third-party script loaded at runtime from `https://turing.captcha.qcloud.com/TCaptcha.js`.
- Impact: `src/lib/bjmania/captcha.ts` becomes a single point of failure for web login when the script is blocked, slow, or changed.
- Migration plan: add user-visible fallback messaging, timeout handling, and a clear web-login recovery path.

## Missing Critical Features

**No automated test or lint gate in the repo root:**
- Problem: `package.json` exposes `dev`, `build`, `preview`, and Capacitor sync/open commands only; no `test` or `lint` script is present, and no `vitest.config.*`, `jest.config.*`, `eslint.config.*`, or `.eslintrc*` file is detected.
- Blocks: safe refactors of search, score mapping, login, and export logic.

**No observability for field failures:**
- Problem: many failure paths intentionally swallow errors or convert them to generic UI text in `src/lib/cover-cache.ts`, `src/lib/b50-export.ts`, `src/lib/bjmania/cache.ts`, `src/views/B50View.vue`, and `src/views/SkillView.vue`.
- Blocks: diagnosing runtime failures from user reports or release builds.

**No explicit stale-data indicator or offline policy:**
- Problem: cached BJMANIA snapshots can be restored without age display, last-refresh status, or account mismatch warning.
- Blocks: trustworthy offline behavior and support workflows for session-expiration bugs.

## Test Coverage Gaps

**BJMANIA login/session bridging:**
- What's not tested: WebView login, cookie transfer into OkHttp, auth probing, sign-out clearing, and native/web runtime differences.
- Files: `src/lib/bjmania/http.ts`, `src/lib/bjmania/native-api.ts`, `src/lib/bjmania/native-auth.ts`, `android/app/src/main/java/com/gddata/gitadora/BjmaniaSessionManager.java`, `android/app/src/main/java/com/gddata/gitadora/BjmaniaLoginActivity.java`
- Risk: login regressions will only surface on device after release.
- Priority: High

**Protocol decoding and score mapping:**
- What's not tested: gRPC-Web frame decoding, protobuf field extraction, hot-song manifest handling, and skill-row derivation.
- Files: `src/lib/bjmania/grpc-web.ts`, `src/lib/bjmania/protobuf.ts`, `src/lib/bjmania/client.ts`
- Risk: upstream contract drift can silently corrupt skill calculations and song classification.
- Priority: High

**B50 export and cover caching:**
- What's not tested: native cache path resolution, export-safe cover fallback, poster export success/failure, and large-poster memory behavior.
- Files: `src/lib/cover-cache.ts`, `src/lib/b50-export.ts`, `src/components/LazyCoverImage.vue`, `src/views/B50View.vue`, `src/views/SkillView.vue`
- Risk: export bugs remain device-specific and hard to reproduce.
- Priority: High

**Catalog filtering, sorting, and detail routing:**
- What's not tested: `HomeView` filter combinations, version ordering, difficulty sorting, and `SongDetailView` route changes.
- Files: `src/views/HomeView.vue`, `src/views/SongDetailView.vue`, `src/lib/song-catalog.ts`, `src/lib/song-normalizer.ts`
- Risk: subtle ranking/filter regressions will not be caught before release.
- Priority: Medium

---

*Concerns audit: 2026-04-09*

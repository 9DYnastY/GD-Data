# External Integrations

**Analysis Date:** 2026-04-09

## APIs & External Services

**Gameplay Account and Score Data:**
- BJMANIA main service (`https://u.bjmania.com`) - session auth, profile lookup, best-score retrieval, and recent-play retrieval for the skill screens.
  - SDK/Client: browser `fetch` wrapper in `src/lib/bjmania/http.ts`; Android OkHttp bridge in `android/app/src/main/java/com/gddata/gitadora/BjmaniaApiPlugin.java` and `android/app/src/main/java/com/gddata/gitadora/BjmaniaSessionManager.java`.
  - Auth: cookie-backed session with CSRF propagation; the web client sends `credentials: 'include'` in `src/lib/bjmania/http.ts`, and the Android bridge mirrors WebView cookies plus `X-XSRF-TOKEN` in `android/app/src/main/java/com/gddata/gitadora/BjmaniaSessionManager.java`.
  - API surface: `/api/auth/login`, `/api/auth/me`, `/api/WebUI/GetProfiles`, `/api/WebUI/GetGitadoraProfile`, `/api/WebUI/GetGitadoraMBestScoreEx`, and `/api/WebUI/GetRecentPlays` are called from `src/lib/bjmania/client.ts`.

**Remote Binary Assets:**
- BJMANIA assets host (`https://assets.bjmania.com/mdb`) - hot-song manifests and `.bin` payloads for skill filtering.
  - SDK/Client: binary downloader in `src/lib/bjmania/client.ts` via `bjmaniaBinaryRequest()` from `src/lib/bjmania/http.ts`.
  - Auth: none required in the web path; the Android native path still routes through the guarded native plugin in `android/app/src/main/java/com/gddata/gitadora/BjmaniaApiPlugin.java`.
  - Data pulled: `ver.json` plus versioned `M32_hot_*.bin` assets.

**Human Verification Utility:**
- Tencent Captcha script (`https://turing.captcha.qcloud.com/TCaptcha.js`) - helper for obtaining captcha tickets.
  - SDK/Client: dynamic `<script>` injection in `src/lib/bjmania/captcha.ts`.
  - Auth: public client-side app identifier embedded in `src/lib/bjmania/captcha.ts`; no repo-managed env var or secret file is involved.
  - Wiring state: utility exists, but no current call site under `src/views/*.vue` invokes `requestBjmaniaCaptchaToken()`.

**Reference Links Only:**
- RemyWiki links - song metadata may expose an external RemyWiki page through `rawSong.remy_url`.
  - SDK/Client: no API client detected; links are normalized in `src/lib/song-normalizer.ts` and opened from `src/views/SongDetailView.vue`.
  - Auth: not applicable.

## Data Storage

**Databases:**
- None. No SQL/NoSQL client, ORM, or remote database SDK is declared in `package.json`.

**Data Sources:**
- Static song catalog - `public/M32_mdb_11_merged_remy.json` is fetched at runtime from `src/lib/song-catalog.ts`.
- Remote BJMANIA hot-song binaries - version manifests and `.bin` payloads are fetched from `https://assets.bjmania.com/mdb` in `src/lib/bjmania/client.ts`.

**File Storage:**
- Local filesystem only on Android. `@capacitor/filesystem` stores cached cover files under `Directory.Data` in `src/lib/cover-cache.ts` and temporary export files under `Directory.Cache` in `src/lib/b50-export.ts`.

**Caching:**
- Browser `localStorage` stores the last search term in `src/views/HomeView.vue` and the BJMANIA snapshot cache in `src/lib/bjmania/cache.ts`.
- In-memory promise/value caches are used in `src/lib/song-catalog.ts`, `src/lib/cover-cache.ts`, and `src/lib/bjmania/client.ts`.

## Platform Integrations

**Hybrid Container:**
- Capacitor Android shell - app packaging and plugin registration are driven by `capacitor.config.ts`, `android/capacitor.settings.gradle`, and `android/app/capacitor.build.gradle`.

**Native Capabilities:**
- App lifecycle/back button - `@capacitor/app` is used in `src/App.vue` for Android back-button handling and `App.exitApp()`.
- File download and persistence - `@capacitor/file-transfer` and `@capacitor/filesystem` are used in `src/lib/cover-cache.ts` and `src/lib/b50-export.ts`.
- Custom native login bridge - `src/lib/bjmania/native-auth.ts` calls the `BjmaniaAuth` plugin implemented in `android/app/src/main/java/com/gddata/gitadora/BjmaniaAuthPlugin.java` and `android/app/src/main/java/com/gddata/gitadora/BjmaniaLoginActivity.java`.
- Custom native HTTP/gRPC bridge - `src/lib/bjmania/native-api.ts` calls the `BjmaniaApi` plugin implemented in `android/app/src/main/java/com/gddata/gitadora/BjmaniaApiPlugin.java`.

**Optional Platform Hooks:**
- Google Services plugin wiring exists in `android/build.gradle` and `android/app/build.gradle`, but `google-services.json` and `android/app/google-services.json` are not present, so push-related integration is not configured.

## Authentication & Identity

**Auth Provider:**
- BJMANIA session auth.
  - Implementation: the web flow redirects the browser to `BJMANIA_BASE_URL` from `src/views/SkillView.vue`; the Android flow opens `BjmaniaLoginActivity` through `openBjmaniaNativeLogin()` in `src/lib/bjmania/native-auth.ts`.

**Session Handling:**
- Web - `src/lib/bjmania/http.ts` uses `fetch(..., { credentials: 'include' })` so cookies stay browser-managed.
- Android - `android/app/src/main/java/com/gddata/gitadora/BjmaniaSessionManager.java` syncs cookies between `CookieManager` and a custom OkHttp `CookieJar`, injects `Referer` and XSRF headers, and probes `/api/auth/me` before reusing a stored session.

## Network Boundary

**Outgoing Network Calls:**
- Application-originated HTTPS traffic targets `https://u.bjmania.com` and `https://assets.bjmania.com` from `src/lib/bjmania/http.ts` and the Java bridge files under `android/app/src/main/java/com/gddata/gitadora/`.
- Browser script loading can reach `https://turing.captcha.qcloud.com/TCaptcha.js` from `src/lib/bjmania/captcha.ts`.
- Song detail pages can open external RemyWiki links from `src/views/SongDetailView.vue`.

**Native Restrictions:**
- `android/app/src/main/java/com/gddata/gitadora/BjmaniaApiPlugin.java` allows `fetchBinary()` only for HTTPS URLs whose host is `u.bjmania.com` or `assets.bjmania.com`.
- `android/app/src/main/AndroidManifest.xml` declares `android.permission.INTERNET` and no additional dangerous runtime permissions.

## Monitoring & Observability

**Error Tracking:**
- None detected. No Sentry, Crashlytics, LogRocket, or similar SDK is declared in `package.json` or `android/build.gradle`.

**Logs:**
- Browser-side failures are surfaced as UI error messages in `src/views/SkillView.vue` and `src/views/SongDetailView.vue`.
- Android-side login flow uses `Log.d` statements in `android/app/src/main/java/com/gddata/gitadora/BjmaniaLoginActivity.java`.

## CI/CD & Deployment

**Hosting:**
- No managed hosting platform is configured in the repo. The web bundle is produced by `npm run build` into `dist/`, then packaged into Android assets through Capacitor sync.

**CI Pipeline:**
- None detected. No GitHub Actions, GitLab CI, or other pipeline configuration files are present at the repo root.

## Environment Configuration

**Required env vars:**
- None detected in code or config. No `.env*` files are present at the repository root.

**Secrets location:**
- No secret file is committed for the active integrations. Optional Google Services credentials are absent (`google-services.json` not present).

## Webhooks & Callbacks

**Incoming:**
- None. No webhook endpoints, callback servers, or inbound HTTP handlers are implemented in the repo.

**Outgoing:**
- Browser redirect to the BJMANIA login origin occurs in `src/views/SkillView.vue`.
- External RemyWiki links are opened from `src/views/SongDetailView.vue`.

---

*Integration audit: 2026-04-09*

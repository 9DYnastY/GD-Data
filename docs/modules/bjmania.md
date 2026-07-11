# Module: BJMANIA

## Purpose

Owns BJMANIA authentication, web/native transport dispatch, gRPC-web/protobuf encoding and decoding, score snapshot loading, profile data, best-score mapping, recent-play mapping, hot-song IDs, and cached skill snapshots.

## Main Files

- `src/views/SkillView.vue`: route owner for login, profile panel, score filters, score list, recent preview, sign-out, version selection, and single-card B50 export.
- `src/views/B50View.vue`: consumes cached/live BJMANIA snapshot for poster rows.
- `src/views/RecentPlayHistoryView.vue`: consumes cached/live BJMANIA snapshot for recent-play history.
- `src/lib/bjmania/client.ts`: main facade, protocol parsers, snapshot assembly, best-score mapping, recent-play mapping, family filters, and skill formatting.
- `src/lib/bjmania/http.ts`: runtime dispatch between web `fetch()` and Android native plugin wrappers.
- `src/lib/bjmania/native-auth.ts`: typed wrapper for the native BJMANIA login activity.
- `src/lib/bjmania/native-api.ts`: typed wrapper for native auth, gRPC, binary fetch, and session clearing.
- `src/lib/bjmania/grpc-web.ts`: gRPC-web frame encode/decode and base64 helpers.
- `src/lib/bjmania/protobuf.ts`: low-level protobuf read/write helpers.
- `src/lib/bjmania/cache.ts`: localStorage snapshot cache keyed by user/version.
- `src/types/bjmania.ts`: shared auth, profile, score, recent-play, and snapshot contracts.
- `android/app/src/main/java/com/gddata/gitadora/Bjmania*.java`: Android login, API plugin, cookie jar, and session manager.

## Data Flow

1. `SkillView.vue` restores `loadBjmaniaSkillSnapshotCache()` for fast first paint.
2. Login uses web BJMANIA requests or `openBjmaniaNativeLogin()` on Android.
3. `loadBjmaniaGitadoraSnapshot()` fetches auth user, profiles, selected GITADORA profile, best scores, recent plays, and hot-song IDs.
4. The snapshot is saved through `saveBjmaniaSkillSnapshotCache()`.
5. `mapBestScoresToList()` and `mapRecentPlaysToList()` attach song catalog metadata and produce route-ready rows.
6. Skill, B50, recent history, and song detail read the mapped row contracts instead of parsing BJMANIA payloads directly.

## Important Contracts

- `BjmaniaGitadoraSnapshot` is the coarse authenticated state object for this module.
- Web runtime uses `fetch()` with browser cookies and `credentials: 'include'`.
- Android runtime goes through `BjmaniaApi` and `BjmaniaAuth` Capacitor plugins.
- Native session state comes from WebView cookies synchronized into OkHttp through `BjmaniaSessionManager`.
- Native binary fetch is restricted to HTTPS and trusted BJMANIA hosts.
- Best-score rows and recent-play rows depend on the current song catalog version to attach metadata.
- Sign-out must clear native/web cookies and remove the cached BJMANIA snapshot.

## Common Change Points

- Add a BJMANIA API call: start in `src/lib/bjmania/client.ts`, then route it through `src/lib/bjmania/http.ts`.
- Change protocol fields: update parsers in `client.ts`, types in `src/types/bjmania.ts`, and any debug rows in views.
- Change Android auth/session behavior: inspect `BjmaniaLoginActivity.java`, `BjmaniaSessionManager.java`, and `BjmaniaApiPlugin.java`.
- Change score filters or sort order: start in `src/views/SkillView.vue`; mapping usually remains in `client.ts`.
- Change B50 eligibility or duplicate handling: inspect `markSkillEntries()` and `mapBestScoresToList()` in `client.ts`.
- Change recent-play display fields: inspect `mapRecentPlaysToList()` and `RecentPlayHistoryView.vue`.

## Pitfalls

- Do not bypass `src/lib/bjmania/http.ts`; it preserves the web/native split.
- Do not parse gRPC/protobuf payloads in Vue views.
- Do not assume cached snapshot version matches the requested MDB version; cache helpers support version filtering.
- Do not loosen native host checks for binary requests without a clear security reason.
- Do not treat unauthorized failures as generic only; `SkillView.vue` has retry and session-clearing behavior.

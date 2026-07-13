# Module: BJMANIA

## Purpose

Owns BJMANIA authentication, web/native transport dispatch, gRPC-web/protobuf encoding and decoding, score snapshot loading, profile data, best-score mapping, account-scoped persistent recent-play history, hot-song IDs, and cached skill snapshots.

## Main Files

- `src/views/SkillView.vue`: route owner for login, profile panel, score filters, score list, sign-out, version selection, and navigation to B50.
- `src/views/B50View.vue`: consumes cached/live BJMANIA snapshot for poster rows.
- `src/views/RecentPlayHistoryView.vue`: native bottom-nav route for account play history; owns day selection, search-filtered day list, infinite scroll paging, month calendar data, and in-place PlayerBoard actions.
- `src/components/AppPrimaryTopBar.vue`: shared Skill/history search and avatar header; Skill opens its filter drawer from search focus, while history filters the selected-day list directly without a secondary drawer.
- `src/components/RecentHistoryCalendar.vue`: year/month wheels, shared expand/collapse with the date grid, Monday-first day cells, relative play-count intensity, single-day selection, and monthly stats.
- `src/components/AppBottomNav.vue`: native primary navigation for catalog, Skill, and play history (shared stroke icon style).
- `src/components/AppToast.vue` and `src/lib/app-toast.ts`: global transient messages for history sync, export, chart preview, settings, and Android back handling.
- `src/lib/bjmania/client.ts`: main facade, protocol parsers, snapshot assembly, best-score mapping, recent-play mapping, family filters, and skill formatting.
- `src/lib/bjmania/http.ts`: runtime dispatch between web `fetch()` and Android native plugin wrappers.
- `src/lib/bjmania/native-auth.ts`: typed wrapper for the native BJMANIA login activity.
- `src/lib/bjmania/native-api.ts`: typed wrapper for native auth, gRPC, binary fetch, and session clearing.
- `src/lib/bjmania/grpc-web.ts`: gRPC-web frame encode/decode and base64 helpers.
- `src/lib/bjmania/protobuf.ts`: low-level protobuf read/write helpers.
- `src/lib/bjmania/cache.ts`: localStorage snapshot cache keyed by user/version.
- `src/lib/bjmania/recent-history.ts`: IndexedDB schema, stable play identity, account isolation, incremental merge, family/time/music indexes, range queries, per-song load, count, and clearing.
- `src/lib/bjmania/song-skill-history.ts`: maps local plays to per-song skill curve points (failed plays at skill 0).
- `src/components/SongSkillHistoryChart.vue`: song-detail “游玩记录” multi-level skill chart (BAS/ADV/EXT/MAS colors), tap-point bubble only.
- `src/lib/bjmania/debug-fake-history.ts`: debug-only in-memory fake plays (id prefix `debug-fake:`); GALAXY WAVE music pool; cleared when debug mode turns off.
- `src/lib/bjmania/recent-history-calendar.ts`: local-time date keys, month grids, day/month timestamp ranges, and month shifting.
- `src/lib/bjmania/snapshot-persistence.ts`: shared persistence coordinator that updates the latest snapshot cache, merges recent plays, tracks unannounced additions by account, and emits them when history syncs.
- `src/types/bjmania.ts`: shared auth, profile, score, recent-play, and snapshot contracts.
- `src/views/SettingsView.vue`: displays and clears accumulated local play history.
- `android/app/src/main/java/com/gddata/gitadora/Bjmania*.java`: Android login, API plugin, cookie jar, and session manager.
- `tests/bjmania-recent-history.test.mjs`: recent-play identity and normalization.
- `tests/bjmania-recent-history-calendar.test.mjs`: calendar range and grid helpers.

## Data Flow

1. `SkillView.vue` restores `loadBjmaniaSkillSnapshotCache()` for fast first paint.
2. Login uses web BJMANIA requests or `openBjmaniaNativeLogin()` on Android.
3. `loadBjmaniaGitadoraSnapshot()` fetches auth user, profiles, selected GITADORA profile, best scores, recent plays, and hot-song IDs.
4. Cached snapshots are passed through `persistBjmaniaSnapshot()`. The localStorage cache keeps the latest fast-start snapshot while the IndexedDB history upserts every returned recent play by account and stable play ID.
5. Skill and B50 live syncs accumulate new records and an account-scoped pending count silently. Entering the history route performs another live sync, combines current additions with that pending count, then shows the global `新增 N条游玩记录` toast once.
   History synchronization has no persistent loading banner; failures are reported through the global error toast while cached/local records remain visible.
6. `mapBestScoresToList()` and `mapRecentPlaysToList()` attach song catalog metadata and produce route-ready rows.
7. The history calendar loads the displayed local month through the account/family/time index.
   - Expand/collapse toggles **both** the date grid and the year/month wheels: expanded shows short vertical wheels (numbers only, fixed `年`/`月` labels); collapsed keeps the same slots with static year/month values.
   - Current year month options stop at today's month.
   - One local day is always selected (defaults to today); selection cannot be cleared. The record list shows only that day.
   - Monthly stats (play count, unique songs, average difficulty, SKILL net change) use the full selected-family month and **ignore** the search box.
   - Day intensity/heatmap and the selected-day list **follow** the history search filter.
   - SKILL net change is latest minus earliest `PlayerSkill` among that month's records (not a sum of `newSkill`).
   - Day cell colors are relative heat: `ratio = dayCount / maxDayCountInMonth`, in four purple levels (0 / ≤0.25 / ≤0.5 / ≤0.75 / >0.75).
8. Selected-day records load completely for that local day, then display in pages of 50. Scrolling near the bottom auto-appends the next page via an IntersectionObserver sentinel (no load-more button).
9. Song detail loads per-song history via `loadBjmaniaRecentHistoryForMusic()` (index `by-user-music-time`). When the user is logged in and the current instrument has local plays, `SongSkillHistoryChart` shows a skill-over-time curve under the difficulty grid. All levels share one chart with difficulty colors; failed plays plot at skill 0; the block is hidden when logged out or empty. Chart title is `游玩记录`.
10. Debug mode (Settings logo easter egg): history route shows a **生成** FAB above the family toggle. Each click appends 30 in-memory fake plays for the selected day/family, using only **GALAXY WAVE** catalog songs. Fakes merge into history UI and song skill charts while debug is on, never touch IndexedDB, and are cleared when debug mode is disabled.
11. Skill, B50, recent history, and song detail read the mapped row contracts instead of parsing BJMANIA payloads directly.

## Important Contracts

- `BjmaniaGitadoraSnapshot` is the coarse authenticated state object for this module.
- Web runtime uses `fetch()` with browser cookies and `credentials: 'include'`.
- Android runtime goes through `BjmaniaApi` and `BjmaniaAuth` Capacitor plugins.
- Native session state comes from WebView cookies synchronized into OkHttp through `BjmaniaSessionManager`.
- Native binary fetch is restricted to HTTPS and trusted BJMANIA hosts.
- Best-score rows and recent-play rows depend on the current song catalog version to attach metadata.
- Sign-out must clear native/web cookies and remove the cached BJMANIA snapshot.
- Sign-out intentionally preserves persistent play history. IndexedDB records are namespaced by BJMANIA user ID and can be cleared explicitly from Settings.
- Recent-play identity uses user, timestamp, music ID, game spec, and sequence; incomplete payloads use a deterministic raw-content fallback. Repeated upstream windows must remain idempotent.
- Persistent records retain the raw content/payload. UI-ready song title, difficulty, and sheet metadata are derived when read so catalog updates can remap old records.
- Play history is a primary native bottom-navigation route to the right of Skill. Its shared search bar filters song title, artist search text, and music ID directly and must not open Skill's filter drawer. Its avatar opens the same PlayerBoard menu in place, including B50, version switching, and sign-out actions.
- Calendar grouping and ranges use the device's local timezone. Do not derive date keys from UTC ISO strings or midnight plays can appear under the wrong day.
- Calendar day buttons opt out of global press-feedback (`data-press-feedback="off"`) so WAAPI transform animations do not delay the selected float/glow.

## Common Change Points

- Add a BJMANIA API call: start in `src/lib/bjmania/client.ts`, then route it through `src/lib/bjmania/http.ts`.
- Change protocol fields: update parsers in `client.ts`, types in `src/types/bjmania.ts`, and any debug rows in views.
- Change Android auth/session behavior: inspect `BjmaniaLoginActivity.java`, `BjmaniaSessionManager.java`, and `BjmaniaApiPlugin.java`.
- Change score filters or sort order: start in `src/views/SkillView.vue`; mapping usually remains in `client.ts`.
- Change B50 eligibility or duplicate handling: inspect `markSkillEntries()` and `mapBestScoresToList()` in `client.ts`.
- Change recent-play display fields: inspect `mapRecentPlaysToList()` and `RecentPlayHistoryView.vue`.
- Change shared Skill/history top-bar layout: inspect `AppPrimaryTopBar.vue`; route-specific search behavior remains owned by each view.
- Change primary route placement or history navigation icons: inspect `AppBottomNav.vue`, `router/index.ts`, and the main-route order in `App.vue`.
- Change recent-play identity, storage indexes, merge rules, pagination, or retention: inspect `recent-history.ts` and `tests/bjmania-recent-history.test.mjs`.
- Change calendar layout, wheels, stats, intensity colors, or expand/collapse: inspect `RecentHistoryCalendar.vue` and `RecentPlayHistoryView.vue`. Change local date boundaries: inspect `recent-history-calendar.ts` and its focused test.
- Change per-song skill curve mapping or colors: inspect `song-skill-history.ts` and `SongSkillHistoryChart.vue`; wire-up lives in `SongDetailView.vue`.
- Change debug fake history generation or isolation: inspect `debug-fake-history.ts`, `debug-mode.ts`, and the history FAB in `RecentPlayHistoryView.vue`.
- Change snapshot persistence or new-record notification behavior: inspect `snapshot-persistence.ts`.
- Change transient toast behavior or appearance: inspect `app-toast.ts` and `AppToast.vue`; do not add route-owned toast timers and styles.

## Pitfalls

- Do not bypass `src/lib/bjmania/http.ts`; it preserves the web/native split.
- Do not parse gRPC/protobuf payloads in Vue views.
- Do not assume cached snapshot version matches the requested MDB version; cache helpers support version filtering.
- Do not loosen native host checks for binary requests without a clear security reason.
- Do not treat unauthorized failures as generic only; `SkillView.vue` has retry and session-clearing behavior.
- Do not key persistent history by the selected MDB version. `GetRecentPlays` is fetched independently of that selection and would otherwise be duplicated across versions.
- Do not delete accumulated history merely because a play is absent from the latest upstream rolling window.
- Local accumulation cannot recover plays that never appeared in a successful fetched window; no background sync is planned.
- Do not apply the history search filter to monthly stats; only heatmap day counts and the selected-day list should follow search.
- Do not reintroduce a load-more button for history; keep infinite scroll via the list sentinel.
- Debug fake history (`debug-fake-history.ts`) is in-memory only, id-prefixed `debug-fake:`, never written to IndexedDB, and is cleared when debug mode turns off. Do not feed fakes into `mergeBjmaniaRecentHistory` or Settings clear/count paths.
- Per-song skill curves use payload `Skill` (failed → 0). Do not plot `newSkill` or account `PlayerSkill` as the Y axis.

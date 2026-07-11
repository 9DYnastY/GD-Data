# Module: Song Catalog

## Purpose

Owns GITADORA song catalog loading, binary MDB parsing, unified MDB supplement lookup, normalized song view models, home-page filtering, detail-page lookup, favorites, Remy links, and version logos.

## Main Files

- `src/views/HomeView.vue`: route owner for catalog search, version/catalog/difficulty filters, selected instrument, sort state, virtualized list entries, cover preloading, and settings navigation.
- `src/components/DifficultyRangeSlider.vue`: draggable 0.5-wide difficulty ruler with 0.1-step left-boundary refinement used by the home filter drawer.
- `src/components/SongCard.vue` and `src/components/DifficultyGrid.vue`: compact song card rendering and matched difficulty-cell highlighting for home-list results.
- `src/views/SongDetailView.vue`: route owner for a single song, selected instrument, BJMANIA cached score rows, cover saving, Remy WebView link, note-button chart-preview navigation, and difficulty-card chart-preview navigation.
- `src/lib/song-catalog.ts`: local binary MDB manifest fetch, catalog promise caches, unified MDB merge, and public catalog loaders.
- `src/lib/mdb-parser.ts`: binary protobuf-style MDB parser that produces `SongCatalogResponse`.
- `src/lib/mdb-index.ts`: remote `mdb.json` validation, in-memory loading, and IndexedDB fallback cache.
- `src/lib/mdb-assets.ts`: deterministic R2 cover, DTX, and OPUS URL resolution.
- `src/lib/song-normalizer.ts`: converts `RawSong` records into `SongViewModel`.
- `src/lib/song-favorites.ts`: localStorage-backed favorite state.
- `src/lib/version-logos.ts`: maps version identifiers to `public/version-logos/` assets.
- `src/types/song.ts`: shared song, difficulty, filter, and instrument contracts.
- `src/types/mdb.ts`: unified MDB index, supplement, and resource contracts.
- `public/mdb/m32_manifest.json`: local MDB version manifest.
- `public/mdb/*.bin`: binary MDB payloads.

## Data Flow

1. `HomeView.vue` calls `loadSongCatalog()` from `src/lib/song-catalog.ts`.
2. `song-catalog.ts` fetches `/mdb/m32_manifest.json` and resolves the requested or default MDB version.
3. `song-catalog.ts` fetches the selected MDB binary and passes it to `parseMdbBinary()`.
4. `mdb-index.ts` loads the remote unified `mdb.json`, falling back to its last valid IndexedDB copy.
5. Raw BIN rows remain authoritative; matching MDB records supply Remy fields, cover availability, chart/audio availability, and resource metadata during normalization.
6. Views apply local route/search/filter/sort state and render `SongViewModel` data.
7. Detail and chart routes can request a specific MDB version through the `version` query parameter.
8. The detail note button opens the current instrument's best available chart; individual difficulty cards open the matching chart level when available.

## Home Filtering Model

- `HomeView.vue` keeps home-list state route-local: search text, selected instrument, version filter, catalog filter, difficulty toggle/window, and sort option.
- Search, version, and catalog filters always run as the base song filter pipeline.
- The difficulty ruler is always visible in the filter drawer but is disabled until the `按难度` toggle is enabled.
- The horizontal ruler selects a 0.5-wide coarse window. When enabled and not horizontally dragging, the left boundary is rendered by a numeric fine wheel that can raise only the lower bound by 0.1 steps within that window.
- On touch devices, normal ruler ticks bubble pointer events to the horizontal drag surface. The left-boundary fine wheel performs a small gesture-direction check: horizontal movement drags the coarse ruler, while vertical movement adjusts the 0.1-step lower bound.
- When difficulty filtering is enabled, the home list expands each matching `SongViewModel` into `SongListEntry` rows for each matching level in the selected instrument. A song can therefore appear multiple times when multiple levels fall inside the active window.
- Difficulty sorting uses the matched `SongListEntry.difficultyMatch.difficultyCents`, not MASTER difficulty or max difficulty.
- Difficulty sort options (`难度-升序` / `难度-降序`) are shown only while difficulty filtering is enabled. Enabling difficulty filtering sets the current sort to `难度-升序`; disabling it resets difficulty sort back to the default catalog order.
- The default difficulty window is `4.5 - 5.0`. The lowest selectable coarse window is `1.0 - 1.5`; `0.0 - 0.5` and `0.5 - 1.0` are intentionally omitted. Windows are half-open (`4.0 - 4.5` excludes `4.5`) except the final `9.5 - 10.0` window, which includes `10.00`. Fine-tuning changes only the lower bound, for example `7.6 - 8.0`.
- Matched difficulty highlighting belongs to the difficulty cell only. The compact card may be duplicated, but the song card itself is not globally highlighted.

## Important Contracts

- `SongViewModel` is the UI-ready song source shared across home, detail, BJMANIA mapping, B50, recent play, and chart preview.
- MDB `first_ver` stores separate GF and DM version numbers; instrument-aware filters must not collapse them into one value.
- Catalog data is cached by local BIN version in memory; the unified MDB index is shared by song, cover, chart, and audio loading.
- BIN fields remain authoritative for title, BPM, difficulty, version, sorting, and deletion state.
- Unified MDB fields supply `remy_artist`, `remy_url`, `remy_length`, cover availability, chart availability, and highest-difficulty audio availability.
- MDB resource URLs are derived from `VITE_MDB_BASE_URL` or `https://gddata-mdb.selundine.top`, `revision`, zero-padded song directory, and fixed file names.
- `public/` assets are fetched by URL at runtime, not imported through Vite.

## Common Change Points

- Add or alter song filters: start in `src/views/HomeView.vue`, then check `src/types/song.ts` if the filter shape becomes shared. Difficulty filter UI also involves `src/components/DifficultyRangeSlider.vue`, `src/components/SongCard.vue`, and `src/components/DifficultyGrid.vue`.
- Change MDB parsing: inspect `src/lib/mdb-parser.ts`, `src/types/song.ts`, and `src/lib/song-normalizer.ts` together.
- Change display title, artist, BPM, difficulty, tags, or search text: start in `src/lib/song-normalizer.ts`.
- Change unified MDB parsing or cache behavior: start in `src/lib/mdb-index.ts`.
- Change cover, DTX, or OPUS object naming: start in `src/lib/mdb-assets.ts`.
- Change detail-page Remy links, note-button chart navigation, or difficulty-card chart navigation: inspect `src/views/SongDetailView.vue`.
- Add MDB-hosted assets through the shared resolver rather than hard-coding R2 URLs in views.

## Pitfalls

- Do not update docs or code based only on `.planning/codebase`; verify the current source.
- Do not add a global store for route-local filters unless multiple routes genuinely share the same mutable state.
- Do not assume all songs have all instruments or levels; use the normalized difficulty availability fields.
- Do not reintroduce MASTER-only difficulty sorting on the home list; difficulty sorting in difficulty mode must use the matched level entry.
- Do not key virtualized difficulty-mode rows only by `musicId`; duplicated cards need keys that include instrument, level, and matched difficulty.
- Do not break web fallback behavior when adding Android-native cache or WebView features.
- Do not hand-edit MDB binaries or generated catalog artifacts unless the task is explicitly about data refresh.
- Do not reintroduce `song_enrichment.json`; its surviving fields now belong to unified `mdb.json`.

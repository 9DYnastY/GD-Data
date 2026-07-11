# Module: B50 Export

## Purpose

Owns B50 row selection, poster layout, B50 score card rendering, full-poster export from the B50 page, and html2canvas-safe image output.

## Main Files

- `src/views/B50View.vue`: route owner for selected family, live/cache hydration, preview cover map, export cover map, poster scaling, and full B50 export.
- `src/views/SkillView.vue`: navigates from the profile board to the B50 page with family/version query state.
- `src/lib/b50.ts`: B50 card/poster dimensions, row keys, skill sorting, hot/other bucket selection, and total formatting.
- `src/lib/b50-export.ts`: image readiness, html2canvas rendering, gradient text overlay repair, native/web file output, and export-safe image source resolution.
- `src/components/B50Poster.vue`: poster composition, player board, hot/other slots, totals, version logo, and cover map lookup.
- `src/components/B50ScoreCard.vue`: visual score card for rows, cover override, rank/clear stickers, difficulty labels, title fitting, and skill/rate display.
- `src/components/B50PlayerBoard.vue`: player summary display and skill/name tone handling.
- `src/lib/cover-cache.ts`: native cover cache used by export preparation.
- `src/types/bjmania.ts`: `BjmaniaScoreListItem` contract consumed by B50 components.

## Data Flow

1. `B50View.vue` restores a cached BJMANIA snapshot, then hydrates live data through `loadBjmaniaGitadoraSnapshot()`.
2. `mapBestScoresToList()` creates score rows from BJMANIA best scores and song catalog data.
3. `selectB50BucketRows()` splits selected-family rows into hot and other buckets.
4. Preview covers are resolved through `resolveCoverImageSource()` with bounded concurrency.
5. Export covers are converted through `resolveImageSourceForExport()` and preloaded.
6. `B50Poster.vue` renders the final DOM poster.
7. `exportElementAsImage()` waits for fonts/images, runs html2canvas, applies gradient-text overlays, then downloads on web or writes to native documents storage.

## Important Contracts

- `getB50RowKey()` must stay stable for cover maps and keyed render slots.
- `B50_POSTER_WIDTH` and `B50_POSTER_HEIGHT` derive from the Figma/card scale and drive preview sizing.
- Export source resolution differs by runtime: web can fetch to data URL, Android may use native cache and Capacitor Filesystem.
- html2canvas rendering needs images and fonts ready before capture.
- Gradient text can require post-processing because html2canvas does not preserve every CSS text effect.
- Full B50 export uses `src/lib/b50-export.ts`; the skill page should navigate to the B50 route instead of owning export-only DOM.

## Common Change Points

- Change B50 ordering or buckets: edit `src/lib/b50.ts` and verify `B50View.vue` computed rows.
- Change poster layout: edit `src/components/B50Poster.vue` and keep dimensions aligned with `src/lib/b50.ts`.
- Change score card visuals: edit `src/components/B50ScoreCard.vue` and check poster export.
- Change export format, filename, or native output directory: edit `src/lib/b50-export.ts`.
- Change cover readiness or missing-cover behavior: inspect `B50View.vue`, `cover-cache.ts`, and `b50-export.ts` together.

## Pitfalls

- Do not render export from a partially loaded cover map unless the UI explicitly tolerates missing covers.
- Do not use raw remote image URLs blindly in Android export; convert to export-safe sources.
- Do not change B50 row keys without updating every cover map lookup.
- Do not place export-only state into BJMANIA client code; keep export orchestration in the views/export helper.
- Do not assume html2canvas captures CSS gradient text exactly; preserve overlay repair if text styling changes.

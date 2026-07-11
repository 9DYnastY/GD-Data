# Module: Chart Preview

## Purpose

Owns MDB-backed chart and audio availability lookup, DTX text decoding/parsing, OPUS playback synchronization, static chart positioning, static canvas rendering, realtime playback rendering, A-B loop playback, drum hand annotations, annotation image export, chart controls, and route-level viewer gestures.

## Main Files

- `src/views/ChartPreviewView.vue`: route owner for music ID, song metadata, selected instrument/level, speed, bars per column, chart mode, reverse mode, dynamic/static mode, static pan/zoom, realtime progress, playback, drum annotation mode, annotation export, and settings panel.
- `src/lib/chart-preview-manifest.ts`: compatibility facade that reads chart availability from the shared MDB index and resolves fixed R2 paths.
- `src/lib/chart-preview-audio.ts`: full OPUS download, bounded compressed Blob cache, active-track Web Audio decoding, and playback clock/control lifecycle.
- `src/lib/chart-preview-loop.ts`: pure A-B range normalization, active-duration clamping, and out-of-range seek decisions.
- `src/lib/mdb-index.ts`: shared remote `mdb.json` loader and IndexedDB fallback cache.
- `src/lib/mdb-assets.ts`: instrument/level filename mapping and DTX/OPUS URL composition.
- `src/lib/chart-preview-loader.ts`: high-level load facade that resolves a chart, preloads chip artwork, fetches DTX text, parses it, builds drawing config, and runs the positioner.
- `src/lib/chart-preview-parser.ts`: DTX parser, lane mappings, BPM segments, quarter-bar lines, chips, and hold-note matching.
- `src/lib/chart-preview-positioner.ts`: converts parsed DTX JSON into one or more static canvas draw-data segments.
- `src/lib/chart-preview-renderer.ts`: static canvas renderer, chart chip asset preloading, chip fallback drawing, and programmatic hold rendering.
- `src/lib/chart-preview-realtime-renderer.ts`: realtime canvas data preparation, judgment line placement, viewport sizing, visible item rendering, annotation badges/hitboxes, bookmark lines, and annotation export canvas rendering.
- `src/lib/chart-preview-types.ts`: shared DTX and canvas contracts.
- `src/components/DtxChartCanvas.vue`: static canvas component.
- `src/components/DtxRealtimeCanvas.vue`: realtime canvas component, pointer hit testing, and note-selection events for annotation mode.
- `src/assets/chart-preview/`: chip images and player/menu UI assets.

## Data Flow

1. `ChartPreviewView.vue` receives `musicId` from `/song/:musicId/chart`.
2. `preloadDtxChartManifest()` runs at app startup; `loadDtxChartManifest()` later returns the shared MDB index through its compatibility facade.
3. The route normalizes instrument/level/mode/speed/reverse/bars-per-column query values or stored preferences against selectable charts.
4. A chart is selectable only when unified MDB has the DTX file and the current BIN song data marks that instrument/level as available.
5. `loadDtxChartPreview()` resolves the selected DTX chart URL and the matching highest-difficulty instrument audio URL.
6. The `Play audio track` toggle defaults off for a new install and persists its local preference. When enabled, eligible OPUS audio is downloaded completely, decoded into one active `AudioBuffer`, and prepared before playback. Lower difficulties and songs without matching audio retain silent chart playback.
7. `DtxFileParser` decodes chart text into `DtxJson`.
8. `DtxCanvasPositioner` creates static canvas data using the selected drawing config. Static mode uses fixed `barsPerColumn` columns; continuous mode is split only when the positioner needs to respect canvas height limits.
9. Static mode renders `DtxChartCanvas` segments with route-owned pan/zoom. Realtime mode renders one viewport canvas from absolute DTX time, follows the shared `AudioContext` clock when audio is present, and otherwise uses the local animation clock.
10. Drum annotation mode is available only in realtime mode. The realtime component maps pointer taps to non-foot drum-note hitboxes, stores `L`/`R` badges in localStorage, and forces annotation display while editing.
11. The bookmark button lives between the fixed-width progress labels independently of annotation mode. Normal playback shows current/total time, while annotation mode restores current/total bar numbers. The first click sets A, the second sets B, and a third starts a new range; two distinct points enable automatic A-B loop playback.
12. Bookmarks store exact playback seconds, not whole bars. The progress bar maps annotated bars and bookmark markers to the same inset draggable range used by the thumb, and realtime rendering shows bookmark lines outside annotation mode as well.
13. Annotation export is enabled whenever the A-B range is valid, even if the range has no hand annotations. It reuses that range with `renderDtxAnnotationExportCanvas()`, places song title, instrument, difficulty, player name, date, and cover below the chart, then passes the hidden export card through the shared image export pipeline.

## Important Contracts

- Static and realtime renderers share parsed DTX data but have different canvas sizing and drawing assumptions.
- DTX text decoding prefers UTF-8 BOM and otherwise tries Shift_JIS before the default decoder.
- Drum reverse is forced to true in `chart-preview-loader.ts`; guitar/bass reverse is user-controlled and affects both realtime and static positioning.
- Dynamic/static mode is route-owned UI state. Static mode disables playback and annotation mode, starts at `0.25` local zoom, and persists `barsPerColumn`.
- Game speed is stored as the user-facing speed value. Rendering scale is derived from it through `mapGameSpeedToRenderScale()`.
- MDB index caching is best effort; chart preview can load from the remote index when IndexedDB fails.
- MDB chart existence alone is not enough for UI selection; official BIN difficulty availability filters out retained test/waste DTX files.
- `chart-preview-types.ts` is the shared contract between parser, positioner, renderers, and components.
- Route query values and localStorage preferences are normalized before loading a chart.
- Audio is opt-in and persisted in localStorage. The `AudioContext` clock is authoritative during audio-backed playback; the chart clamps at its own end while an OPUS tail continues.
- Web Audio playback recreates its one-shot source for pause/resume and seek. Keep only the current decoded `AudioBuffer`; compressed Blobs may remain in the bounded cache.
- Progress dragging pauses playback and resumes on release; hiding the app or leaving the route pauses and releases active media resources.
- Starting playback with a valid A-B range seeks to A when the current time is outside the range. Both audio-backed and silent playback restart at A after reaching B, and the effective range is clamped to the active timeline when OPUS and DTX durations differ.
- A-B range rules are isolated in `chart-preview-loop.ts` and covered by `tests/chart-preview-loop.test.mjs`.
- Annotation storage is per chart URL plus music ID, instrument, and level. This keeps old annotations tied to the exact DTX object when MDB `revision` changes.
- Annotation note keys intentionally include bar, line, time, lane, and duplicate index. Do not simplify them unless saved annotation compatibility is being migrated.
- The export author name comes from cached BJMANIA `gitadoraProfile.name`; unauthenticated exports use the localized anonymous placeholder.

## Common Change Points

- Change chart selection, controls, gestures, A-B loop behavior, annotation UI, export layout, or stored preferences: start in `src/views/ChartPreviewView.vue`.
- Change A-B range validation, duration clamping, or playback-start seek rules: edit `src/lib/chart-preview-loop.ts` and its focused test.
- Change MDB source or cache behavior: edit `src/lib/mdb-index.ts`.
- Change chart filename mapping: edit `src/lib/mdb-assets.ts`.
- Change OPUS downloading, decoding, scheduling, or playback timing: edit `src/lib/chart-preview-audio.ts` and keep view access behind `LoadedChartAudio`.
- Add or adjust DTX lanes: edit parser lane maps and positioner lane sizing together.
- Change static chart visuals: inspect `chart-preview-positioner.ts` and `chart-preview-renderer.ts`.
- Change realtime playback, annotation badges, note hit testing, bookmark lines, or annotation export drawing: inspect `DtxRealtimeCanvas.vue` and `chart-preview-realtime-renderer.ts`.
- Add chip artwork: place assets under `src/assets/chart-preview/` and update renderer asset maps.

## Pitfalls

- Do not mix static zoom/pan state with realtime playback progress.
- Do not enable playback or drum annotation mode while static mode is active.
- Do not assume every song has a chart set or every chart set has every instrument/level.
- Do not bypass MDB chart availability checks; route normalization depends on them.
- Do not bypass official BIN difficulty checks; unavailable levels should render `-.-` and stay disabled even if a stray DTX file exists.
- Do not drive realtime rendering from `HTMLAudioElement.currentTime`; Android WebView exposes unstable start/resume timing. Use the Web Audio controller clock.
- Do not cache decoded audio across songs. A single 48 kHz stereo track can consume tens of megabytes after decoding.
- Do not change canvas bitmap sizing casually; mobile WebView canvas limits and device pixel ratio matter.
- Do not mutate `chartAnnotations` in place if a redraw must be triggered; the realtime canvas watches object identity.
- Do not map progress/bookmark markers against the full visual progress width. They must use the inset draggable range so markers align with the thumb.
- Do not handle the B boundary after the normal track-end stop; loop restart must take precedence so B can equal the chart or audio end.
- Do not reintroduce an annotation-count gate for export; a valid A-B range alone controls export availability.
- Do not rewrite broad mojibake strings while making unrelated chart logic changes.

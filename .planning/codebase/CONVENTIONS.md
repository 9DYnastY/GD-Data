# Coding Conventions

**Analysis Date:** 2026-04-09

## Naming Patterns

**Files:**
- Use `PascalCase.vue` for views and reusable components in `src/views/*.vue` and `src/components/*.vue`.
- Use lowercase entry/config filenames for singleton modules such as `src/main.ts`, `src/router/index.ts`, `src/style.css`, and `capacitor.config.ts`.
- Use lowercase or kebab-style names for library modules under `src/lib/**`, for example `src/lib/song-catalog.ts`, `src/lib/song-normalizer.ts`, `src/lib/bjmania/native-auth.ts`, and `src/lib/b50-export.ts`.
- Use lowercase or kebab-style asset filenames under `src/assets/**`, such as `src/assets/skill-toggle/dm-mode.svg` and `src/assets/b50-page/Card_B50/Card_B50.css`.

**Functions:**
- Use `camelCase` for all functions and local helpers.
- Prefix side-effect handlers with verbs such as `handle*`, `load*`, `setup*`, `open*`, `clear*`, and `save*`, as seen in `src/views/SkillView.vue`, `src/views/HomeView.vue`, and `src/lib/bjmania/cache.ts`.
- Prefix predicates with `is*`, `has*`, `can*`, and `should*`, as seen in `src/lib/cover-cache.ts`, `src/lib/bjmania/http.ts`, and `src/views/SkillView.vue`.
- Prefix transformation helpers with `create*`, `resolve*`, `parse*`, `normalize*`, `map*`, and `filter*`, as seen in `src/lib/song-normalizer.ts` and `src/lib/bjmania/client.ts`.

**Variables:**
- Use lower camel case for reactive state and local variables.
- Use semantic suffixes to reveal role: `...Ref`, `...Visible`, `...Message`, `...Count`, `...Observer`, `...Promise`, and `...Cache`.
- Use `SCREAMING_SNAKE_CASE` for shared constants and lookup tables, for example `SEARCH_STORAGE_KEY`, `AUTH_RETRY_DELAYS_MS`, `BJMANIA_BASE_URL`, `GF_VERSION_MAP`, and `LEVEL_LABELS`.
- Use BEM-like CSS class names with block, element, and modifier structure, for example `song-card__logo`, `pill-menu__button--filled`, and `b50-view__nav-button--primary`.

**Types:**
- Use `PascalCase` for all interfaces and type aliases in `src/types/song.ts` and `src/types/bjmania.ts`.
- Use semantic suffixes such as `*Key`, `*Item`, `*Payload`, `*Response`, `*Snapshot`, and `*ViewModel`.
- Use union types to encode valid domain values at compile time, such as `InstrumentKey`, `LevelKey`, `BjmaniaScoreFamily`, and `BjmaniaScoreSortKey`.

## Code Style

**Formatting:**
- No formatter config is detected. `.prettierrc*`, `eslint.config.*`, `.eslintrc*`, and `biome.json` are absent from the repository root.
- Match the dominant application style in `src/**/*.ts` and `src/**/*.vue`: 2-space indentation, single quotes, semicolon-free statements, and trailing commas on multiline arrays/objects.
- Keep Vue SFC sections ordered as `<script setup lang="ts">`, `<template>`, and `<style scoped>`, as seen in `src/App.vue`, `src/views/HomeView.vue`, and `src/components/SongCard.vue`.

**Linting:**
- Static quality gates come from TypeScript compiler settings in `tsconfig.app.json` and `tsconfig.node.json`.
- Follow `strict`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `noUncheckedSideEffectImports`, and `erasableSyntaxOnly`.
- Use `import type` for type-only imports, as seen in `src/components/SongCard.vue`, `src/lib/song-normalizer.ts`, and `src/lib/bjmania/client.ts`.

## Import Organization

**Order:**
1. Framework and runtime imports from `vue`, `vue-router`, and `@capacitor/*`.
2. Local component, asset, and library imports from relative `../` or `./` paths.
3. Local type imports using `import type` from `src/types/*` or relative equivalents.

**Path Aliases:**
- No path aliases are configured in `tsconfig.json`, `tsconfig.app.json`, or `vite.config.ts`.
- Use direct relative imports such as `../lib/song-catalog`, `../../types/bjmania`, and `./native-api`.

## Component Patterns

**Vue SFCs:**
- Use `<script setup lang="ts">` in every application SFC under `src/`.
- Type props and emits inline with generics, for example `defineProps<...>()` and `defineEmits<...>()` in `src/components/SkillProfileBoard.vue`, `src/components/EmptyState.vue`, and `src/components/DifficultyRangeSlider.vue`.
- Keep view files responsible for orchestration, page state, and UI event handling. Examples: `src/views/HomeView.vue`, `src/views/SkillView.vue`, `src/views/B50View.vue`, and `src/views/SongDetailView.vue`.
- Move reusable transformations, parsing logic, and platform-specific adapters into `src/lib/**`.

**Reactive State:**
- Use `ref()` for mutable state, `computed()` for derived values, and `watch()` for side effects or bridge logic.
- Type DOM refs explicitly as `HTMLElement | null`, `HTMLInputElement | null`, or `HTMLVideoElement | null`.
- Always disconnect observers and remove DOM listeners in `onBeforeUnmount()`, as seen in `src/App.vue`, `src/views/HomeView.vue`, `src/views/SkillView.vue`, `src/components/LazyCoverImage.vue`, and `src/components/SongCard.vue`.

## Error Handling

**Patterns:**
- Throw `Error` from lower-level libraries when the caller cannot proceed. This is the norm in `src/lib/song-catalog.ts`, `src/lib/bjmania/http.ts`, `src/lib/bjmania/client.ts`, `src/lib/bjmania/protobuf.ts`, and `src/lib/bjmania/captcha.ts`.
- Convert `unknown` errors into user-facing messages at the view layer. `src/views/SkillView.vue` does this with `setErrorMessage(...)`; `src/views/HomeView.vue` and `src/views/SongDetailView.vue` store readable text in `errorMessage`.
- Return `null`, `undefined`, or the original source value when failure is expected and the app can degrade gracefully. Examples: `src/lib/cover-cache.ts`, `src/lib/b50-export.ts`, and `src/lib/bjmania/cache.ts`.

**User Feedback:**
- Prefer reactive state such as `loginError`, `dataError`, `errorMessage`, `noticeMessage`, and `loading` flags over console logging.
- Use `window.alert(...)` only for direct user actions in export/login flows, as seen in `src/views/SkillView.vue` and `src/views/B50View.vue`.

## Logging

**Framework:** None detected in `src/`

**Patterns:**
- No `console.*` calls are present in application source under `src/`.
- Preserve the current pattern of thrown errors, guarded fallbacks, and UI status text instead of ad hoc logging statements.

## Comments

**When to Comment:**
- Comments are sparse and only explain intent that would otherwise look suspicious.
- Keep comments for future-facing intent or fallback justification, such as the recent-play note in `src/views/SkillView.vue` and cleanup/storage ignore comments in `src/lib/b50-export.ts` and `src/lib/bjmania/cache.ts`.
- Do not add explanatory comments for obvious Vue or TypeScript syntax.

**JSDoc/TSDoc:**
- Not used in `src/`.
- Prefer descriptive names and typed signatures over block comments.

## Function Design

**Size:**
- Keep pure helpers small and focused in `src/lib/**`.
- Allow view files to be larger orchestration modules, but extract repeated logic into named local helpers such as `setupLoadMoreObserver()`, `handleDocumentPointerDown()`, `restoreCachedSnapshot()`, and `hydrateSnapshot()`.

**Parameters:**
- Use primitive parameters for tight domain helpers such as `rawSkillToText(rawSkill: number)` and `filterScoresByFamily(scores, family)`.
- Use object parameters for extensible async APIs such as `bjmaniaJsonRequest({ path, method, body })`, `getBjmaniaMusicDb({ game, tag, version })`, and `exportElementAsImage(node, baseName, options)`.

**Return Values:**
- Return normalized, typed data structures from mappers such as `normalizeSong(...)`, `mapBestScoresToList(...)`, and `mapRecentPlaysToList(...)`.
- Use `Promise<T>` for asynchronous loaders and caches, often memoized at module scope with variables such as `catalogPromise`, `musicDbVersionManifestPromise`, and `hotMusicDbPromiseCache`.
- Use `null` or `undefined` for expected absence instead of throwing, for example in `loadSongByMusicId(...)`, `resolveScoreSheet(...)`, and `parseRecentContent(...)`.

## Module Design

**Exports:**
- Prefer named exports in `src/lib/**` and `src/types/**`.
- Reserve default export for singleton framework objects such as the router in `src/router/index.ts`.

**Barrel Files:**
- Not used.
- Import directly from concrete module files instead of `index.ts` aggregators.

## Style Organization

**Global Styles:**
- Define design tokens, fonts, resets, and shared utility classes in `src/style.css`.
- Reuse global utility classes such as `.action-button`, `.meta-pill`, and `.tag-chip` instead of recreating them in every component.

**Component Styles:**
- Keep layout and component-specific styling inside `<style scoped>` blocks. This pattern is used across `src/App.vue`, every file in `src/views/*.vue`, and every file in `src/components/*.vue`.
- Use CSS custom properties for per-screen layout tuning, especially safe-area offsets and component sizing, as seen in `src/views/HomeView.vue`, `src/views/SkillView.vue`, and `src/views/B50View.vue`.
- Use BEM-like selectors consistently inside scoped styles, for example `detail-grid__cell`, `skill-score-card__value-main`, and `range-slider__track--active`.

**Standalone CSS Assets:**
- `src/assets/b50-page/Card_B50/Card_B50.css` exists as a static asset stylesheet.
- No imports of `src/assets/b50-page/Card_B50/Card_B50.css` were detected from `src/**/*.ts` or `src/**/*.vue`, so SFC-scoped CSS remains the active styling mechanism.

## Data Constraints

**Type Modeling:**
- Encode domain boundaries with interfaces and unions in `src/types/song.ts` and `src/types/bjmania.ts`.
- Use `Record<Union, T>` lookup tables for exhaustive mappings, such as `FAMILY_TOGGLE_ASSETS`, `LEVEL_LABELS`, `LEVEL_BY_INDEX`, `RANK_LABELS`, and `GF_VERSION_MAP`.
- Use `satisfies` when returning assembled domain objects that must match a declared interface, as seen in `src/lib/bjmania/client.ts`.

**Normalization:**
- Normalize remote and raw payloads before they reach templates. `src/lib/song-normalizer.ts` converts nullable fields into stable labels, booleans, tags, fallback images, and sort keys.
- Validate cached browser payloads before using them. `src/lib/bjmania/cache.ts` gates restored data with `isValidCachePayload(...)` plus `BJMANIA_SKILL_CACHE_VERSION`.
- Guard browser-only and platform-only APIs with checks such as `typeof window !== 'undefined'`, `typeof IntersectionObserver === 'undefined'`, and `Capacitor.getPlatform()`.

**Fallbacks:**
- Prefer explicit display fallbacks like `'Unknown'`, `'--'`, `'NO PLAY'`, `'FAILED'`, `'Version TBD'`, and `'Length TBD'` over leaking `null` into templates.
- Keep failure handling idempotent and retry-safe by returning original sources or empty collections when feasible, as in `src/lib/cover-cache.ts` and `src/lib/bjmania/client.ts`.

## Common Patterns

**Async Caching:**
- Cache long-lived fetches and manifests at module scope. Examples: `catalogPromise` in `src/lib/song-catalog.ts`, `musicDbVersionManifestPromise` in `src/lib/bjmania/client.ts`, and `inflightCoverLoads` in `src/lib/cover-cache.ts`.

**Progressive Hydration:**
- Restore cached UI state first and then refresh from the network. This pattern is implemented by `restoreCachedSnapshot()` and `hydrateSnapshot()` in `src/views/SkillView.vue`.

**Viewport-Driven Work:**
- Use `IntersectionObserver` for lazy image loading and infinite-scroll triggers in `src/components/LazyCoverImage.vue`, `src/views/HomeView.vue`, and `src/views/SkillView.vue`.
- Use `ResizeObserver` to keep pixel-precise card and poster layouts visually scaled in `src/components/SongCard.vue`, `src/components/SkillScoreCard.vue`, `src/components/SkillProfileBoard.vue`, and `src/views/B50View.vue`.

**Fire-and-Forget Effects:**
- Use `void` when intentionally ignoring async listener promises, as in `src/App.vue`.
- Keep DOM and storage side effects behind small helpers such as `clearExitToast()`, `syncImageLifecycle()`, and `saveBjmaniaSkillSnapshotCache(...)`.

---

*Convention analysis: 2026-04-09*

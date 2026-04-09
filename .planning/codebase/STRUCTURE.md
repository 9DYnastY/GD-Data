# Codebase Structure

**Analysis Date:** 2026-04-09

## Directory Layout

```text
[project-root]/
├── .planning/                 # Planning and codebase-map artifacts
├── android/                   # Capacitor Android host app and native BJMANIA plugins
├── public/                    # Static runtime assets served by absolute URL
├── src/                       # Vue application source
│   ├── assets/                # Vite-bundled images and SVGs imported by components
│   ├── components/            # Reusable Vue UI building blocks
│   ├── lib/                   # Shared TypeScript helpers and feature adapters
│   │   └── bjmania/           # BJMANIA transport, protocol, cache, and native wrappers
│   ├── router/                # Vue Router definition
│   ├── types/                 # Shared domain and API type definitions
│   ├── views/                 # Route-level Vue screens
│   ├── App.vue                # Root application shell
│   ├── main.ts                # Vue bootstrap
│   └── style.css              # Global design tokens and base styles
├── capacitor.config.ts        # Capacitor app shell configuration
├── index.html                 # Browser/WebView document entry
├── package.json               # JS scripts and dependencies
├── tsconfig*.json             # TypeScript project configuration
└── vite.config.ts             # Vite bundler configuration
```

## Directory Purposes

**`src/`:**
- Purpose: All web application source code.
- Contains: Bootstrap, routing, route views, shared components, type definitions, and feature helpers.
- Key files: `src/main.ts`, `src/App.vue`, `src/style.css`

**`src/views/`:**
- Purpose: Route-owned screens.
- Contains: One `.vue` file per screen, each owning its own state, loading, and UI orchestration.
- Key files: `src/views/HomeView.vue`, `src/views/SkillView.vue`, `src/views/B50View.vue`, `src/views/SongDetailView.vue`

**`src/components/`:**
- Purpose: Reusable UI fragments shared across screens.
- Contains: Cards, grids, nav, profile boards, image wrappers, and empty-state widgets.
- Key files: `src/components/AppBottomNav.vue`, `src/components/SongCard.vue`, `src/components/LazyCoverImage.vue`, `src/components/SkillScoreCard.vue`, `src/components/B50Poster.vue`

**`src/lib/`:**
- Purpose: Shared non-visual TypeScript logic.
- Contains: Catalog fetch/normalize logic, image caching, poster export helpers, skill formatting, and B50 helpers.
- Key files: `src/lib/song-catalog.ts`, `src/lib/song-normalizer.ts`, `src/lib/cover-cache.ts`, `src/lib/b50.ts`, `src/lib/b50-export.ts`

**`src/lib/bjmania/`:**
- Purpose: BJMANIA-specific transport, protocol parsing, caching, and native bridge adapters.
- Contains: HTTP transport selection, protobuf helpers, gRPC-web framing, local snapshot cache, and Capacitor plugin wrappers.
- Key files: `src/lib/bjmania/client.ts`, `src/lib/bjmania/http.ts`, `src/lib/bjmania/cache.ts`, `src/lib/bjmania/protobuf.ts`, `src/lib/bjmania/native-api.ts`, `src/lib/bjmania/native-auth.ts`

**`src/router/`:**
- Purpose: Central route table.
- Contains: A single router module that lazy-loads all views.
- Key files: `src/router/index.ts`

**`src/types/`:**
- Purpose: Shared TypeScript contracts used by views, components, and helpers.
- Contains: Song-domain types, BJMANIA API types, and global declaration shims.
- Key files: `src/types/song.ts`, `src/types/bjmania.ts`, `src/types/tencent-captcha.d.ts`

**`src/assets/`:**
- Purpose: Bundled artwork imported from Vue files.
- Contains: Feature-grouped icons and card backgrounds for skill, B50, and song-list UI.
- Key files: `src/assets/skill-page/`, `src/assets/b50-page/`, `src/assets/songlist-toggle/`, `src/assets/skill-toggle/`

**`public/`:**
- Purpose: Files accessed by stable URL at runtime instead of through Vite imports.
- Contains: Song catalog JSON, font files, background media, favicon, shared SVG sprite, and version logo images.
- Key files: `public/M32_mdb_11_merged_remy.json`, `public/fonts/`, `public/version-logos/`, `public/5_background.mp4`, `public/5_background_poster.jpg`, `public/icons.svg`

**`android/`:**
- Purpose: Native Android host app generated around the Capacitor web bundle, plus custom BJMANIA plugins.
- Contains: Gradle project files, Android resources, `MainActivity`, and plugin/session classes.
- Key files: `android/app/src/main/java/com/gddata/gitadora/MainActivity.java`, `android/app/src/main/java/com/gddata/gitadora/BjmaniaApiPlugin.java`, `android/app/src/main/java/com/gddata/gitadora/BjmaniaLoginActivity.java`, `android/app/src/main/AndroidManifest.xml`, `android/app/build.gradle`

**`.planning/`:**
- Purpose: Repository-local planning and codebase intelligence artifacts.
- Contains: Codebase map documents under `.planning/codebase/` and other planning state.
- Key files: `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/STRUCTURE.md`

## Key File Locations

**Entry Points:**
- `index.html`: Browser and WebView HTML entry document.
- `src/main.ts`: Vue app bootstrap.
- `src/App.vue`: Root shell with global background, nav, and Android back-button logic.
- `src/router/index.ts`: Route registration and lazy loading.
- `android/app/src/main/java/com/gddata/gitadora/MainActivity.java`: Android launcher and Capacitor plugin registration.

**Configuration:**
- `package.json`: Scripts for Vite build/dev and Capacitor sync/open commands.
- `vite.config.ts`: Vite plugin registration.
- `capacitor.config.ts`: Capacitor app ID, app name, and `dist` web directory.
- `tsconfig.json`: Project references.
- `tsconfig.app.json`: App-side strict TypeScript compiler settings.
- `android/app/build.gradle`: Android app dependencies and build config.
- `android/app/src/main/AndroidManifest.xml`: Android activities, provider, and internet permission.

**Core Logic:**
- `src/lib/song-catalog.ts`: Static catalog loader and memoization.
- `src/lib/song-normalizer.ts`: Raw song normalization and derived metadata creation.
- `src/lib/cover-cache.ts`: Native cover download/cache resolution.
- `src/lib/b50.ts`: B50 sizing and selection helpers.
- `src/lib/b50-export.ts`: html2canvas-based export pipeline.
- `src/lib/bjmania/client.ts`: BJMANIA snapshot assembly and score/recent mapping.
- `src/lib/bjmania/http.ts`: Web/native request dispatch.

**Testing:**
- `android/app/src/test/java/com/getcapacitor/myapp/ExampleUnitTest.java`: Placeholder Android unit test location.
- `android/app/src/androidTest/java/com/getcapacitor/myapp/ExampleInstrumentedTest.java`: Placeholder Android instrumentation test location.
- No JavaScript or Vue test directory is present under `src/`.

## Naming Conventions

**Files:**
- `PascalCase.vue`: Use for route screens and reusable Vue components, for example `src/views/SkillView.vue` and `src/components/B50ScoreCard.vue`.
- `kebab-case.ts`: Use for utility and adapter modules, for example `src/lib/song-catalog.ts`, `src/lib/cover-cache.ts`, and `src/lib/bjmania/native-api.ts`.
- `PascalCase.java`: Use for Android activities and plugin/session classes, for example `android/app/src/main/java/com/gddata/gitadora/BjmaniaApiPlugin.java`.
- Data/config root files stay conventional and lowercase, for example `package.json`, `vite.config.ts`, and `capacitor.config.ts`.

**Directories:**
- Lowercase feature or role names at the top level, for example `src/views`, `src/components`, `src/lib`, `src/types`, `public`, and `android`.
- Use nested subdirectories only when there is a clear feature boundary, as seen in `src/lib/bjmania/` and grouped asset folders such as `src/assets/b50-page/` and `src/assets/skill-page/`.

## Where to Add New Code

**New Feature:**
- Primary code: Add the route screen to `src/views/` and register it in `src/router/index.ts`.
- Tests: If native behavior changes, place Android tests under `android/app/src/test/` or `android/app/src/androidTest/`. No web test harness exists yet under `src/`.

**New Component/Module:**
- Implementation: Add reusable Vue building blocks to `src/components/`.
- If a component is route-specific but still purely visual, keep it in `src/components/` and let the owning screen in `src/views/` coordinate its state.
- If the new behavior is BJMANIA-specific transport, protocol, or caching logic, place it under `src/lib/bjmania/` instead of mixing it into a view.

**Utilities:**
- Shared helpers: Add generic TS helpers to `src/lib/`.
- Shared domain contracts: Add or extend types in `src/types/`.
- Shared router rules: Keep all route definitions in `src/router/index.ts`; there is no per-feature router split.

**Resources:**
- Runtime-fetched or URL-addressed assets go in `public/`, especially files referenced as `fetch('/...')` or `/...` URL strings such as `public/M32_mdb_11_merged_remy.json`, `public/version-logos/`, and `public/fonts/`.
- Component-imported assets go in `src/assets/`, grouped by feature or screen, for example `src/assets/skill-page/` and `src/assets/b50-page/`.
- Android-only icons, splash screens, XML, and layout files belong under `android/app/src/main/res/`.

**Native Bridge Changes:**
- Java plugin and activity code belongs in `android/app/src/main/java/com/gddata/gitadora/`.
- If a new Capacitor plugin is added, register it in `android/app/src/main/java/com/gddata/gitadora/MainActivity.java` and add its TS wrapper under `src/lib/` or `src/lib/bjmania/`.

## Special Directories

**`dist/`:**
- Purpose: Built web bundle consumed by Capacitor.
- Generated: Yes
- Committed: No, it is ignored by `.gitignore`

**`node_modules/`:**
- Purpose: Installed JS dependencies.
- Generated: Yes
- Committed: No, it is ignored by `.gitignore`

**`.gradle-user/`:**
- Purpose: Local Gradle cache directory used during Android builds.
- Generated: Yes
- Committed: No, it is ignored by `.gitignore`

**`android/app/src/main/res/`:**
- Purpose: Native Android resources such as splash screens, mipmaps, XML, strings, and layouts.
- Generated: Mixed; base Capacitor resources are scaffolded, but the directory is part of source control.
- Committed: Yes

**`public/version-logos/`:**
- Purpose: Absolute-path version logo images used by `src/components/SongCard.vue`.
- Generated: No
- Committed: Yes

**`public/fonts/`:**
- Purpose: App font files consumed by `src/style.css`.
- Generated: No
- Committed: Yes

**`src/assets/skill-page/` and `src/assets/b50-page/`:**
- Purpose: Feature-scoped artwork imported directly into Vue components.
- Generated: No
- Committed: Yes

---

*Structure analysis: 2026-04-09*

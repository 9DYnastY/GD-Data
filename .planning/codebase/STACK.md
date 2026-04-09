# Technology Stack

**Analysis Date:** 2026-04-09

## Languages

**Primary:**
- TypeScript 5.9.x - application logic, routing, data loading, and native bridges live in `src/main.ts`, `src/router/index.ts`, `src/lib/**/*.ts`, and Vue `<script setup lang="ts">` blocks under `src/views/*.vue` and `src/components/*.vue`.
- Vue Single-File Components - UI composition uses `.vue` files with template, script, and scoped CSS in `src/App.vue`, `src/views/*.vue`, and `src/components/*.vue`.
- CSS - global styling is centralized in `src/style.css`; component-scoped styles live inside Vue SFCs.

**Secondary:**
- Java 21 target - Android host code and custom Capacitor plugins live in `android/app/src/main/java/com/gddata/gitadora/*.java`; Java 21 compatibility is declared in `android/app/capacitor.build.gradle`.
- Groovy Gradle DSL - Android build and dependency configuration live in `android/build.gradle`, `android/app/build.gradle`, `android/settings.gradle`, and `android/variables.gradle`.
- JSON/XML assets - static app data lives in `public/M32_mdb_11_merged_remy.json`; Android manifest and resource wiring live in `android/app/src/main/AndroidManifest.xml` and `android/app/src/main/res/xml/file_paths.xml`.

## Runtime

**Environment:**
- Node.js - required for local development and build scripts in `package.json`; exact version is not pinned in the repo.
- Browser runtime - the web app runs in a standard browser with `fetch`, `localStorage`, and DOM APIs in files such as `src/lib/song-catalog.ts`, `src/lib/bjmania/http.ts`, and `src/lib/bjmania/cache.ts`.
- Capacitor Android WebView - the same Vue bundle is embedded into the Android shell configured by `capacitor.config.ts` and `android/app/src/main/AndroidManifest.xml`.

**Package Manager:**
- npm - script entrypoints are defined in `package.json`.
- Lockfile: present as `package-lock.json` with `lockfileVersion: 3`.

## Frameworks

**Core:**
- Vue 3.5.30 - SPA framework used from `src/main.ts` and throughout `src/views/*.vue`.
- Vue Router 5.0.4 - route-level code splitting and history navigation are defined in `src/router/index.ts`.
- Capacitor 8.2.0 - hybrid runtime and plugin bridge used in `src/App.vue`, `src/lib/bjmania/native-api.ts`, `src/lib/bjmania/native-auth.ts`, and the Android shell under `android/`.

**Testing:**
- Java/JUnit 4.13.2 - Android test scaffolding exists in `android/app/src/test/java/com/getcapacitor/myapp/ExampleUnitTest.java`.
- AndroidX instrumentation test stack - scaffolded instrumentation tests exist in `android/app/src/androidTest/java/com/getcapacitor/myapp/ExampleInstrumentedTest.java`.
- JavaScript test runner: Not detected. No `vitest`, `jest`, or browser test configuration files are present at the repo root.

**Build/Dev:**
- Vite 8.0.1 - dev server and production bundler configured by `vite.config.ts`.
- `@vitejs/plugin-vue` 6.0.5 - Vue SFC compilation in `vite.config.ts`.
- `vue-tsc` 3.2.5 - type-checking step in the `build` script in `package.json`.
- TypeScript compiler - strict browser and node configs are defined in `tsconfig.app.json`, `tsconfig.node.json`, and `tsconfig.json`.
- Android Gradle Plugin 8.13.0 with Gradle 8.14.3 - configured in `android/build.gradle` and `android/gradle/wrapper/gradle-wrapper.properties`.

## Key Dependencies

**Critical:**
- `vue` 3.5.30 - all UI screens and components depend on it, including `src/views/HomeView.vue` and `src/views/SkillView.vue`.
- `vue-router` 5.0.4 - route registration and route-based lazy imports depend on it in `src/router/index.ts`.
- `@capacitor/core` 8.2.0 - platform detection and custom plugin registration are used in `src/App.vue`, `src/lib/bjmania/http.ts`, `src/lib/bjmania/native-api.ts`, and `src/lib/bjmania/native-auth.ts`.
- `@capacitor/android` 8.2.0 - Android host integration is wired through `android/capacitor.settings.gradle` and `android/app/build.gradle`.
- `@capacitor/app` 8.1.0 - Android back-button interception and `exitApp()` behavior are implemented in `src/App.vue`.
- `@capacitor/filesystem` 8.1.2 - on-device cache and export file handling are implemented in `src/lib/cover-cache.ts` and `src/lib/b50-export.ts`.
- `@capacitor/file-transfer` 2.0.4 - remote image download for caching/export is implemented in `src/lib/cover-cache.ts` and `src/lib/b50-export.ts`.
- `html2canvas` 1.4.1 - B50 poster export rendering is implemented in `src/lib/b50-export.ts`.

**Infrastructure:**
- OkHttp 4.12.0 - native HTTPS, cookie, and gRPC-web transport is configured in `android/app/build.gradle` and implemented in `android/app/src/main/java/com/gddata/gitadora/BjmaniaApiPlugin.java` plus `android/app/src/main/java/com/gddata/gitadora/BjmaniaSessionManager.java`.
- AndroidX AppCompat/CoordinatorLayout/Core SplashScreen - native app shell dependencies are versioned in `android/variables.gradle`.
- Capacitor-generated native module wiring - `android/capacitor.settings.gradle` and `android/app/capacitor.build.gradle` connect the installed Capacitor plugins.

## Configuration

**Environment:**
- Runtime behavior is configured in code and build files, not via env injection. No `.env*` files were detected at the repository root.
- App identity and bundle target are defined in `capacitor.config.ts` and repeated in `android/app/build.gradle` as `appId`/`applicationId` `com.gddata.gitadora`.
- Network behavior and Android permissions are declared in `android/app/src/main/AndroidManifest.xml`.

**Build:**
- Web build config: `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`.
- Hybrid container config: `capacitor.config.ts`.
- Android build config: `android/build.gradle`, `android/app/build.gradle`, `android/app/capacitor.build.gradle`, `android/settings.gradle`, `android/variables.gradle`, `android/gradle/wrapper/gradle-wrapper.properties`.
- Static data and media packaged into the app: `public/M32_mdb_11_merged_remy.json`, `public/5_background.mp4`, and `public/5_background_poster.jpg`.

## Platform Requirements

**Development:**
- Node.js and npm are required to run `dev`, `build`, and Capacitor sync scripts from `package.json`.
- Android Studio, Android SDK, and JDK are listed as requirements in `README.md`.
- Java 21 toolchain compatibility is required by `android/app/capacitor.build.gradle`.

**Production:**
- Web output is emitted to `dist/` and consumed by Capacitor because `capacitor.config.ts` sets `webDir: 'dist'`.
- Android target settings are `minSdkVersion = 24`, `targetSdkVersion = 36`, and `compileSdkVersion = 36` in `android/variables.gradle`.
- The production artifact is an Android app shell that embeds the Vite bundle from `dist/`; a standalone browser build also remains runnable through Vite output.

---

*Stack analysis: 2026-04-09*

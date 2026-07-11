# Module: App Update

## Purpose

Owns Android release manifest checks, installed-version detection, auto/manual update prompts, prompt throttling, APK download, downloaded APK reuse, native installer handoff, update dialog state, and native install-state synchronization.

## Main Files

- `src/App.vue`: automatic Android update check, update dialog UI, primary action, postpone/ignore actions, and resume-time native state sync.
- `src/views/SettingsView.vue`: manual update check button and installed app version display.
- `src/lib/app-update.ts`: manifest fetch/validation, version comparison, shared update refs, prompt throttling, FileTransfer download, size checks, reuse checks, and native handoff.
- `src/lib/native-app-update.ts`: typed Capacitor wrapper for the `AppUpdate` plugin.
- `android/app/src/main/java/com/gddata/gitadora/AppUpdatePlugin.java`: native installer preparation, package validation, SHA-256 check, permission handling, pending state, and `FileProvider` install intent.
- `android/app/src/main/AndroidManifest.xml`: install permission, provider, and activity declarations.
- `android/app/src/main/res/xml/file_paths.xml`: file provider paths for update package sharing.

## Data Flow

1. `App.vue` calls `checkForAppUpdate('auto')` on startup for Android runtime only.
2. `SettingsView.vue` calls `checkForAppUpdate('manual')` when the user checks manually.
3. `app-update.ts` fetches `https://gitadora.selundine.top/releases/android/latest/update.json`, validates platform and required fields, and compares with installed version.
4. `showAppUpdateDialog()` sets shared refs consumed by `App.vue`.
5. `startAppUpdateDownload()` reuses a complete downloaded APK when possible or downloads with `@capacitor/file-transfer` into external `updates/`.
6. The downloaded file URI and manifest metadata are passed to `startNativeAppUpdate()`.
7. `AppUpdatePlugin.java` validates package name, version code, optional SHA-256, install permission, and launches the Android package installer.
8. On app resume, `syncNativeAppUpdateState()` reconciles pending native install state.

## Important Contracts

- Automatic prompts are Android-only; non-native primary action opens the release/APK URL in the browser.
- Version comparison prefers native `versionCode` when available and falls back to semantic-ish `versionName`.
- Ignored update and prompt throttle state live in localStorage under `gddata:update:*`.
- Download progress and action errors are shared Vue refs from `src/lib/app-update.ts`.
- Native plugin status values are normalized in `src/lib/native-app-update.ts`.
- Native installer handoff must preserve package name `com.gddata.gitadora`.

## Common Change Points

- Change update manifest shape: edit `AppUpdateManifest`, `parseUpdateManifest()`, and native handoff fields.
- Change prompt policy: inspect `shouldSuppressAutoPrompt()`, `writeLastPromptRecord()`, and `ignoreCurrentAppUpdate()`.
- Change download paths or reuse rules: edit `getUpdateDownloadPaths()`, `tryReuseDownloadedUpdate()`, and `downloadUpdatePackage()`.
- Change native validation or install behavior: edit `AppUpdatePlugin.java` and verify manifest/provider configuration.
- Change Settings update UI: inspect `src/views/SettingsView.vue` and shared refs in `app-update.ts`.

## Pitfalls

- Do not show automatic update prompts on web or non-Android platforms.
- Do not bypass native package validation before launching the installer.
- Do not assume APK file URIs are directly installable; the native side may copy/resolve content URIs.
- Do not block normal app startup on failed automatic checks.
- Do not forget resume synchronization after permission or installer handoff.

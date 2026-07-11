# Module: Android Bridge

## Purpose

Owns Capacitor Android plugin registration, native BJMANIA login/session/API transport, app update installer bridge, native image saving, Remy/native WebView display, WebView configuration, and TypeScript wrappers around native plugins.

## Main Files

- `android/app/src/main/java/com/gddata/gitadora/MainActivity.java`: registers custom plugins and configures the Capacitor WebView text zoom/frame-rate behavior.
- `android/app/src/main/java/com/gddata/gitadora/BjmaniaAuthPlugin.java`: opens native BJMANIA login activity and resolves login status.
- `android/app/src/main/java/com/gddata/gitadora/BjmaniaLoginActivity.java`: embedded WebView login flow and auth probing.
- `android/app/src/main/java/com/gddata/gitadora/BjmaniaApiPlugin.java`: native auth, gRPC, binary fetch, and session clearing methods.
- `android/app/src/main/java/com/gddata/gitadora/BjmaniaSessionManager.java`: WebView cookie sync, OkHttp clients, XSRF headers, cookie persistence, and auth probes.
- `android/app/src/main/java/com/gddata/gitadora/BjmaniaCookieJar.java`: in-memory OkHttp cookie jar.
- `android/app/src/main/java/com/gddata/gitadora/AppUpdatePlugin.java`: native app update installer bridge.
- `android/app/src/main/java/com/gddata/gitadora/ImageSaverPlugin.java`: MediaStore image save bridge.
- `android/app/src/main/java/com/gddata/gitadora/NativeWebViewPlugin.java`: opens `RemyWebViewActivity` for http/https URLs.
- `android/app/src/main/java/com/gddata/gitadora/RemyWebViewActivity.java`: native WebView activity for Remy/external pages.
- `src/lib/bjmania/native-auth.ts`, `src/lib/bjmania/native-api.ts`, `src/lib/native-app-update.ts`, `src/lib/native-image-saver.ts`, `src/lib/native-webview.ts`: typed frontend wrappers.
- `android/app/src/main/AndroidManifest.xml`: native activities, permissions, and providers.

## Data Flow

1. `MainActivity.java` registers all custom Capacitor plugins before `super.onCreate()`.
2. Vue code calls typed wrappers in `src/lib/**/native-*.ts`.
3. Wrappers check platform support where appropriate and call `registerPlugin()` handles.
4. Native plugin methods validate inputs, perform Android work, and resolve normalized payloads.
5. BJMANIA native requests synchronize WebView cookies before OkHttp requests.
6. Update and image flows use Android storage APIs, FileProvider, or MediaStore rather than browser-only behavior.

## Important Contracts

- Plugin names must match between Java `@CapacitorPlugin(name = "...")` and TypeScript `registerPlugin()`.
- New native plugins must be registered in `MainActivity.java`.
- BJMANIA native API requests must preserve cookie and XSRF header behavior from `BjmaniaSessionManager`.
- `BjmaniaApiPlugin.fetchBinary()` only accepts HTTPS URLs from trusted BJMANIA hosts.
- `NativeWebViewPlugin` accepts only `http` and `https` URLs.
- `ImageSaverPlugin` writes through MediaStore into the GD Data album.
- App update installer sharing depends on manifest/provider/file-path configuration.
- `MainActivity` requests 120 Hz on the bridge WebView and decor view through Android 15 `View.setRequestedFrameRate()` reflection. It is best effort and must tolerate unsupported devices.

## Common Change Points

- Add a Capacitor plugin: create Java plugin, register it in `MainActivity.java`, add a TypeScript wrapper, and update Android manifest/resources if needed.
- Change BJMANIA Android auth: inspect `BjmaniaLoginActivity.java`, `BjmaniaAuthPlugin.java`, and `BjmaniaSessionManager.java`.
- Change native BJMANIA API transport: inspect `BjmaniaApiPlugin.java`, `native-api.ts`, and `bjmania/http.ts`.
- Change Remy/external WebView behavior: inspect `NativeWebViewPlugin.java`, `RemyWebViewActivity.java`, and `src/lib/native-webview.ts`.
- Change image gallery saving: inspect `ImageSaverPlugin.java` and `src/lib/native-image-saver.ts`.
- Change update installer behavior: inspect `AppUpdatePlugin.java`, `native-app-update.ts`, and `app-update.ts`.

## Pitfalls

- Do not call native plugins directly from views when an existing wrapper exists.
- Do not forget Android manifest entries for new activities/providers.
- Do not weaken BJMANIA host or scheme validation casually.
- Do not assume browser cookies and Android WebView cookies are automatically synchronized.
- Do not remove `MainActivity` WebView text zoom configuration unless UI scaling is intentionally being changed.
- Do not treat the requested high frame rate as a guarantee; chart rendering still needs normal rAF instrumentation and fallback behavior.

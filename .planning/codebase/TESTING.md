# Testing Patterns

**Analysis Date:** 2026-04-09

## Test Framework

**Runner:**
- Frontend web app: Not detected. No `vitest.config.*`, `jest.config.*`, `*.spec.*`, or `*.test.*` files exist for `src/`.
- Android host-side test runner: JUnit 4 via `android/app/src/test/java/com/getcapacitor/myapp/ExampleUnitTest.java`.
- Android device test runner: AndroidJUnit4 via `android/app/src/androidTest/java/com/getcapacitor/myapp/ExampleInstrumentedTest.java`.
- Config: No custom test config files are present in the repo root. The Android tests rely on the default Gradle and Android plugin configuration inside `android/`.

**Assertion Library:**
- `org.junit.Assert.*` in the two Android example tests.
- No frontend assertion library is installed in `package.json`.

**Run Commands:**
```bash
npm run build
npm run android:sync
cd android
.\gradlew.bat test
.\gradlew.bat connectedAndroidTest
```
- `npm run build` is the current primary validation gate. It runs `vue-tsc -b && vite build`.
- `npm run android:sync` rebuilds the web app and syncs Capacitor Android resources. It is a delivery/build step, not a test.
- The Gradle commands are available through the generated Android project, but they are not exposed as root `package.json` scripts.

## Test File Organization

**Location:**
- Frontend: No co-located tests under `src/` and no separate `tests/` or `__tests__/` directory.
- Android: Template test files live under `android/app/src/test/java/...` and `android/app/src/androidTest/java/...`.

**Naming:**
- Android tests follow the default generated naming style: `ExampleUnitTest.java` and `ExampleInstrumentedTest.java`.
- No `.test.ts`, `.spec.ts`, `.test.vue`, or component snapshot files are present.

**Structure:**
```text
src/                                      # application code only, no test neighbors
android/app/src/test/java/...             # host-side JUnit example
android/app/src/androidTest/java/...      # device-side AndroidJUnit4 example
```

## Test Structure

**Suite Organization:**
```java
public class ExampleUnitTest {
    @Test
    public void addition_isCorrect() {
        assertEquals(4, 2 + 2);
    }
}
```

**Patterns:**
- No app-specific suite structure exists for `src/`.
- No shared setup or teardown helpers are present.
- Android tests use one trivial `@Test` method per file with direct assertions.

## Mocking

**Framework:** Not detected

**Patterns:**
```typescript
// No mocking utilities, spies, or test doubles are present in the repository.
```

**What to Mock:**
- If frontend tests are added, mock the browser and platform boundaries that the app already branches on: `fetch`, `window.localStorage`, `window.alert`, `IntersectionObserver`, `ResizeObserver`, `FileReader`, `Image`, `document.fonts`, and `@capacitor/*`.
- Mock `html2canvas`, `@capacitor/filesystem`, and `@capacitor/file-transfer` when testing `src/lib/b50-export.ts` and `src/lib/cover-cache.ts`.

**What NOT to Mock:**
- Do not mock the pure normalization and mapping logic in `src/lib/song-normalizer.ts`.
- Do not mock protobuf parsing helpers in `src/lib/bjmania/protobuf.ts` when the test target is domain decoding correctness.
- Keep `src/lib/bjmania/client.ts` list mappers and formatting helpers as real code unless the test is specifically isolating transport failure branches.

## Fixtures and Factories

**Test Data:**
```typescript
// No fixtures or factories are defined in the repo.
// Future tests should build typed fixtures from the interfaces in
// `src/types/song.ts` and `src/types/bjmania.ts`.
```

**Location:**
- Not applicable. No shared fixture directory exists.

## Coverage

**Requirements:** None enforced

**View Coverage:**
```bash
# No coverage command or reporter is configured in `package.json`.
npm run build
```

**Current Coverage:**
- `src/` application logic currently has no automated coverage.
- `android/app/src/test/java/com/getcapacitor/myapp/ExampleUnitTest.java` only checks `2 + 2 == 4`.
- `android/app/src/androidTest/java/com/getcapacitor/myapp/ExampleInstrumentedTest.java` only asserts an application package name.

## Test Types

**Unit Tests:**
- No frontend unit tests exist for `src/lib/**`, `src/components/**`, `src/views/**`, or `src/router/index.ts`.
- The only host-side unit test is the default Android template file `android/app/src/test/java/com/getcapacitor/myapp/ExampleUnitTest.java`.

**Integration Tests:**
- No web integration tests exist.
- The only instrumentation test is `android/app/src/androidTest/java/com/getcapacitor/myapp/ExampleInstrumentedTest.java`, and it does not exercise application flows.

**E2E Tests:**
- Not used.
- No Playwright, Cypress, mobile UI automation framework, or browser-based end-to-end runner is installed in `package.json`.

## Build Validation

**Current Gate:**
- `package.json` defines `npm run build` as `vue-tsc -b && vite build`.
- This is the only repository-wide automated validation command exposed at the root.
- No `.github/workflows` directory is present, so validation is local/manual rather than CI-enforced.
- `npm run build` was observed passing on `2026-04-09`.

**What It Catches:**
- Type errors in `src/**/*.ts` and `src/**/*.vue`.
- Production bundling issues for the Vite application.
- Missing or mis-resolved static assets referenced by Vue SFCs and `src/style.css`.

**What It Does Not Catch:**
- Runtime behavior of filtering, pagination, and menu state in `src/views/HomeView.vue` and `src/views/SkillView.vue`.
- BJMANIA HTTP and gRPC behavior in `src/lib/bjmania/http.ts`, `src/lib/bjmania/client.ts`, and `src/lib/bjmania/grpc-web.ts`.
- Native file caching and export branching in `src/lib/cover-cache.ts` and `src/lib/b50-export.ts`.
- Visual regressions in scaled card and poster components such as `src/components/SongCard.vue`, `src/components/SkillScoreCard.vue`, `src/components/B50ScoreCard.vue`, and `src/components/B50Poster.vue`.

## Missing Coverage

**Highest-value gaps:**
- `src/lib/song-normalizer.ts`: core normalization rules are untested even though every song list and detail view depends on them.
- `src/lib/bjmania/client.ts`: parsing, score mapping, rank labeling, skill bucketing, and recent-play mapping are untested.
- `src/lib/cover-cache.ts` and `src/lib/b50-export.ts`: platform branching, filesystem fallbacks, and export data conversion are untested.
- `src/views/HomeView.vue`, `src/views/SkillView.vue`, and `src/views/B50View.vue`: no tests cover filter state, login flow, pagination, retry behavior, or export UX.
- `src/router/index.ts`: no navigation or route-meta tests exist.

**Native gaps:**
- `android/app/src/androidTest/java/com/getcapacitor/myapp/ExampleInstrumentedTest.java` asserts `com.getcapacitor.app`, but `capacitor.config.ts` sets `appId` to `com.gddata.gitadora`.
- The two Android tests are template leftovers and should not be treated as meaningful coverage for the current app.

## Common Patterns

**Async Testing:**
```typescript
// No async test pattern exists yet.
// The current codebase will require observer, storage, and fetch mocks
// before view-level tests are practical.
```

**Error Testing:**
```typescript
// No error-path tests exist yet.
// The best starting points are thrown `Error` messages from
// `src/lib/song-catalog.ts` and guarded fallback branches in
// `src/lib/bjmania/cache.ts`, `src/lib/cover-cache.ts`, and `src/lib/b50-export.ts`.
```

---

*Testing analysis: 2026-04-09*

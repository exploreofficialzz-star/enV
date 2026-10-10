# enV Android

Standalone native Android application for enV, written in **Kotlin + Jetpack Compose**. The native app keeps the project's existing catalog, shell, engine IDs, and shared generated data as its source of truth. It is not an Expo or React-Native app.

The native execution boundary is explicit:

- **Offline-native:** 7,066 active catalog tools have verified Kotlin/Swift operation mappings and run without the website.
- **Backend-native:** 2,934 active tools use the configured enV backend/processor contract.
- **Planned:** 0 catalog entries are marked as unavailable.

There is no WebView or website execution fallback in the standalone native products.

No catalog record is currently marked Coming Soon. Android and iOS share the same execution-coverage audit, so an active tool cannot silently exist on only one native platform.

## Requirements

- Package/application ID: `com.chastech.env`
- Version: `1.1.0` (`versionCode 6`)
- `minSdk 26`, `targetSdk/compileSdk 36`
- Offline catalog source: `../../shared/catalog.json` is included directly as an Android asset through `sourceSets`; it is not duplicated.
- Native shell: Home, Tools, Search, Saved, Account
- Local favorites: Android `SharedPreferences`

## Build, run, and test

From this directory:

```bash
./gradlew assembleDebug
./gradlew test
./gradlew lint
```

Install on a connected device/emulator with an Android SDK configured:

```bash
./gradlew installDebug
adb shell am start -n com.chastech.env/.MainActivity
```

The project uses Gradle Wrapper 8.9, Android Gradle Plugin 8.7.3, Kotlin 2.0.21, and pinned dependency versions. Java 17 is the compile target (JDK 21 is also supported by the Gradle toolchain).

## Coverage and execution audit

The shared catalog contains **10,000 records**, **43 non-empty categories**. Run `npm run check:native-coverage` and `npm run check:native-executability` from the repository root to audit the Android/iOS manifests against the canonical web catalog.

Native execution data is generated from the web engine definitions into `apps/shared/` and then consumed by Kotlin. The calculator-standard tranche has an explicit generated DSL audited by `npm run check:native-calculators`.

## Validation note

In the Linux development sandbox, the Android Gradle wrapper cannot complete a build when the Gradle distribution is not already cached because the environment has no outbound DNS access. The repository CI workflow remains the authoritative Android build/test path on an Android-capable runner.


## Native AI

Backend-powered tools and AI features call the enV application API at `https://en-v.vercel.app` (`/api/backend/*` and `/api/ai/*`). The Render `env-media-processor` host is a downstream processor, not the mobile API gateway; using it as `ENV_API_BASE_URL` returns processor-level errors instead of reaching the application routes. Android accepts `-PENV_API_BASE_URL=...` and iOS uses the `ENV_API_BASE_URL` build setting to override the application origin for another deployment. Provider keys remain server-only and must never be put in a mobile build. Anonymous AI session cookies are stored locally so the server can apply the same per-session protections as the web client.

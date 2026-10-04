# enV Android

Standalone native Android application for enV, written in **Kotlin + Jetpack Compose**. The native app keeps the project's existing catalog, shell, engine IDs, and shared generated data as its source of truth. It is not an Expo or React-Native app.

The native layer has two execution tiers:

- **Offline-native engines:** 6,726 of the 8,789 active catalog tools are implemented directly in Kotlin using the project's generated engine data and reusable native families.
- **Exact web-engine fallback:** the remaining 2,063 active tools run their existing canonical web tool inside the native Kotlin shell when they require browser APIs, large media processors, URL/network backends, or other web-only capabilities. This fallback is online-only and is intentionally not counted as offline-native.

Planned records remain visibly **Coming soon**. Android and iOS share the same execution-coverage audit, so an active tool cannot silently exist on only one native platform.

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

The shared catalog currently contains **10,000 records**, **42 non-empty categories**, **8,789 active/beta tools**, and **1,211 planned tools**. Run `npm run check:native-coverage` and `npm run check:native-executability` from the repository root to audit the Android/iOS manifests against the canonical web catalog.

Native execution data is generated from the web engine definitions into `apps/shared/` and then consumed by Kotlin. The calculator-standard tranche has an explicit generated DSL audited by `npm run check:native-calculators`.

## Validation note

In the Linux development sandbox, the Android Gradle wrapper cannot complete a build when the Gradle distribution is not already cached because the environment has no outbound DNS access. The repository CI workflow remains the authoritative Android build/test path on an Android-capable runner.


## Native AI

AI-assisted tools call the repository AI API directly from Kotlin/Swift at `/api/ai/status` and `/api/ai/run`. The provider keys remain server-only. Configure the native `ENV_API_BASE_URL` for the deployed enV backend; do not put OpenRouter, Groq, or Gemini keys in a mobile build. Anonymous AI session cookies are stored locally so the server can apply the same per-session protections as the web client. The current native/default backend is `https://env-q3mq.onrender.com`; Android still supports a Gradle `-PENV_API_BASE_URL=...` override, and iOS exposes the same setting through `ENV_API_BASE_URL`.

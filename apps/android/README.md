# enV Android

Standalone native Android foundation for enV, written in **Kotlin + Jetpack Compose**. This is not Expo, React Native, a WebView, or a wrapper around the website.

## Requirements

- Package/application ID: `com.chastech.env`
- Version: `1.1.0` (`versionCode 6`)
- `minSdk 26`, `targetSdk/compileSdk 36`
- Offline catalog source: `../../shared/catalog.json` is included directly as an Android asset through `sourceSets`; it is not duplicated.
- Native shell: Home, Tools, Search, Saved, Account
- Local favorites: Android `SharedPreferences`
- Native execution currently covers 89 active IDs across Text (40), Codec (17), Color (16), Date/time (14), and MIME (2). Each supported tool has an Android-local form; URL media inspection is explicitly remote-only, and other active entries remain marked not ported. Planned records visibly show **Coming soon**.

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

## Catalog layer

`CatalogModels.kt` parses the root metadata, all categories, and all tool records from the bundled JSON. Known fields are modeled explicitly; unknown root/tool/engine keys are safely ignored, while unknown engine keys are retained as string extras for forward compatibility. Search matches names, IDs/slugs, descriptions, keywords, and tags, with popularity ordering and category filtering.

## Validation note

The shared catalog contains **10,001 records**, **43 categories**, **8,790 active**, and **1,211 planned**. The execution sandbox has no local Android SDK; native Gradle/unit-test and signed APK validation therefore run in GitHub Actions. Android JVM catalog and engine tests are included under `app/src/test` and run with `./gradlew test` in an Android-capable environment.

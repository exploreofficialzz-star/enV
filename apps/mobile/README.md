# enV Mobile

`apps/mobile/` is the native mobile app shell for enV, built with Expo, React Native, Expo Router, and `react-native-webview`. Android is the first generated native target. The shared app code and configuration are iOS-ready; the iOS native project is intentionally deferred until that platform is requested. The existing root Vite/TanStack application remains the canonical web app and Vercel deployment.

## Architecture

- `src/app/` contains Expo Router routes and the root safe-area/status-bar layout.
- `src/features/web-shell/` owns the native WebView screen, connection/retry state, navigation, and generated-file bridge.
- `src/lib/web-app-config.ts` validates the public HTTPS site URL and restricts in-app navigation to that origin.
- `android/` contains the generated Android Studio/Gradle/Kotlin project. It is checked in so the native app source is available immediately; regenerate it from `app.json` with `npm run prebuild:android` rather than making untracked edits to generated files.
- `plugins/withUnsignedAndroidRelease.js` keeps the release build unsigned across clean prebuilds and fails loudly if the generated Gradle signing template changes.

The initial Android application loads the live enV site in a native WebView so the full existing tool catalog and responsive UI remain shared rather than being reimplemented. Android back navigates WebView history; external links open outside the app. Site-generated `blob:` downloads are transferred through a size-limited bridge into app cache and opened with the native share sheet. The bridge rejects malformed or oversized transfers; its limit is 100 MiB. Web file-input behavior is delegated to the platform WebView and must be verified on a physical Android device before release.

## Development

```bash
cd apps/mobile
npm ci
npm run typecheck
npm run start
```

To build and launch on a configured Android emulator or device:

```bash
npm run prebuild:android
npm run android
```

`npm run android` requires Android Studio or an equivalent Android SDK installation, platform tools, and a compatible JDK. To validate Expo's JavaScript bundle without a local Android SDK, run `npx expo export --platform android`. `npm run check:mobile` verifies the Expo configuration and the generated Android/Gradle/Kotlin source tree.

## GitHub Actions builds

`.github/workflows/android-build.yml` runs on mobile-app changes to `main`, pull requests, or manual dispatch. It installs the locked dependencies, checks Expo SDK compatibility, audits dependencies, lints and typechecks the app, then builds a standalone release APK and `app-release.aab` with the committed Gradle wrapper. The release APK/AAB are uploaded as a 14-day workflow artifact named `env-android-<commit-sha>`. The debug APK is intentionally not uploaded: debug builds expect a Metro development server and are not standalone app packages.

The release APK/AAB are signed only when a separate production keystore and protected signing secrets are configured. Without them, CI produces unsigned release validation artifacts that are not installable/submittable production packages. Never use the debug key as a release signing identity.

The default public site is `https://en-v-6h2l.vercel.app`. To use another HTTPS deployment, copy `.env.example` to `.env.local` and set `EXPO_PUBLIC_WEB_URL`. This is public build-time app configuration; never put secrets in `EXPO_PUBLIC_*` values.

## Future iOS target

The React Native screens, URL policy, share bridge, and iOS bundle identifier are already configured for a future iOS target. Generate that native project on a macOS build host with `npm run prebuild:ios`, then build with Xcode. The repository does not currently contain or claim a generated iOS project.

## Release and signing

The Android application ID is `com.chastech.env`, derived from the repository namespace. Confirm that identifier before publishing because changing it after store release creates a separate app. The workflow accepts the protected GitHub secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD`; when all four are present, the release APK and AAB are signed with that production key. Without them, CI still builds `app-release-unsigned.apk` and `app-release.aab` as validation artifacts, but those files are not installable/submittable production packages. Never commit a keystore or signing credentials.

# enV native iOS

Standalone native iOS application for enV, written in **Swift + SwiftUI**. The native app keeps the project's existing catalog, shell, engine IDs, and shared generated data as its source of truth. It is not an Expo or React-Native app.

The native execution boundary is explicit:

- **Offline-native:** 7,688 active catalog tools are declared with local Kotlin/Swift execution paths in the shared matrix.
- **Backend-native:** 1,619 active tools use the configured enV application API/processor contract.
- **Web-only:** 693 active tools are not yet available in either native app. The largest remaining families are mockups, screenshots, events, celebrations, photography, food, and travel.
- **Declared executable in both native apps:** 9,307/10,000 active tools (93.07%); the shared execution matrix has zero Android/iOS coverage divergences.
- **Productivity timers:** Focus Timer, Pomodoro, and Stopwatch now have exact-ID native implementations; their Swift source and XCTest changes still require Xcode/iOS CI validation.
- **Planned:** 0 catalog entries are marked as unavailable.

There is no WebView or website execution fallback in the standalone native products.

No catalog record is currently marked Coming Soon. Android and iOS share the same execution-coverage audit, so an active tool cannot silently exist on only one native platform.

## Build and test (macOS with Xcode)

```bash
cd apps/ios
xcodebuild -project enV.xcodeproj -scheme enV -sdk iphonesimulator \
  -destination 'platform=iOS Simulator,name=iPhone 15' build
xcodebuild test -project enV.xcodeproj -scheme enV \
  -destination 'platform=iOS Simulator,name=iPhone 15'
```

The shared scheme is committed at `enV.xcodeproj/xcshareddata/xcschemes/enV.xcscheme`. The project uses iOS 16.4, marketing version `1.1.0`, build `6`, and bundle identifier `com.chastech.env`.

## Catalog and execution

`../shared/catalog.json` is added directly to the Xcode resource build phase; it is not copied or regenerated here. The app decodes the full offline snapshot, searches names/descriptions/keywords/tags, filters by category, orders by popularity, and persists saved tools with `UserDefaults`.

The native execution manifests are generated/audited from the same catalog as Android. Run `npm run check:native-coverage`, `npm run check:native-calculators`, and `npm run check:native-executability` from the repository root.

## Linux limitation

This Linux sandbox does not contain `swiftc`, Xcode, `xcodebuild`, or the iOS SDK, so neither standalone Swift compilation nor a full iOS application build/test can be performed here. The committed macOS CI workflow remains the authoritative iOS build/test path.


## Native API

Backend-powered tools and AI features call the enV application API at `https://env-q3mq.onrender.com` (`/api/backend/*` and `/api/ai/*`). Render is the public API origin for every client; it proxies `/api/*` application routes and directly serves media processors. Android accepts `-PENV_API_BASE_URL=...` and iOS uses the `ENV_API_BASE_URL` build setting to override the application origin for another deployment. Provider keys remain server-only and must never be put in a mobile build. Anonymous AI session cookies are stored locally so the server can apply the same per-session protections as the web client.

The shared catalog contains **10,000 records across 42 active categories**. Web-only tools must not be represented as locally executable until their Kotlin and Swift handlers and tests are in place.

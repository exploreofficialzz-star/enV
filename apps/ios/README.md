# enV native iOS

Standalone native iOS application for enV, written in **Swift + SwiftUI**. The native app keeps the project's existing catalog, shell, engine IDs, and shared generated data as its source of truth. It is not an Expo or React-Native app.

The native execution boundary is explicit:

- **Offline-native:** 7,066 active catalog tools have verified Kotlin/Swift operation mappings and run without the website.
- **Backend-native:** 2,934 active tools use the configured enV backend/processor contract.
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

This Linux sandbox does not contain Xcode, `xcodebuild`, or the iOS SDK, so a full iOS application build/test cannot be performed here. Standalone Swift engine source validation is used in this environment; the committed macOS CI workflow remains the authoritative iOS build/test path.


## Native API

Backend-powered tools and AI features call the enV application API at `https://en-v.vercel.app` (`/api/backend/*` and `/api/ai/*`). The Render `env-media-processor` host is a downstream processor, not the mobile API gateway; using it as `ENV_API_BASE_URL` returns processor-level errors instead of reaching application routes. Android accepts `-PENV_API_BASE_URL=...` and iOS uses the `ENV_API_BASE_URL` build setting to override the application origin for another deployment. Provider keys remain server-only and must never be put in a mobile build. Anonymous AI session cookies are stored locally so the server can apply the same per-session protections as the web client.

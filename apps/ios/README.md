# enV native iOS

Standalone native iOS application for enV, written in **Swift + SwiftUI**. The native app keeps the project's existing catalog, shell, engine IDs, and shared generated data as its source of truth. It is not an Expo or React-Native app.

The native layer has two execution tiers:

- **Offline-native engines:** 6,726 of the 8,789 active catalog tools are implemented directly in Swift using the project's generated engine data and reusable native families.
- **Exact web-engine fallback:** the remaining 2,063 active tools run their existing canonical web tool inside the native Swift shell when they require browser APIs, large media processors, URL/network backends, or other web-only capabilities. This fallback is online-only and is intentionally not counted as offline-native.

Planned records remain visibly **Coming soon**. Android and iOS share the same execution-coverage audit, so an active tool cannot silently exist on only one native platform.

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

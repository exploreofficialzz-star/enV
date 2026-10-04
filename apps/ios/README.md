# enV native iOS

Standalone SwiftUI iOS application for the native migration foundation. This is not an Expo, React Native, WebView, or website wrapper.

## Build and test (macOS with Xcode)

```bash
cd apps/ios
xcodebuild -project enV.xcodeproj -scheme enV -sdk iphonesimulator \
  -destination 'platform=iOS Simulator,name=iPhone 15' build
xcodebuild test -project enV.xcodeproj -scheme enV \
  -destination 'platform=iOS Simulator,name=iPhone 15'
```

The shared scheme is committed at `enV.xcodeproj/xcshareddata/xcschemes/enV.xcscheme`. The project uses iOS 16.4, marketing version `1.1.0`, build `6`, and bundle identifier `com.chastech.env`.

## Catalog and scope

`../shared/catalog.json` is added directly to the Xcode resource build phase; it is not copied or regenerated here. The app decodes the full offline snapshot (10,001 tools and 43 categories), searches names/descriptions/keywords/tags, filters by category, orders by popularity, shows details, and persists saved tools with `UserDefaults`.

Planned entries are visibly marked **Coming soon**. Local execution currently covers 89 active IDs across Text (40), Codec (17), Color (16), Date/time (14), and MIME (2). URL media inspection is explicitly remote-only; other active entries show **Native engine migration in progress** until their iOS engine is ported and tested. This is a staged migration, not all 8,790 active engine ports.

## Linux limitation

This Linux sandbox does not contain Xcode, `xcodebuild`, or Swift, so native build/test validation runs on the configured macOS GitHub Actions runner. The project includes an iOS application target and XCTest target; the CI workflow builds the simulator app and runs the tests.

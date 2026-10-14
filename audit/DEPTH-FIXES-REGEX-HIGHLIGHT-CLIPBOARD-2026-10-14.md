# Depth fixes — Regex live highlight + clipboard smart-suggest
**Date:** 14 October 2026

## Implemented

### 1. Regex live highlight (regex101-class depth)
**Web**
- `src/lib/engines/regex-studio.ts` — `buildRegexHighlightSegments()` returns match spans + flat segments for overlay rendering (bounded, local, JS RegExp)
- `src/components/engines/developer-engine.tsx` — Live highlight panel in Regex Studio test mode: amber marks on matches, group list, engine label

**Android (Kotlin)**
- `NativeRegexHighlight.kt` — java.util.regex match segments as JSON for Compose UI

**iOS (Swift)**
- `NativeRegexHighlight.swift` — NSRegularExpression match segments as JSON for SwiftUI

### 2. Clipboard smart-suggest (user-initiated only)
**Web**
- Studio “Detect from clipboard” button (Clipboard API, user gesture) + paste textarea

**Android**
- `NativeDeveloperClipboardSuggest.kt` — suggests from caller-supplied clipboard text (no background listener)

**iOS**
- `NativeDeveloperClipboardSuggest.swift` — `suggestFromPasteboard()` only on user action

### Privacy
- No background clipboard monitoring
- No network
- Highlight/detect stay on-device

### Follow-up status after native integration pass
- Native preview JSON is now consumed by the Android Compose and iOS SwiftUI screens. Both display match segments and a capture-group list; native engines are labeled accurately (`java.util.regex` / `NSRegularExpression (ICU)`).
- The visual treatment highlights full match segments; nested capture-group ranges are listed but not independently color-layered inside each match.
- Native app build/test verification is still required on supported Android and Xcode runners. This Linux environment cannot download the Gradle wrapper distribution and has no Xcode/iOS SDK.

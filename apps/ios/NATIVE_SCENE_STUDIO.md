# Scene Studio on iOS: reader files (not yet in the Xcode project)

These files were written on a Linux machine that has **no Swift compiler, Xcode or iOS SDK**. They have never been compiled or run. They are a line-by-line port of the Kotlin reader, and the Kotlin version **has** been compiled and run against the shared test numbers (27 JUnit tests pass). Treat the Swift as unverified until the steps below pass on a Mac.

They are deliberately **not** listed in `enV.xcodeproj/project.pbxproj`. This project lists every source file by hand (there is no folder sync), so Xcode ignores files that are not listed, and a compile mistake in this new code cannot break the iOS build until someone adds it on purpose.

## Files

| File | What it holds |
| --- | --- |
| `enV/NativeSceneStudioJSON.swift` | Strict JSON reader (no dependencies) |
| `enV/NativeSceneStudioModel.swift` | Scene data types (all named `SceneStudio…` so they cannot clash with SwiftUI's `Scene`) |
| `enV/NativeSceneStudioReader.swift` | Scene reader: defaults, normalising, limits, never crashes on bad input |
| `enV/NativeSceneStudioAnimation.swift` | Easing, quaternion slerp, track sampling, seeded random, camera shake |
| `enV/NativeSceneStudioFrameState.swift` | "What is on screen at frame N" |
| `enV/NativeSceneStudioRenderMath.swift` | Particles, water waves, character poses |
| `enV/NativeSceneStudioCameraMath.swift` | Camera axes, 3D point to screen position |
| `enV/NativeSceneStudioLook.swift` | Sky and lighting presets, post-processing plan, quality plan |
| `enVTests/NativeSceneStudioTests.swift` | XCTest: shared test numbers, reader behaviour, bad-file safety |

## Steps on a Mac

1. Open `apps/ios/enV.xcodeproj` in Xcode. Add the eight `enV/NativeSceneStudio*.swift` files to the **enV** target and `enVTests/NativeSceneStudioTests.swift` to the **enVTests** target (right-click the group, Add Files, tick the target; or copy the `PBXBuildFile`/`PBXFileReference` pattern used by `NativeColorEngine.swift` in `project.pbxproj`).
2. Build and run the tests:

   ```bash
   cd apps/ios
   xcodebuild test -project enV.xcodeproj -scheme enV \
     -destination 'platform=iOS Simulator,name=iPhone 15' \
     -only-testing:enVTests/NativeSceneStudioTests
   ```

   The tests find the shared files (`apps/shared/scene-studio/*.json`) from the test source file's own location (`#filePath`), so nothing has to be added to the test bundle. This works when tests run from a checkout on the Mac, which is how the simulator runs them.
3. Fix whatever the compiler reports. The most likely trouble spots are small: Swift type-checker limits on long expressions, optional-pattern syntax in `if case`, and the test file's multi-line JSON strings. Keep the maths identical to the Kotlin file of the same name; the shared vectors are the judge.
4. Add a row for the new files to the iOS README's tranche list once they pass.

## What these files are not

They only read scenes and compute frame values. There is no iOS 3D renderer (RealityKit is the planned choice), no native video export, and the tool is not in the native catalog yet. Scenes should be checked and explained on the web tool first; the native reader assumes a checked scene.

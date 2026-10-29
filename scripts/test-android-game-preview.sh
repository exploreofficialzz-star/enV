#!/usr/bin/env bash
set -u
cd apps/android || exit 1
result=0
./gradlew --no-daemon --max-workers=2 :app:connectedDebugAndroidTest -PenvNativeGameTest=true \
  -Pandroid.testInstrumentationRunnerArguments.class=com.chastech.env.NativeGamePlaybackTest || result=$?
mkdir -p "$GITHUB_WORKSPACE/android-game-evidence"
adb pull /sdcard/Download/env-game-preview.png "$GITHUB_WORKSPACE/android-game-evidence/preview.png" || true
adb pull /sdcard/Download/env-game-after.png "$GITHUB_WORKSPACE/android-game-evidence/after.png" || true
exit "$result"

#!/usr/bin/env bash
# Run real instrumented graphics assertions without relying on Gradle's
# post-test emulator uninstall, which disconnects the host-backed GLES emulator.
set -euo pipefail
cd apps/android
./gradlew --no-daemon --max-workers=2 \
  :app:assembleDebug :app:assembleDebugAndroidTest -PenvNativeGameTest=true

adb wait-for-device
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb install -r app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk

# 'am instrument' can return exit code 0 even for a failed JUnit run.
# Require its success sentinel as well as checking the shell exit status.
set +e
output=$(timeout 300s adb shell am instrument -w -r \
  -e class com.chastech.env.NativeGamePlaybackTest \
  com.chastech.env.test/androidx.test.runner.AndroidJUnitRunner 2>&1)
code=$?
set -e
printf '%s\n' "$output"
result=0
if [[ "$code" -ne 0 ]] || ! grep -Eq '^OK \(1 test\)' <<< "$output"; then
  echo 'Native game rendering and movement instrumentation did not pass.'
  result=1
fi

mkdir -p "$GITHUB_WORKSPACE/android-game-evidence"
adb pull /sdcard/Download/env-game-preview.png "$GITHUB_WORKSPACE/android-game-evidence/preview.png" || true
adb pull /sdcard/Download/env-game-after.png "$GITHUB_WORKSPACE/android-game-evidence/after.png" || true
adb logcat -d -t 16000 > "$GITHUB_WORKSPACE/android-game-evidence/runtime-logcat.txt" || true
exit "$result"

# Environment-level validation limitations

The repository-level audits and deterministic test suite pass in the Linux sandbox. These platform/build validations could not be completed locally because the sandbox does not provide the required native SDKs or reachable external distribution hosts:

- Web `build` / `typecheck` / `lint`: the sandbox's Node dependency installation is incomplete and npm cannot complete a locked reinstall because external package distribution/network access is unavailable.
- Android Gradle build/test/lint: Android SDK components and an uncached Gradle distribution are unavailable here; the repository's macOS/Linux CI workflows remain the authoritative Android build path.
- Full iOS Xcode build/test: Xcode, `xcodebuild`, and the iOS SDK are unavailable on Linux.
- Linux `swiftc` can typecheck Foundation-only native engine sources, but Apple-only frameworks used by production files (for example `Combine` and `NaturalLanguage`) are intentionally unavailable.
- Kotlin engine source inspection/coverage generation is complete, but source-only `kotlinc` compilation cannot reproduce Android's `org.json` classes without the Android SDK.

No blocked platform/build check is represented as a passing native application build.

AI-specific validation:

- Native AI contract audit (`check-native-ai`) passes: all 17 active AI bindings are present in the canonical catalog and wired to both Kotlin and Swift clients.
- The server AI source and routes are merged, but the full `check:ai` / TypeScript AI test execution could not be rerun after the last merge because `npm ci --offline` cannot satisfy the lockfile from the sandbox cache; the environment has no reachable npm package distribution.
- The supplied Render backend URL is configured for native builds; live API reachability was not asserted from this sandbox because outbound DNS/network access is unavailable here.

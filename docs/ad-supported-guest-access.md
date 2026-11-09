# Hybrid ad-supported guest access

## Product rule

The hybrid economy applies only to tool IDs explicitly selected for the cohort.

- **Online:** a selected tool is publicly usable without enV sign-in. Ads are an optional funding placement below the tool interface. Tool execution does not depend on an ad being filled or clicked.
- **Offline:** the same selected tool requires an authenticated enV account and a valid, pre-issued offline allowance. The allowance must be active, unexpired, and use the current offline pricing version. A failed/missing allowance rejects the operation before the tool computes or reveals a result.
- **Unselected tools:** retain their existing access and offline policy. The feature must not silently broaden to every local tool.

The selected hybrid cohort is intersected with `src/data/offline-eligible-tools.json`. Each candidate must already have a `local.*` billing profile and explicit `web`, `android`, and `ios` platform coverage. The Web, Android, and iOS execution boundaries all enforce the offline rule independently in their native implementation.

## Safety defaults

Advertising is **off by default** in Web, Android, and iOS builds. Blank provider IDs, blank allowlists, or an unconfigured privacy flag fail closed. Do not enable the feature until you have completed the relevant publisher account setup, privacy messaging, test-device setup, and release review.

The selected-tool allowlist is also the offline-access boundary and is evaluated inde¶»§q«^
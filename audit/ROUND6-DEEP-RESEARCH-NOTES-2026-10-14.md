# enV Developer Studios — Round 6 Research Notes

**Research date:** 14 October 2026. This note separates external documentation from implementation facts and environment-limited conclusions.

## Maintained parser choice: SQL

The maintained `sql-formatter` package is licensed MIT and offers explicit dialect grammars for SQL-family dialects including PostgreSQL, MySQL/MariaDB, SQLite, BigQuery, Snowflake, SQL Server/T-SQL, Oracle PL/SQL, Redshift and DuckDB, among others. Its own documentation also notes limitations: stored procedures are not supported and statement delimiters other than `;` are unsupported. enV uses it only for local query layout; it does not execute queries, inspect schema or certify query safety.

Sources:
- npm package / published version and supported dialects: https://www.npmjs.com/package/sql-formatter
- Upstream package manifest and license: https://github.com/sql-formatter-org/sql-formatter/blob/master/package.json

## Maintained formatter choice: Prettier standalone

Prettier documents a browser standalone build that relies on callers explicitly supplying parser plugins. enV therefore uses explicit local plugin imports for CSS/PostCSS, HTML, YAML, Markdown and GraphQL rather than a remote formatter service or CDN-loaded plugin. JavaScript/TypeScript uses the existing compiler/printer path. XML is a deliberate exception: Prettier's standard standalone plugin set does not provide a guaranteed XML parser, so Web XML uses a conservative structural preflight and the HTML printer. The UI and implementation report disclose that this is not a full XML 1.0 parser.

Sources:
- https://prettier.io/docs/browser
- https://prettier.io/docs/plugins

## Regex reliability and execution boundaries

The Web Regex Studio has killable Worker execution and a hard timeout; regression tests verify deadline and cancellation behavior. Benchmark values are local-device samples, not stable competitor scores. Android's Java `Pattern` and iOS's ICU/Foundation regular-expression APIs cannot be stopped as reliably mid-match as a dedicated disposable Web Worker; their limits/risk heuristics are not described as equivalent to a hard cancellation boundary. Cross-engine syntax inspection is advisory: JavaScript is the only regex flavor actually executed by the Web Regex Studio.

## Privacy and browser audit

OWASP cautions that browser storage accessible to JavaScript should not hold sensitive information because successful script injection can read it. The audit deliberately submits synthetic sentinels, checks for egress through request URLs/bodies and searches browser storage locations for those sentinels. This is a useful regression test—not a proof that all production paths are private, and it must be run against the actual built application on every meaningful release.

Source: https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html

## CI and reproducibility

Playwright's official CI guidance installs project dependencies and browser binaries on the CI worker. enV's new quality workflow follows that model and saves the privacy/accessibility and formatter benchmark JSON as artifacts. Existing platform workflows remain authoritative for Android Gradle tests and iOS simulator build/XCTest; source checks in a Linux container are not substitutes for those native builds.

Source: https://playwright.dev/docs/ci

## Evidence still required before claiming premium superiority

1. Install the actual locked dependencies and run the whole parser test suite against all supported dialect fixtures.
2. Regenerate and verify the missing `sql-formatter` lockfile integrity digest from the official registry.
3. Run Playwright + axe against built routes, inspect every failed network/storage case, and repeat on representative mobile viewport/device profiles.
4. Run Android Gradle tests/lint and iOS Xcode build/XCTest on supported runners.
5. Run the local benchmark on documented hardware/browser/build settings, then compare against competitors using the exact same fixtures, versions, correctness assertions and latency definition.
6. Test representative production payload sizes, malformed inputs, Unicode, comments/literals, and known unsupported dialect constructs. A pretty-looking result alone is not correctness proof.

No claim is made that enV currently beats every paid product or premium tier; the round implements an evidence-producing path toward a credible comparison.

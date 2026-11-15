# Individual Web Tool Functional Audit Ledger

## Purpose

The ledger is generated from the final Web runtime registry, not from the SEO sitemap, the shared native catalogue, or a hand-maintained count. It creates one row per stable tool ID from `getAllTools()` in `src/lib/registry.ts`. The searchable/discovery count is recorded separately from the runtime denominator.

Run locally:

```sh
npm run audit:tool-ledger
```

The script writes `audit/tool-functional-audit-ledger.json`. The Production Check workflow generates and uploads the same machine-readable file as the `tool-functional-audit-ledger` Actions artifact, including when its later verification step fails.

## Status semantics

The row-level `auditStatus` is the highest evidence stage reached for that individual ID.

- `NOT_INSPECTED`: no evidence yet.
- `SOURCE_INSPECTED`: the implementation source for this tool was manually inspected.
- `STATIC_CHECKED`: stable identity, registry membership, category declaration, engine metadata declaration and route resolver lookup were checked. This does **not** mean a page rendered or its functionality was tested.
- `UNIT_TESTED`: a passing unit test explicitly covers this tool ID.
- `BROWSER_TESTED`: a passing browser audit explicitly covers this tool ID.
- `NATIVE_TESTED`: a passing native test explicitly covers this tool ID on the stated native platform.
- `VERIFIED`: all applicable checks have per-tool evidence; never inferred from a build, a category count, a route listing or a manifest.
- `BLOCKED`: a required audit is blocked and the reason is recorded.
- `DEFECT_FOUND`: a concrete tool-specific defect is evidenced.
- `NOT_APPLICABLE`: a check is genuinely inapplicable and the reason is explicit.

The `checks` object is more granular than `auditStatus`. An individual browser pass does not promote unrelated security, token, backend, offline or native checks.

## Evidence policy

The checked-in `tool-functional-audit-evidence.json` contains the exact browser test scopes and their workflow/job references. The generator resolves selectors to actual runtime IDs, checks expected record counts, and rejects evidence that refers to unknown IDs. The evidence carries the commit on which those tests were observed; it is not silently rewritten as a test of a later commit.

Native tool lists are recorded as manifest membership only. The native execution matrix is a classification artifact, not proof that each native tool was individually executed. Android/iOS native test status stays uninspected unless a per-ID test report is added.

## Current known limits

- `STATIC_CHECKED` validates registry metadata and route-resolver lookup, not rendered pages.
- Browser coverage is limited to the exact tool IDs in the evidence manifest. The 93 Celebrations records, six file-workspace records, ZIP workflow, three QR/barcode records and one AI Music Data Sandbox record are not proxies for their entire categories.
- No tool is marked `VERIFIED` by the ledger generator.
- Checks for all visible controls, malformed/boundary input coverage, errors/recovery, loading/disabled/success states, enV token enforcement, authorization, backend failure modes, offline behavior, privacy/security and independent native execution remain open unless the row contains direct evidence.

## Required continuation

Audit each category using stable IDs. For each tool, inspect its component and engine dispatch, execute the real browser/native path, cover representative and boundary inputs, verify all visible controls and outputs, and attach test evidence to that exact ID. Upgrade the row only after those checks pass. Keep Web, Android and iOS evidence separate.

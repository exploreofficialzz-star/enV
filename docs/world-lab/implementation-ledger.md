# The World Lab — implementation ledger

Status: **FOUNDATION UNDER CONSTRUCTION — NOT A PRODUCTION RELEASE.**

Source documents: *The World Lab — Production Build Master Prompt* (30 Oct 2026)
and *The Interconnected World* 205-chapter master book plus chapters 194–205
specialist supplement. The source markdown includes exactly 205 numbered
chapters; the 12-chapter supplement overlaps chapters 194–205 and is not 12
extra chapters. The source books are topic/evidence catalogs, not executable
scientific solver implementations.

Source SHA-256:
- Master prompt PDF: \`67bc02c90c6795d4b2d94102af9407e09e29cf42ea77db176e7403c1f9f0d293\`
- Source ZIP: \`553778563cf4afa4f716687024306ed2ba98b0223fee2213a9fa4c42a8f33e33\`
- Master markdown: \`dafa99bfa11313f653811867502e1ea030b44071d1328e81a887bf24a704f5a4\`
- Specialist markdown: \`015e30f5bc950d53e9279a81dccd62649e135a785e839976219a577ae52dcdf3\`
- Verified calculations CSV: \`922dd4d95e07b7925a1c8de7940bdf8dff98f83e4ec142d335fe5a16cbc53997\`

## Implemented reference and interchange capabilities (release still gated)

- Deterministic, bounded local 1D mass–spring–damper using RK4;
  numerical benchmarks against analytic undamped motion and energy.
- Ideal DC RC reference model with analytic time constant, current, heat
  and stored-energy outputs.
- Explicit UTC world-date, solver dt, simulated time and independent
  playback speed; branch lineage, immutable trajectories and evidence label.
- Proposed novel-material schema that does not invent missing properties.
- Insulated 1D heat diffusion with a numerical conservation-form finite-volume
  model (21 cells, adaptive substepping to meet an explicit stability bound).
- Strict `env-world-lab` v1 project schema, 1 MB import budget, bounded graph,
  material reference integrity, safe read-only `env-3d-game` v1 primitive
  converter and explicit conversion warnings.
- Optimistic revision-checked IndexedDB project persistence and portable JSON
  export/import with rollback-safe conflict rejection. Cloud sync is **not** enabled.
- Browser-based construction of cubes/spheres/cylinders, analytic volume and
  optional mass from **user-assumed** material density; no unsupported
  structural failure or manufacturability claim.
- WGS84 geodetic/ECEF/ENU double-precision coordinate-transform library with
  numerical round-trip fixtures. This is **not** globally mapped terrain.
- Shared v1 fixture and matching strict Kotlin and Swift project decoders;
  native renderer/editor integration remains a separate uncompleted gate.
- Chromium workflow checking actual Web UI creation, numerical model interaction,
  time, transparency, export/reload, offline reference calculation, legacy
  import and responsive narrow-screen layout.
- Actual hypothetical-mass coupling: selected parametric geometry volume times
  user-assumed material density becomes a lumped 1D spring model mass, with
  immutable exported provenance, mismatch rejection, bounded solver checks,
  and explicit exclusion of deformation/material-strength claims.
- Custom X/Y/Z transforms and sphere/cylinder dimensional constraints,
  focus and zoom in the Web viewer, and an accessible visual graph of actual
  recorded solver samples (not visual-only invented points).
- Same-model, same-duration recorded branch comparisons with time-aligned
  observed-value differences; previous runs retain their original inputs.
- IndexedDB v2 run archive with per-project ownership keys, immutable run
  IDs, structural/finite/numerical time-grid validation, 8 MB/run and 20
  runs/project limits, reload recovery and explicit local-run deletion.
  This is device storage, **not** hosted user authentication or cloud sync.
- `better-auth` updated to audited patched version 1.7.14, with the
  removed generic OAuth client plugin migrated and build/auth contracts checked.

**Limitations**: these are verified teaching/reference model implementations
within narrow documented envelopes, not universal mechanics or a guarantee of
manufacturability. No authenticated project storage, multiphysics solver,
Earth/space datasets, chemistry, real-world engineering safety certificate,
native UI parity, security release gate or device validation exists in this slice.

## Baseline repository status

At main commit \`f9d78deffd02c14e56448ed565279e4970cdcc17\`, CI was
already failing: Developer Studio route smoke hard-coded 13 routes although
the current catalog defines 14, and Android release packaging exhausted
the Gradle Java heap. The initial dependency audit reported vulnerabilities; a later isolated
  lockfile upgrade to Better Auth 1.7.14 passed `npm audit --audit-level=moderate`
  with zero findings at that time. The audit must remain mandatory.
Record new failures separately from these pre-existing failures.

## Work-package gate map

- WP-00 source inventory + CI baseline: **partial**; 205 numbered topics and
  all 105 specified acceptance scenarios have been indexed and versioned.
  Independent evidence linking for every scientific claim remains required.
- WP-01 canonical schema, units, model contracts: **partial**, portable v1
  local scene schema with strict Web/Android/iOS decoders and shared fixtures.
- WP-02 observer world/camera: **representative Web view only**; no accurate
  Earth subsurface/sky scale or native world camera release.
- WP-03 parametric construction: **bounded Web geometry editor only**;
  no production CAD constraints, assembly mating, solver meshes or native editing.
- WP-04 time/recording/branches: **bounded Web reference engine**; independent
  playback, immutable recorded runs, numerical plots, branch comparison and
  validated per-project IndexedDB history with 20-run cap. Server checkpoints,
  long-horizon solvers and synchronized multi-device history remain missing.
- WP-05 validated physics: **three bounded educational models only**:
  oscillator, ideal RC and insulated 1D heat. Their known validity envelopes
  and numerical regression tests do not establish general physics coverage.
- WP-06 FMI/remote solver: **not started**.
- WP-07 geospatial/atmosphere/space: **coordinate transform math only**;
  no licensed measured terrain, weather or ephemerides, and no continuous
  ground-to-astronomy transition.
- WP-08 materials/chemistry/biology/digital: **hypothetical material
  properties plus analytic geometry only**; domain solvers remain missing.
- WP-09 Web/Android/iOS/auth/offline parity: **partial serialization parity**;
  local Web project/run archiving is implemented; native Kotlin/Swift scene
  editing, native visualization/solvers and secure synchronized project
  ownership are not yet integrated. Existing auth
  upgrade is not a substitute for authorization integration.
- WP-10 production hardening/rollout: **blocked by test evidence**.

## Migration and compatibility rule

Do not yet delete or rename Artboard Studio in the visible catalog. It has
game-scene project format \`env-3d-game\` (v1), not the science project
format and native parity that The World Lab requires. Preserve the UX/UI
Studio and its Artboard handoff until explicit compatible adapters, project
import tests, and Web/Android/iOS quality gates pass. A deliberate feature
gate and truthful capability labels are required for further rollout.

## Release evidence and acceptance controls

The detailed source requirements live in `docs/world-lab/chapter-coverage.csv`
(205 chapters) and `docs/world-lab/acceptance-scenarios.csv` (105 scenarios).
A chapter marked PARTIAL_TOPIC_REFERENCE has at least one bounded educational
example, **not** complete scientific coverage of that chapter.

The dedicated World Lab pipeline executes pure numerical unit tests, Zod
schema/import tests, WGS84 coordinate tests, Web build/typechecking, and
rendered Playwright scenarios. The broader platform pipelines must additionally
pass authentication/security audits, Android Gradle tests, Apple Xcode and
device tests, accessibility, scientific-domain acceptance reviews and release
approval. Never replace an unverified scenario with a passing label based
on an adjacent smoke test.

Even after all current tests go green, the product cannot be called
production-ready under the master PDF: remote advanced physics and coupled
solvers, Earth/space observational datasets, full native editors, security
isolation for user code, scientific validity ledgers and a multi-device
release-candidate evidence bundle are unfinished.

## Native experiment surfaces (2026-10-30)
- Kotlin and Swift have independently tested bounded native spring, RC and insulated heat computations, matching Web scientific model 1.0.0 equations.
- Android Compose provides offline experiment controls, timeline/slow motion, numeric computed states, heat-cell schematic, strict portable project import/inspection and optional hypothetical density-derived spring mass. Android canvas is not a volumetric renderer.
- iOS SwiftUI provides SceneKit illustrative 3D solids and solver-linked heat colors, offline experiment controls/time scrub, strict project import, volume and hypothetical mass, without claiming any coupled 3D physics.
- Three platform catalogs list World Lab independently alongside existing Artboard and UX/UI Studios. Native authoring/export and full multi-physics parity remain production gaps.

## 2026-10-30 native CI hardening
- The native Swift project editor now explicitly rejects NaN, Infinity, out-of-envelope hypothetical density/modulus, and invalid solid dimension vectors before Foundation JSON serialization; corresponding iOS XCTest negative cases cover these failures. This prevents Foundation's Objective-C NaN serialization exception from escaping the UI error boundary.
- The Android native game-preview workflow retains emulator instrumentation and graphics test coverage but changes emulator GPU mode from host GL to SwiftShader GLES after a host-GPU run completed all tests then lost ADB connection during test-apk cleanup. The replacement emulator mode is a stability experiment, not an assertion of device coverage.

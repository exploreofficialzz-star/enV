# The World Lab — implementation ledger

Status: **FOUNDATION UNDER CONSTRUCTION — NOT A PRODUCTION RELEASE.**

Source documents: *The World Lab — Production Build Master Prompt* (30 Oct 2026)
and *The Interconnected World* 205-chapter master book plus chapters 194–205
specialist supplement. The source markdown includes exactly 205 numbered
chapters; the 12-chapter supplement overlaps chapters 194–205 and is not 12
extra chapters. The source books are topic/evidence catalogs, not executable
scientific solver implementations.

Source SHA-256:
- Master prompt PDF: `67bc02c90c6795d4b2d94102af9407e09e29cf42ea77db176e7403c1f9f0d293`
- Source ZIP: `553778563cf4afa4f716687024306ed2ba98b0223fee2213a9fa4c42a8f33e33`
- Master markdown: `dafa99bfa11313f653811867502e1ea030b44071d1328e81a887bf24a704f5a4`
- Specialist markdown: `015e30f5bc950d53e9279a81dccd62649e135a785e839976219a577ae52dcdf3`
- Verified calculations CSV: `922dd4d95e07b7925a1c8de7940bdf8dff98f83e4ec142d335fe5a16cbc53997`

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

At main commit `f9d78deffd02c14e56448ed565279e4970cdcc17`, CI was
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
game-scene project format `env-3d-game` (v1), not the science project
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

## Offline native project recovery (2026-10-30)
- App-private Android and iOS project stores support portable v1 read/save, strict revalidation on disk, atomic file writes, guarded 1 MB/50-project limits, and optimistic revision conflict rejection without silent last-write-wins.
- Android Compose and iOS SwiftUI expose **Save locally** and **Open saved**, display unsaved status, and require explicit confirmation before replacing unsaved work with a new or saved project. Exports remain available. The saved project stays on the local device; **account-backed sync and automatic recovery of unsaved edits remain missing**.
- Unit tests cover save/reopen, stale revision refusal, path traversal and corrupted on-disk state. Backend storage, multi-device merge and authentication are separate release work packages.

## Latest native import and emulator safeguards
- Import now asks before replacing unsaved World Lab work on Android and iOS, just like New Project and Open Last Saved; the iOS FileDocument read path also checks the 1 MB cap.
- The Android game-preview emulator runs with `-gpu swiftshader`, the documented supported SwiftShader backend rather than deprecated `swiftshader_indirect`, preserving real rendered assertions without host-GPU dependency.

## Numerical self-audit and source inventory continuation (2026-10-30)

- Added an independent second-pass, halved-timestep audit for the existing bounded 1D electrical-to-mechanical actuator. Compares actual height and current trajectories at original time samples and checks normalized first-law residuals against documented 1% state-sensitivity and 2% energy tolerances. An uncomputable refinement is **unavailable**, never a pass. Web shows the audit adjacent to live computed fields and uses an accessible warning for exceeded thresholds. Analytic laws and externally measured properties are **not** certified by this internal check.
- Regression coverage includes zero-power conservation, deterministic computed traces, deliberately altered energy evidence, non-finite recorded data and solver-resolution exhaustion.
- Indexed the actual user-provided research ZIP in `docs/world-lab/research-source-manifest.json`, including SHA-256 and byte sizes of both PDFs, both Markdown books, calculations CSV and four illustrations. The master has exactly 205 numbered chapters; the supplement repeats/deepens chapters 194–205, **not** 12 additional independent chapters. Source topic inventory is distinct from implemented scientific capability and verified acceptance.
- This check is implemented on the Web actuator run only. Kotlin/Swift numerical self-audit parity, independently calibrated physical validation, device rendering and WP-06–WP-10 remain open. Keep PR #59 draft and do not replace Artboard Studio yet.

## Native parity extension: actuator numerical diagnostics (2026-10-30)

- Android Kotlin and iOS Swift independently track supplied Joule energy and dissipated Joule energy in each native actuator sample, matching the existing Web solver's balance quantities. Each native solver implements its own halved-timestep consistency check against its own trajectory with bounded numerical budgets and explicit `unavailable` results. Native unit/XCTest coverage includes the powered case and exact zero-power conservation.
- Native Compose and SwiftUI actuator readouts now show an internal numerical self-check status and explanation. This is only numerical self-consistency of the bounded R-L/1D assumed model; it does **not** demonstrate calibrated science, physical motor certification or generic multiphysics.
- All platform-specific code stays in Kotlin, Swift and TypeScript, respectively; no renderer, font, branding or unrelated tool is changed. Device acceptance and native accessibility must still be proven on this exact SHA.

## Integrated coil heating and electrical feedback — additive v1.1 (2026-10-30)

- Added optional Web 1D electro-thermal-mechanical RK4 coupling: electrical Joule losses heat a lumped coil with user-assumed heat capacity, temperature alters coil resistance, changed resistance feeds back into current/force, and cooling exports thermal energy. Solver samples now carry calculated temperature, resistance, stored thermal energy, and cooling power. The integrated energy balance counts stored heat as internal energy rather than treating it as external dissipation. Existing thermal-disabled run format and model version `1.0.0` remain readable; opt-in thermal runs identify `1.1.0` with explicit validity limits.
- Web has progressive-disclosure thermal controls, Kelvin/Ohm/Joule/watt readouts and run export, and the numerical self-check handles thermal stored energy. New numerical regression cases are written for coupled feedback and rejected nonphysical parameters. No full CI audit has been claimed in this implementation batch.
- Native Kotlin and Swift thermal model parity is a separate integration step, not assumed from Web. Model uses assumed—not observed—thermal properties; real material behavior cannot be inferred.

## Android native electrothermal coupling implementation — 2026-10-30

- Kotlin's four-state RK4 now models current, height, velocity and coil temperature in one timestep; resistance is computed from temperature and feeds back into lifting force. Cooling and stored thermal energy enter the first-law ledger rather than pretending all resistance heat is environmental loss.
- An opt-in Android native control and solver-based temperature/resistance/cooling readouts preserve the original motor mode; numerical self-check includes thermal energy. Native invalid-assumption and feedback tests authored; CI deferred to requested combined audit.

## iOS native electrothermal integration (2026-10-30)

- Swift's native 1D RK4 now evolves coil temperature, resistance, voltage/current and mechanical height together, keeping the energy balance through stored thermal energy and cooling. The native UI offers an opt-in thermal mechanism and calculated temperature/resistance/cooling results. Native audit supports 1.1.0; XCTest coverage authored. Exact-head build and simulator audit are intentionally deferred to the consolidated verification pass.

## Typed portable DC circuit graph and connected reference solver (2026-10-30)

- World Lab project v1 accepts an optional, strictly bounded `networks` graph with explicit nodes, ground, source/resistor terminals, and genuinely unknown hypothetical devices; older projects without `networks` remain valid. Existing local saving and JSON portability retain network data. Created a connected modified-nodal-analysis (MNA) DC reference solver with source-current variables, Gaussian partial pivoting, floating/contradictory circuit rejection, SI bounds, and Kirchhoff first-law power residual checks. No imaginary physics is assigned to an unknown device.
- Web adds first circuit creation, editable voltage/resistance, parallel resistor wiring, invented unknown device entries, solver outputs, and evidence JSON. The new network regression suite covers parallel current conservation, floating nodes, inconsistent voltage sources, v1 portability and unsupported inventions; tests are written but the requested consolidated audit has not been run.
- **Cross-platform acceptance pending:** native Kotlin/Swift strict portable project decoders currently reject optional network JSON; synchronize their codecs and editing roundtrips before treating network portability as platform-wide.

## Native project network interchange protection (2026-10-30)

- Kotlin and Swift strict decoders now accept the optional connected electrical networks field, reject unknown component fields, dangling ports, duplicate IDs, missing ground and nonfinite/out-of-range source/resistance assumptions. Existing network-less v1 fixtures remain accepted, and native editors now create projects with an empty networks collection. Native raw JSON editor roundtrips retain uploaded circuit records instead of dropping them.
- Platform-specific tests authored for valid network ports and corrupt networks. This does not mean a native circuit solver or graphical wire authoring is implemented; both remain separate work. Full verification deferred to requested audit phase.

## Android connected DC solver and UI (2026-10-30)

- Android Kotlin now solves the same typed grounded DC node graph with modified nodal analysis and power-conservation rejection. Native editor creates a starter source/resistor circuit and adds parallel resistors; native UI calculates node/branch power and shows numeric currents without fabricated animations. Project revision invalidates stale circuit results. Tests are authored, not yet run per requested integration-first sequence.

## Native Swift DC circuits and UI integration (2026-10-30)

- Swift's portable network graph is now solved with a native modified-nodal-analysis DC circuit solver, including ideal voltage constraints, passive ohmic currents, rank rejection, and an energy-power conservation ledger. Swift native editors create a first circuit and parallel resistors with revision-safe project mutations. SwiftUI presents calculated currents and power, rejects unknown inventions instead of guessing properties, and invalidates results after edits. The XCTest cases are authored; consolidated verification is deliberately deferred.

## Cross-platform circuit editing continuation (2026-10-30)

- Parallel resistor wiring now derives its positive/negative ports from the source component, rather than hard-coded node identifiers. Native Kotlin and Swift interfaces can adjust bounded source voltage and resistance, remove resistors, and recompute on changed project revisions. Web users can remove hypothetical components (which otherwise would permanently prevent DC solving) and also remove passive loads. The source voltage display follows the source's actual positive node.
- Platform changes retain all unrelated studio behavior. Audits remain deferred as requested; the committed source is not yet described as a released production platform.

## Ideal-source electrical-network-to-motor coupling (2026-10-30)

- Added Web `network-motor.ts` integration: one ideal DC voltage source and its passive graph feed an optional thermal 1D motor branch wired across the source. At every motor timestep, KCL source current includes both passive load and dynamic motor current. The combined energy record sums DC passive resistor power/energy with motor source work, thermal/mechanical energy and losses; export includes both provenance-bearing runs. Invalid/hypothetical devices, multiple sources or reverse polarity fail explicitly.
- Web motor controls can now select an ideal circuit-powered drive and show source current/voltage, calculated passive heating and motor trajectory. This is genuinely interconnected under the **ideal stiff-voltage-source assumption**, not a nonlinear finite-battery or general circuit co-simulator. New regression tests authored, not run; native equivalent integration and full audit remain outstanding.

## Android connected ideal source and actuator implementation (2026-10-30)

- The native Kotlin graph's one ideal source now drives a dynamic electromechanical motor branch in parallel with passive loads. Its source-current and power ledger accounts for both the motor and resistor network at each numerical motor sample; the native UI displays calculated total source current, resistor heat and combined energy residual. No finite battery sag is implied. Added a regression case; deferred CI as requested.

## iOS ideal-source network motor co-simulation (2026-10-30)

- Added native Swift wired DC motor calculation that attaches a dynamic, optionally heated actuator branch to one supported ideal source; source current, passive resistor heat and shared energy balance now reflect the motor's live state. SwiftUI renders the connected output and stale project revisions invalidate it. Added native XCTest coverage. No finite battery behavior or universal multicomponent transient solver is claimed; final CI deferred as directed.

## Fluid-mechanical coupling: static hydrostatics (2026-10-30)

- Added `hydrostatics.ts`: calculates actual submerged box, circular vertical cylinder and spherical-cap volumes; water/fluid mass displacement, buoyancy, bottom hydrostatic gauge pressure, gravitational weight and net vertical force. With assumed material density it solves free-floating upright equilibrium draft via deterministic 64-step bounded bisection. Unknown density yields null net force/draft, not a guessed material. Actual project ID/revision, shape/material references and modeling limitations are preserved in exported evidence.
- Web has a fluid-density and immersion-depth panel on selected inventions, with calculated numeric results and evidence export. Tests authored for Archimedes/half-sphere exactness, sinking and unknown matter; full CI deferred per request. No hydrodynamics, deformation, stability, weather, surface-tension or physical fluid observations claimed.

## Android fluid/Archimedes experiment (2026-10-30)

- Implemented native Kotlin static buoyancy for upright boxes, cylinders, spherical caps using exact immersion geometry; source project material assumptions, pressure, gravitational net force and 64-step draft balancing. Compose gives child-friendly fluid density, immersion slider, calculated results and unknown-mass disclosure, retaining native styling. Regression authored, consolidated audit deferred.

## iOS fluid-mechanical reference (2026-10-30)

- Implemented independent Swift Archimedes solver for ideal immersed boxes, spheres (spherical caps) and upright cylinders, with numerical equilibrium draft, fluid pressure and explicit unknown-mass status. SwiftUI exposes an accessible density/immersion control and scientific readouts. Added platform-native XCTest source; comprehensive audit deferred as directed. This closes source-level hydrostatics parity, not verified native execution.

## Hypothetical component model assumptions — source implementation (2026-10-30)

- Portable Web network schema now accepts an optional explicit assumed Ohmic-equivalent resistance for invented components. Previously unmodelled inventions still fail closed; components with user-supplied positive bounded resistance enter actual MNA current and Joule heat accounting while remaining tagged hypothetical, and evidence lists their exact IDs. Web UI lets inventors opt into this assumption without presenting it as discovered conductivity. Native decoder/solver parity for this optional field is the next source batch. Full audits remain deferred by request.

## Native inventor-defined electrical assumptions (2026-10-30)

- Native Kotlin and Swift portable decoders now accept an optional finite user-assumed Ohmic equivalent for invented devices, preserving optional absence and rejecting unknown keys and invalid values. Their MNA solvers include such components in true branch-current and Joule-heat balances only when the assumption is supplied; otherwise the circuit fails closed. Native validated editors can append independently invented devices to existing source terminals. No claim that the invented substance is physically characterized.

## Native invented-device authoring and cross-domain preservation (2026-10-30)

- Android Compose and SwiftUI now let users create a named, explicitly hypothetical electrical component, enter a descriptive assumption, and optionally supply equivalent resistance. Native project editors validate bounds and preserve owner-local portable records; platform-native solver tests cover absent/assumed laws and conservation. Web motor path also avoids deriving identical source assumptions twice. No scientific certification, platform CI or release readiness is claimed.

## Auth-gated server calculation entry point (2026-10-30)

- Added a disabled-by-default `POST /api/world-lab/calculate` Nitro endpoint requiring **real better-auth session**; never uses shared `dev-user` fallback. Requires configured auth and `WORLD_LAB_SERVER_COMPUTE_ENABLED=true`, canonical same-origin request, 64KB streamed JSON budget and <=2MB output. Handles supported hydrostatics, DC network and at most 2-second wired-motor reference calculation with strict bounded dispatch; project data is provided by owner each call and is not persisted, shared or loaded by guessed project IDs.
- No persistent job queue, distributed quota, cancellation, retries, billing, streamed telemetry, solver isolation, durability, server observability, customer deployment or external advanced solver adapter exists. **This is not completed WP-06** and must remain disabled until security/performance/deployment checks and durable quota infrastructure are delivered. Unit/regression source is authored but not run per the explicit integration-first request.

## Reproducible circuit evidence and topology visualization (2026-10-30)

- DC solver results now contain the full network component/node input snapshot as well as revision IDs on Web, Android and iOS. Web deep-copies and freezes nested nodes/components, protecting exported evidence against later rewiring. Native value-type/decoder-built models retain corresponding snapshots with source and assumption metadata.
- Added a responsive, read-only, accessible two-node rail schematic derived from actual node IDs, with branch current labels from solver output, explicit hypothetical outlines and sign conventions. Multi-node imports use a conservative textual connection graph instead of falsely inventing wire crossings. Existing enV fonts and unrelated UX are unchanged. All new source remains unverified until the requested consolidated audit.

## Durable user-owned World Lab computation queue (2026-10-30)

- Added migration 0009 with user foreign key, idempotency, bounded JSON, queued/running/succeeded/failed/cancelled statuses, worker leases, indexes and RLS without direct Data API policies. Source-only SQL: not yet applied to live Supabase.
- Implemented per-owner transactional submission (3 active, 30 hourly), user-scoped lookups/cancellation, compare-and-set lease claim/retry with 3-attempt cap and stale-worker result protection. A dedicated process worker evaluates only the existing constrained science dispatcher; not started/deployed. Feature remains gated behind real authentication, DATABASE_URL and WORLD_LAB_JOBS_ENABLED=true. The end-to-end lifecycle and hosting must be independently verified in a later audit.

## World Lab jobs HTTP integration (2026-10-30)

- Added auth-gated same-origin owner-scoped POST submit, GET status and POST cancel endpoints on the durable job ledger. Shared session and bounded-body helper fails closed when jobs/auth/Postgres are not configured. Public response excludes user IDs, raw inputs and internal storage details, and only exposes completed result to its owner. Added the feature activation/run contract. SQL not migrated, worker not deployed and no CI executed per user's integration-first request.

## Remote computation UI activation path (2026-10-30)

- Added Web submit/status polling/cancellation/evidence export for account-owned jobs using the actual documented endpoints. UI is absent unless build-time VITE_WORLD_LAB_JOBS_ENABLED=true. Runtime endpoints separately require verified auth, PostgreSQL, WORLD_LAB_JOBS_ENABLED=true, and a private worker. The interface invalidates stale jobs on project revision changes, keeps locally saved projects untouched, and only reveals completed owned results. Runtime remains disabled pending infrastructure/security/CI acceptance; not marketed as working cloud infrastructure.

## Solver-driven fluid cutaway (2026-10-30)

- Added a read-only accessible Web fluid surface cross-section following the actual user-selected immersion depth (0–100% vertical extent), tied to the numerical Archimedes result of the selected invented primitive. Waterline and legend clearly identify this as a 2D illustrative cutaway; volumetric buoyancy remains independently computed from exact primitive geometry and unknown material properties are never invented. Native platforms continue their numeric readouts; full visual/solver acceptance deferred.

## Web undo/redo and geometry tools (2026-10-31)

- Integrated a 50-entry, project-local undo/redo history into Web edits of solids, invented materials and circuit graphs. All snapshots validate the strict portable format; redo is discarded on a new edit, and save/import/new/open reset the in-memory undo timeline without altering saved experiment evidence. Editing and reversing invalidate active solver results, not archived evidence.
- Added SI grid snap for selected solid center and center-to-center/horizontal/delta displacement measurement between two created objects, with geometry-only disclaimers and touch-friendly controls. Regression tests registered for the consolidated audit. Kotlin/Swift affordance parity is not claimed yet.

## Android native spatial authoring and measurement (2026-10-31)

- Added validated Kotlin `positionSolid`/`snapSolid` SI editor operations and separate pure `measureCenters` geometry calculations. The Compose screen now exposes selectable grid spacing, snap-center and measurement between the selected and a changeable second solid; numeric vertical, horizontal and 3D offsets are distinguished from physical contact. Regression cases cover strict portable roundtrips, invalid positioning and 3-4-12 centre separation. Native iOS and full CI acceptance remain distinct.

## iOS native spatial authoring parity (2026-10-31)

- Swift now has strict SI `positionSolid`, `snapSolid` and independent center-distance/horizontal displacement calculations, with a native picker for grid sizes and target solid and a geometry-only disclaimer. Added XCTest cases for 3D Pythagorean distance, grid roundtrip and rejecting nonfinite/unsupported positions. These are native source integrations; simulator/XCTest acceptance is deferred to the full audit.

## Portable multi-node circuit wiring authoring (2026-10-31)

- The advanced Web circuit editor now adds bounded named node junctions, supports connecting resistors across any two distinct existing nodes, rewires actual source/resistor/hypothetical terminals, and removes only electrically unused nodes. No fake visual crossings are introduced; existing multi-node topology list displays real graph connections. The DC solver already handles arbitrary connected nodal networks via MNA; series-voltage-divider and Kirchhoff conservation regressions are authored and registered for later CI.
- Existing portable schema/strict native parsers continue to accept graph edits from imported JSON. Native graphical arbitrary-node authoring remains unimplemented and will require separate UIKit/Compose integration; no claim of complete parity or finished electronics made.

## Android native multi-node wiring (2026-10-31)

- Kotlin project editors now add named circuit junctions, add resistors across chosen nodes, rewire either component terminal and safely delete only unused non-ground nodes. Compose includes an advanced node/terminal panel with touch-oriented controls, preserving all native project validation and scientific result invalidation. Regression source covers a real 9V 100Ω+200Ω series divider (6V intermediate node, 30mA current) and rejects dangling terminal edits. Build/test audit deferred per requested build-first sequence.

## iOS native multi-node circuit authoring (2026-10-31)

- Added Swift native editor methods to create/remove bounded junctions, connect arbitrary resistors, and rewire actual component terminal IDs without dangling, same-node, ground-deletion, or resource-limit violations. SwiftUI exposes progressive connection controls and terminal pickers using the portable graph; source-based XCTest covers the 9V series divider/Kirchhoff power result and rejected invalid rewiring. All changes remain on draft PR #59 pending full native build and simulator verification.

## Time-dependent buoyant motion and 3D fluid layer (2026-10-31)

- Added a Web fluid motion experiment that advances an invented solid's vertical position using immersed primitive geometry at each timestep, Archimedes force, gravity, assumed linear viscous drag, and an inelastic ground constraint. Sampled results report submergence, velocity, buoyancy, external fluid work, damping loss and a mechanical energy residual, with pause/step/slow/fast/seek and evidence JSON. In the existing Babylon scene, the selected mesh follows actual computed height and an explicitly illustrative blue flat-water plane follows user-assumed liquid level.
- The model is 1D and bounded; it does not simulate Navier–Stokes flow, hydrodynamic stability, waves, turbulence, structural failure, measured density, or certify a real invention. Numeric regression cases are registered but broad release CI was explicitly deferred. Native parity is not claimed.

## Android coupled buoyancy and motion source parity (2026-10-31)

- Added a standalone native Kotlin 1D floating/sinking solver using upright box/cylinder/sphere immersed volume per step, assumed fluid density, gravity, bounded linear drag, RK4 state evolution, floor contact, cumulative fluid work, dissipation and mechanical energy residual. Compose has native start/play/pause/seek and numeric force/time readouts with result invalidation. Kotlin reference cases are authored. Full Android device rendering and numerical CI acceptance remain pending the consolidated audit.

## iOS time-dependent fluid/mechanics and SceneKit presentation (2026-10-31)

- Swift now evolves an upright invented solid across the assumed level liquid using 1D RK4, actual primitive displaced volume, gravity, hypothetical linear damping, ground collision, external buoyancy work and numerical mechanical energy balance. SwiftUI controls include solver start, time seek/step/pause/play and force readouts; SceneKit shows a translucent flat assumed-water plane and drives the solid's Y position from recorded solver samples. XCTest cases authored for an assumed light solid and invalid drag. This is bounded reference science with native source integration, not tested device physics; final CI deferred per user request.

## Android revision-safe invention history (2026-10-31)

- Added native 50-step bounded undo/redo for complete validated portable World Lab JSON state. An undo restores a historical design **with a new monotonic revision** and updated timestamp, so persisted owner/project revisions are never rolled backward; redo is cleared by new edits. Compose exposes touch-friendly Undo/Redo and invalidates computed fluid/electrical results after travel. Tests authored for roundtrip and monotonic revisions; comprehensive CI remains deferred.

## iOS native revision-safe undo/redo (2026-10-31)

- Added 50-step Swift source-history storage for v1 portable JSON, requiring strict pre/post-decoding and monotonic revision advancement. Each undo/redo restores a previous component/solid/material arrangement as **a new revision**, preserving auditability; a new edit clears redo, and new/open/save/import clear in-memory history. SwiftUI exposes native Undo/Redo, invalidates science outputs after state travel and restores the native SceneKit geometry. Tests authored; simulator validation remains pending final acceptance.

## Portable multi-solid visual invention assemblies (2026-10-31)

- Added optional `assemblies` to the strict v1 World Lab project schema, bounded to 50 groups with 2–30 unique solid members each, no overlap/dangling IDs, and no breakage for existing projects without the field. Pure, schema-validated group creation, displacement and ungrouping protect original entities; mass/volume summaries leave missing invented densities unknown and do not invent joints. Web has progressive disclosure to combine selected solids, move grouped solids together on X/Y/Z and separate without deleting parts. Deleting a selected solid safely drops membership or an undersized group. Numerical/model tests written and included in future consolidated audit. Native code still needs optional assembly preservation.

## Native portable visual assembly schema parity (2026-10-31)

- Kotlin and Swift strict project v1 decoders now accept optional visual assemblies with 2–30 member solids, no missing/duplicate/overlapping membership, and up to 50 named groups. Their native project creation includes an empty assembly list; imported older projects without the field remain accepted. Regression cases are authored for valid and dangling memberships. Native group-editing controls are separate from schema preservation, and no rigid mechanics are inferred from group labels.

## Android native movable visual assemblies (2026-10-31)

- Kotlin validated editors now create named groups of 2–30 existing solids, move all member centers by a consistent SI vector and remove group records without destroying member geometry. Compose offers group creation, touch movement on X/Y/Z, and ungroup controls; saved snapshot clears transient revision-aware undo history. The strict shared project parser prevents overlapping membership or dangling references. Native regression source covers group transform, immutable non-members and data preservation; broad CI remains deferred.

## iOS native visual assembly UI (2026-10-31)

- The existing native SwiftUI World Lab now exposes named visual grouping of two existing invented solids, movable group offsets in three axes, and non-destructive ungroup operations, all through the validated iOS project editor and monotonic revision history. Overlapping/missing memberships are rejected rather than silently created. These groups do not imply rigid physics or structural joints; native simulator and accessibility audits remain pending.

## Chemical–thermal inventor experiment (2026-10-31)

- Added bounded well-mixed hypothetical first-order Arrhenius chemical reaction with temperature-dependent rate, reaction enthalpy feeding an assumed lumped thermal mass, external heater/cooler, Newton cooling, and integrated heat conservation/residual. Local RK4 solver rejects unsafe numerical settings, nonfinite heat/quantity, and stiff resource budgets. The Web studio now exposes child-friendly progressive reaction parameter fields, pause/step/seek, computed conversion/temperature/reaction power/energy records and JSON evidence. All invented chemical properties are explicitly *hypothetical*: no compound identity, physical reaction confirmation or chemical safety is claimed. Numeric tests authored and registered for later CI; native parity and true spatial chemistry remain undone.

## Android native chemical–thermal coupling (2026-10-31)

- Implemented native Kotlin independent bounded 0D first-order Arrhenius conversion with reaction heat, bulk thermal capacity, Newton cooling and optional external heat input. Each time sample reports reactant/product, temperature, rate, heat flows and conservation residual. Compose offers assumed kinetics/enthalpy/heater controls and time playback, with explicit hypothetical/unknown-chemistry labels. Numerical regression source checks reaction conversion, heating, energy and invalid heat capacity; the full CI/device audit remains pending.

## iOS native chemical–thermal feedback source parity (2026-10-31)

- Added independent native Swift zero-dimensional Arrhenius conversion coupled to bulk temperature, reaction enthalpy, ambient cooling and external heating, with RK4, conservation residual, and strict numerical/stiffness limits. SwiftUI presents explicit hypothetical rate, heat and heater inputs with play/pause/seek/step, and results link to computed conversion, temperature, power and energy. Native XCTest source checks exothermic conservation and invalid heat capacity. Full iOS simulator build still pending user-requested consolidated acceptance audit.

## Owner-scoped chemical job integration (2026-10-31)

- Extended the existing guarded server compute dispatcher, durable job kind constraint, owner-scoped submission input budget and disabled Web remote lifecycle to accept one explicitly bounded hypothetical chemical–thermal experiment. Unknown, missing, executable or cross-model inputs are rejected. Migration 0009 SQL has been updated **before its first deployment**; no live database operation has been performed. Tests written for permissible chemistry and invalid assumptions; feature flag remains off pending security/workers/production checks.

## Web owner-scoped project backup controls (2026-10-31)

- Added a separately gated account backup panel with authenticated owner list, conditional optimistic-revision save, and download-only recovery to JSON. Cloud `serverRevision` stays independent from local project revision, and a stale expected revision receives a conflict rather than losing remote changes. Existing local IndexedDB autosave/import/export is unchanged; no automatic remote restoration or local overwrite. Both build-time VITE_WORLD_LAB_PROJECT_SYNC_ENABLED and runtime WORLD_LAB_PROJECT_SYNC_ENABLED must be explicitly activated only after migration 0010/ownership/security/deployment acceptance.


## Bounded hypothetical digital logic and exhaustive signal checks (2026-10-31)

- Added optional, strictly validated `digitalNetworks` in the portable World Lab v1 JSON interchange. Each invention includes 1–12 Boolean input switches, 1–32 sequentially connected user-assumed truth-table gates with 1–4 ports, and 1–16 outputs; only acyclic dependency order is accepted. The schema rejects injected scripts, unknown fields, incomplete truth tables, overlapping IDs, cycles and dangling output sources. Older projects without digital networks remain valid.
- Web now exposes native DOM Boolean switches, editable individual truth-table rows, two-input chained gate creation, computed output indicators, and full mathematical enumeration for inventions with up to eight inputs (256 combinations). An exhaustive run is a separate downloadable JSON evidence record; it is explicitly *not* device measurement. The basic case supports a user-defined NAND gate as a regression fixture.
- Android uses an independent native Kotlin decoder and deterministic Boolean evaluator; Compose offers switch toggles, truth-table row edits, and a capped all-input-case check. iOS uses its own strict Swift portable decoder, evaluator, revisioned editor, and SwiftUI controls for the same bounded features. Regression cases exercise assumed NAND, changed user behavior, four-case results, and rejected cyclic wiring. No native engine executes imported code; digital circuits are declarative truth tables.
- Limitations: this is combinational Boolean math, not flip-flops, timing, transistors, semiconductor effects, CPU or radio behavior, electrical power, wire delay, synthesis or verified silicon. Full platform CI for the latest development head is required before acceptance. The repository-wide dependency audit currently reports a newly published transitive dev-tool `minimatch` advisory; do not treat that as resolved or lower the security gate. The PR remains draft and the legacy Artboard remains intact.

## 2026-10-31 disjoint concurrent sphere contacts — cross-platform implementation
- Web, native Android, and native iOS event-driven 3D hard-sphere solvers now calculate **simultaneous non-overlapping contact pairs** when the pairs have no shared sphere. Objects advance once to the common event time; disjoint impulse/energy calculations are recorded as separate events with the same timestamp, and playback applies both at that exact time.
- The solver **still rejects** contacts sharing any sphere at an equal event time. This preserves the physical model's validity: a true multi-contact cannot be decided by arbitrary loop order. Existing strict duration, velocity, mass, event-count, conservation, and no-overlap guards remain.
- Web Node tests, Android JUnit tests, and iOS XCTest cases were added for elastic and partially inelastic independent same-time impacts, event-time replay, conserved momentum, energy dissipation, and shared-sphere refusal. Native Android/iOS event JSON also now exports `totalEnergyAfterJ` and `totalMomentumAfterKgMps` per impact, matching Web event fields; native tests assert the final event aggregates match the overall run. These tests require successful CI execution and do not by themselves establish device or cross-platform numerical certification.
- The three UI descriptions and exported model validity statements now distinguish supported independent simultaneous contacts from unresolved shared-sphere ones. This is bounded frictionless free flight; no gravity, fracture, soft contact, spinning, or multi-body contact solver is implied.

## 2026-10-31 additional working integrations (not yet release-verified)
- Cloud backup v2 stores immutable, owner-scoped, bounded 20-version project history. Server-revision reads and conditional cloud deletion are explicit operations and never replace/delete local projects. Migration 0011 is a prerequisite and no production deployment is claimed.
- The existing authenticated science queue now supports bounded, 2–12 sphere 3D collision jobs using Web reference impulse laws, explicit assumed velocities, finite restitution and strict event budget. Job-kind migration 0012, feature flags, worker hosting and full deployment checks remain prerequisites.
- Web IndexedDB v3 keeps a separate capped recovery cache for unfinished project edits. Debounced cached drafts are never silently loaded: the interface offers explicit restore/discard. Successful committed project saves clear temporary draft records. No cloud recovery, native crash recovery, or device sync is implied by this browser cache.

- Android Kotlin and iOS Swift project stores now have independently bounded, app-private atomic recovery drafts (50 projects, 1 MB each), with explicit native restoration/discard actions and debounce after edits. Normal saved project files remain separate and are never implicitly replaced by cached drafts. Native regression tests cover separation and path validation; no device test pass has yet been claimed.

## Portable experiment archive (Web authoring, 2026-10-31)
- A separate `env-world-lab-archive` v1 document carries the strict portable project plus up to 20 immutable, project-bound numerical model records. The archive has a 24 MB import/export ceiling while individual projects retain their 1 MB limit and runs their 8 MB limit. Project IDs, modeled time samples, assumed-mass provenance, and recorded inputs are preserved, not regenerated.
- Web can explicitly export/import this combined archive. Existing local IDs are rejected instead of silently replacing projects, and opening a different archive still prompts before discarding unsaved work. Saving after import commits the project's runs via the existing IndexedDB history. Native Android/iOS do not yet import these composite archives; their canonical project-only interchange remains unchanged. This does not constitute complete export of all heterogeneous experiments (collisions, chemical runs, etc.), which still have separate evidence exports.

- Atomic Web IndexedDB archive save now commits a portable project and its immutable numerical run records in one revision-checked transaction. A conflicting project version, run-ID collision, quota, malformed evidence or transaction failure aborts the entire operation; no partial imported project is accepted as a successful save. This does not imply an atomic multi-device or cross-platform transaction.


## 2026-10-31 local-first capacity routing, first scientific offload
- An independent packed 1–12 switch combinational verifier now computes each
  possible input combination using only the authored acyclic truth tables.
  Small (1–8 switch) exhaustive verification remains strictly local; larger
  (9–12 switch) verification is an explicitly submitted authenticated job via
  the same owner-scoped backend queue, never an automatic upload.
- The compact network-order/MSB-first output bitsets are fully reconstructible
  mathematical evidence with retained hypothetical validity labeling; no
  silicon or experimental measurement is claimed. Database migration 0013
  extends the server job kind constraint.

- The Web digital invention studio now lets inventors add 3–12 switches without
  manually editing JSON, and advertises the chosen local/backend capability
  before a full sweep. A user confirmation explicitly authorizes sending
  portable project inputs to the authenticated job queue, and the existing
  worker polling/export/cancel UI handles the result. Absent backend credentials,
  the larger verification remains honestly unavailable rather than fabricated.

- Added a separate remote 25-case coupled chemical thermal sensitivity sweep,
  with honest status for out-of-domain model variants and explicit assumption
  factors, for larger multi-experiment workloads. It does not simulate chemical
  structures or measure reaction safety. The account worker and migration 0014
  remain undeployed until accepted.

- Private backend worker now performs capped batches of 30-day scientific job
  expiry at startup/every six hours. Sensitive project and evidence payloads
  are not retained indefinitely by design when the worker is operational;
  hosted scheduling, auditing and deletion observability remain release gates.

- An explicit cloud-to-device copy action imports a current or historical
  authenticated account backup as a newly identified, immediately locally
  saved project. No local existing project, unsaved editor or scientific run
  history is overwritten. This is intentional restore-as-copy rather than
  conflict-prone background last-write-wins synchronization.

- The off-device worker can run a 25-case ideal structural beam sensitivity
  grid over invented stiffness and load, returning actual deflection, stress
  and strain only within the accepted small-deformation domain (migration
  0015). No failure strengths are invented.

- Added an isolated, optional deployment blueprint and Docker package for a
  private World Lab science worker, with a database schema preflight requiring
  migration 0015. Root media-service Render configuration is unchanged;
  no paid worker or production flag is activated by this source change.


## End-to-end Newtonian gravity exploration (source only, not verified)
- A bounded symplectic N-body Newtonian simulation now uses the exact portable
  invented sphere geometry and user-assumed material density. It rejects
  touching bodies, impossible speeds and excessive numerical energy drift
  rather than fabricating a new astrophysical law.
- Web World Lab has a native-to-its-stack gravity editor, selectable bodies,
  3-axis initial velocities, timeline scrubbing and adjustable playback speed.
  The Babylon canvas positions follow local sampled trajectories; numerical
  output and full validity evidence can be exported.
- Device-local runs support 2–8 bodies and up to 1200 steps; explicit approved
  cloud jobs support 2–32 and 2400 steps, with real session authorization,
  account history, retention and migration 0016. No automatic transfer.
- Not integrated with collisions, electricity, chemistry, tides, relativistic
  dynamics or verified astronomical data. Production readiness not claimed.


## 2026-10-31 integrated Newtonian science batch
- Web/TypeScript, native Android/Kotlin and native iOS/Swift now each
  implement a real velocity-Verlet Newtonian point-mass gravity solver
  driven by validated invented sphere geometry and density assumptions,
  with 2–8 body local capacities, simulation timeline, non-overlap guard,
  energy/momentum conservation diagnostics and evidence export. Native
  solvers remain independent, not WebViews.
- Web additionally supports 2–32 sphere owner-scoped private-worker
  computations, explicit user cloud consent and bounded 241-frame evidence
  via authenticated queued jobs. Database migration 0016 must be applied;
  the dedicated worker schema preflight refuses old versions.
- Native Kotlin and Swift regression cases have been authored for actual
  attraction, energy drift, material provenance and overlapping bodies.
  This is code committed only: no successful CI, real device acceptance,
  paid worker deployment, measured planetary inputs, or merged production
  release is claimed.


- The material invention form and portable schema now retain explicitly
  hypothetical density, Young's modulus, thermal conductivity and specific heat.
  Old files without the latter properties remain accepted by native Android,
  native iOS and Web decoders; unknown is never substituted with an invented
  default. Editing a material preserves its identity and updated assumptions.
- A real energy-conserving, two-node contact heat-transfer reference now connects
  two face-touching invented box solids, with assumed conductivity controlling
  interface resistance and density/specific heat controlling thermal capacity.
  The Web editor provides editable starting Kelvin temperatures, local playback,
  numeric heat flow, a colored 3D visualization and complete JSON evidence.
  This is exact only for the stated insulated lumped interface; it is not a
  spatial PDE solver, radiation, convection or thermal hazard certification.


## 2026-10-31 material-to-thermal system integration (source committed)
- The portable project now optionally contains invented specific heat and thermal
  conductivity per material; Web, Android and iOS editors can create and revise
  these values. Older projects and incomplete materials preserve unknown
  fields rather than obtaining invented thermal properties.
- A real local, energy-conserving two-box contact exchange is implemented in
  TypeScript, Kotlin and Swift using directly coupled assumed density and
  thermal conductivity/specific heat. All interfaces offer Kelvin input,
  modeled time control, numerical heat flow, computed temperatures and
  evidence export. Web and iOS visualize temperatures in their 3D scenes;
  Android provides a calculated thermal projection.
- Added native source tests for geometry contact, material assumptions,
  quantitative temperatures, conserved energy and metadata. The model is
  not a general conduction PDE, phase-change, safety or medical simulator.
  No CI, device tests or release gates have yet been executed for this batch.


## Cross-model evidence persistence, portable v2 archive
- Web IndexedDB is upgraded to version 4 with owner-scoped immutable numerical
  gravity and two-material heat result records, separate from the original
  oscillator/RC/rod run history. A revision-checked transaction atomically
  commits project, legacy runs, and up to 20 typed additional evidence records.
- The interactive gravity and thermal panels explicitly offer to retain a
  computed result with the open invention. The saved evidence library lists,
  exports and explicitly discards immutable snapshots; old projects retain
  their earlier results when their geometry/material assumptions change.
- Complete Web archives use `env-world-lab-archive` schema v2, carrying strict
  typed gravitation/heat evidence as well as legacy numerical experiments.
  Prior schema-v1 archives remain importable. This is not a universal archive
  of every solver type yet; native Android/iOS have their own portable model
  evidence exports and still lack combined archive import/export.


## Explicit account scientific backup (migration 0017)
- Uploaded scientific records have strict 2 MB item, 20 record and 16 MB
  per-project account quotas, with immutable IDs and matching authenticated
  project ownership. Cloud backup deletion cascades to these records; individual
  evidence can be removed without deleting a project.
- The Web workspace explicitly asks before uploading its recorded gravity or
  material heat results. It can list metadata, retrieve full evidence, delete
  an account copy, download a JSON record and import one into an existing
  saved local invention with matching ID and non-future revision. Nothing
  silently replaces local material hypotheses or measured data.
- The account API and database migration 0017 are source implemented only,
  disabled by default and not yet deployed or verified.

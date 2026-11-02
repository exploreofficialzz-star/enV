# The World Lab — Remaining Implementation Plan

**Status:** Engineering foundation only; **not a production release or a completed universal simulator**.  
**Tracking PR:** [#59 — World Lab: native reference science, local project recovery, portable authoring and Web validation](https://github.com/exploreofficialzz-star/enV/pull/59)  
**Acceptance epic:** [#65 — full production integration matrix (WP-00 to WP-10)](https://github.com/exploreofficialzz-star/enV/issues/65)  
**Snapshot reviewed:** 2 November 2026. The code snapshot reviewed before this note was branch `feat/world-lab-foundation-20261030`, commit `4ecf3a4cab096e6f4b61e866baa23ea23c87f2d2`.

This file is the hand-off checklist for work still required. A source file, prototype surface, numerical unit test or successful Web build does not by itself prove a feature is production-ready or scientifically validated.

## 1. Foundation already present in the PR

The branch contains substantial World Lab work, including:

- A versioned portable project format, strict validation, bounded imports, legacy primitive conversion with warnings, project revision handling, local recovery/storage, and JSON evidence export.
- A Web 3D observer scene with primitive creation and editing, camera movement/zoom, transparency and cutaway inspection, time controls, experiment playback, branch comparison and computed result overlays.
- Separate Kotlin/Compose and Swift/SwiftUI/SceneKit implementations, native project handling and independent bounded native reference solvers. Platform code must remain native and independently tested.
- Bounded scientific/reference implementations across several areas: spring and electrical circuits, 1D heat transfer, gravity and drop motion, electromechanical actuation, fluid statics, structural beam calculations, waves, optics/ray tracing, radiation, Boolean logic and bounded sphere-contact experiments. These are constrained models with explicit assumptions and validity limits—not general-purpose engineering or scientific solvers.
- Recorded experiment outputs, provenance, selected clock/playback controls, branch records and downloadable evidence. Some field overlays, See Inside modes and native clock behavior are present, but their full production acceptance remains open.
- Account-owned job/API and private-worker source, SQL migrations `0009–0018`, and a separate Render worker template.

The remote worker is **source code only at this snapshot**. The World Lab jobs documentation says it is disabled and undeployed. Do not enable the feature flags, apply production migrations, provision a paid worker or describe cloud solving as live until the security, ownership, deployment and end-to-end gates below pass.

## 2. Immediate CI and release blockers

- [ ] Obtain successful Android Kotlin unit tests, lint, debug/release build and emulator launch/accessibility evidence on the final merged code SHA.
- [ ] Obtain successful Android game-preview pixel-render and touch-movement assertions on the final SHA. Do not weaken or remove these assertions to obtain a green workflow.
- [ ] Obtain successful iOS Xcode simulator build, XCTest and native accessibility results for the final iOS source. The latest-head check list reviewed for the Kotlin-fix commit did not include an iOS workflow result; that is **not** an iOS pass.
- [ ] Re-run the dedicated World Lab numerical and rendered-browser acceptance, Web production build, TypeScript, application tests, accessibility, security/dependency audit and full production checks on the final SHA. Do not reuse a predecessor commit's green result.
- [ ] Resolve every new failure from the current logs. Earlier Android CI reported a missing Compose `Alignment` reference and two stale `force.powerLimited` accesses in `NativeWorldLabViewport.kt` and `NativeWorldLabVehicle.kt`. These were corrected in the branch at commits `552265f` and `4ecf3a4`; the rerun was still in progress when this snapshot was recorded.
- [ ] Run a real-device graphics/accessibility matrix, including low-end Android GLES devices and supported renderer fallbacks. A host-GPU emulator pass is not proof that all Android GPUs work.

## 3. Complete the scientific source-book and scenario evidence

The tracked files currently report:

- `docs/world-lab/chapter-coverage.csv`: 205 chapter rows; 4 are `PARTIAL_TOPIC_REFERENCE` and 201 are `NOT_IMPLEMENTED`.
- `docs/world-lab/acceptance-scenarios.csv`: all 105 required scenarios are still `NOT_VERIFIED`.

The chapter map predates some of the later specialist modules in the PR and must be reconciled with the actual code. Do not automatically promote a chapter because a related model or test exists.

- [ ] Re-audit all 205 chapters against the supplied source books and record the exact implemented capability, model/version, test, scientific source and evidence for each claim.
- [ ] Execute all 105 acceptance scenarios across the required Web, Android and iOS surfaces. Populate the actual test, model/version, device, observed result, evidence reference and release decision fields.
- [ ] Separate topic indexing, bounded reference examples, independently validated scientific models and production-ready product capabilities in all documentation and UI labels.
- [ ] Have domain-appropriate scientific reviewers independently examine assumptions, units, boundary conditions, numerical convergence, uncertainty and conservation/error tolerances.

## 4. Remaining world, authoring and science capabilities

### Immersive environment and measured Earth/space data

- [ ] Replace schematic ground/subsurface layers with licensed, provenance-backed terrain, geology and elevation data, with tested coordinate and scale transitions.
- [ ] Add measured atmospheric, weather, ocean, hydrology and astronomy/ephemeris datasets, including their acquisition time, validity window, licensing and update provenance.
- [ ] Complete continuous surface-to-subsurface, atmosphere and orbital/astronomical navigation without forced mode changes, while preserving orientation, selection and camera recovery.
- [ ] Clearly distinguish observed/live data, cached data, illustrative layers and simulated results. Never present an illustrative layer as a measured environment.

### Invention editor and cross-platform parity

- [ ] Complete robust 3D solid/assembly/group authoring: constraints, mates/joints, snapping, measuring, hierarchy, reusable components, ports/connections, transforms, undo/redo and safe project revisions.
- [ ] Bring Android and iOS authoring and visual interaction to tested functional parity with the Web editor while keeping each implementation native.
- [ ] Complete accessible observer movement, camera gestures, keyboard alternatives, responsive layouts, renderer fallback and low-end device performance.
- [ ] Preserve Artboard Studio, UX/UI Studio and existing project routes/formats until compatible import/export, migration, replacement parity and user-data recovery are proven. Do not remove legacy studios as part of this incomplete tranche.

### Generalized and validated scientific systems

- [ ] Extend beyond isolated bounded examples to coupled mechanics, rigid-body contact, joints, friction, inertia, rotation, stacking, rolling, structural/thermal behavior and realistic vehicle-scale validation.
- [ ] Expand fluid work from bounded static/reference cases into validated fluid-motion models where required, with documented assumptions and domain limits.
- [ ] Implement and independently validate the required electronic, electromagnetic, molecular, chemical, biological, wireless, materials and other source-book domains. Existing Boolean logic is not a physical chip simulator; a bounded reaction model is not chemical discovery; assumed material properties are not measured material behavior.
- [ ] Add calibrated datasets and independent reference comparisons for any model that claims real-world predictive use. Internal self-consistency or conservation checks alone are not external validation.
- [ ] Keep unsupported physics explicitly unavailable rather than generating plausible-looking but unsupported results.

### Fields, cutaways and evidence

- [ ] Finish solver-derived spatial field layers and renderers for the relevant electric/magnetic, current, force, stress, thermal and fluid quantities, with physical legends, units, vectors/scalars, validity and uncertainty.
- [ ] Add appropriate slice, streamline, contour, isosurface and volume views where supported; do not draw field lines from topology-only indicators.
- [ ] Complete permission and provenance enforcement for imported/shared datasets and ensure every displayed overlay points to the exact project revision and run that produced it.
- [ ] Complete native and Web deterministic branch re-solving, solver-internal checkpoint/re-execution and reproducibility across changed inputs. Recorded output clocks are not a serialization of arbitrary solver state.
- [ ] Extend long-horizon geological, astronomical and other time-scale conversions with explicit limits and validated precision.

## 5. Cloud, account ownership and multi-device recovery

- [ ] Audit and test migrations `0009–0018`, database constraints, row-level security and owner isolation against real authenticated sessions.
- [ ] Deploy the private worker only after explicit service/cost approval, security review, production database readiness and successful schema preflight. The current worker template is not a deployed service.
- [ ] Prove quota enforcement under concurrent submissions, idempotency, cancellation during execution, lease expiry/retries, worker restart recovery, retention cleanup, result streaming and cost accounting.
- [ ] Add a secure native Android/iOS session bridge before enabling native cloud jobs. Current native local project storage is not account-backed synchronization.
- [ ] Implement secure multi-device project sync, version history, conflict resolution, restore and deletion semantics without silently overwriting local work.

## 6. Production hardening and rollout

- [ ] Complete threat modelling, authorization and privacy review, import/parser fuzzing, abuse/resource limits, dependency/license review, backup/restore drills and audit logging.
- [ ] Measure memory, thermal load, frame time, solver time, battery use and storage on representative real devices and large projects.
- [ ] Complete Web/Android/iOS accessibility audits and verify error, offline, low-memory, unsupported-renderer and interrupted-session recovery paths.
- [ ] Complete documentation for every supported model's purpose, assumptions, units, validity envelope, limitations, provenance and troubleshooting.
- [ ] Produce a release evidence bundle linking exact source SHA, workflow runs, test reports, scenario evidence, scientific review, security review and rollback instructions.
- [ ] Obtain explicit release approval only after WP-00 through WP-10 have evidence-backed acceptance.

## 7. Release rule

**Do not call World Lab production-ready, universal, scientifically validated across the 205 chapters, or a full Artboard replacement while the above gates remain open.** Keep capability labels honest, preserve the existing studios and user projects, and update this note plus the acceptance CSVs as evidence is completed.

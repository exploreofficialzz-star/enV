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

## Implemented and validated by unit tests (not yet device verified)

- Deterministic, bounded local 1D mass–spring–damper using RK4;
  numerical benchmarks against analytic undamped motion and energy.
- Ideal DC RC reference model with analytic time constant, current, heat
  and stored-energy outputs.
- Explicit UTC world-date, solver dt, simulated time and independent
  playback speed; branch lineage, immutable trajectories and evidence label.
- Proposed novel-material schema that does not invent missing properties.

**Limitations**: these are verified teaching/reference model implementations
within narrow documented envelopes, not universal mechanics or a guarantee of
manufacturability. No authenticated project storage, multiphysics solver,
Earth/space datasets, chemistry, real-world engineering safety certificate,
native UI parity, security release gate or device validation exists in this slice.

## Baseline repository status

At main commit \`f9d78deffd02c14e56448ed565279e4970cdcc17\`, CI was
already failing: Developer Studio route smoke hard-coded 13 routes although
the current catalog defines 14, and Android release packaging exhausted
the Gradle Java heap. The dependency audit also reports vulnerabilities.
Record new failures separately from these pre-existing failures.

## Work-package gate map

- WP-00 source inventory + CI baseline: **partial**; 205 chapter coverage
  dispositions and model evidence registry still required.
- WP-01 canonical schema, units, model contracts: **partial**.
- WP-02 observer world/camera: **not released**.
- WP-03 parametric construction: **not released**.
- WP-04 time/recording/branches: **reference engine only**.
- WP-05 validated physics: **two local bounded models only**.
- WP-06 FMI/remote solver: **not started**.
- WP-07 geospatial/atmosphere/space: **not started**.
- WP-08 materials/chemistry/biology/digital: **not started**.
- WP-09 Web/Android/iOS/auth/offline parity: **not released**.
- WP-10 production hardening/rollout: **blocked by test evidence**.

## Migration and compatibility rule

Do not yet delete or rename Artboard Studio in the visible catalog. It has
game-scene project format \`env-3d-game\` (v1), not the science project
format and native parity that The World Lab requires. Preserve the UX/UI
Studio and its Artboard handoff until explicit compatible adapters, project
import tests, and Web/Android/iOS quality gates pass. A deliberate feature
gate and truthful capability labels are required for further rollout.

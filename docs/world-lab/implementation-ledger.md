# The World Lab — implementation and scientific evidence ledger

**As of 2026-10-30. Status: feature branch under review; NOT a production-ready universal simulator.**

## Product boundaries and safe replacement

- Canonical new route: `/tools/developer/the-world-lab`. The Developer catalog displays **The World Lab**.
- Legacy route `/tools/developer/artboard-studio` deliberately continues serving the original editor **until migration is fully verified**. Do not remove, overwrite or automatically convert existing project records.
- Old editor: `src/components/game-studio/`, format `env-3d-game`, IndexedDB `env-3d-studio-v1`.
- New editor: `src/components/world-lab/`, format `env-world-lab` v1, IndexedDB `env-world-lab-v1`.
- JSON import accepts strictly validated World Lab projects. The guarded legacy converter accepts only supported primitive geometry and requires explicit user confirmation; complex/rotated/hidden/imported assets are rejected with a recovery explanation.
- UX/UI Studio is a different product. Its design workspace and existing Artboard handoff remain untouched.
- Native Android and iOS still expose the old Artboard preview from the prior system. **They do not yet have native World Lab authoring or science simulation parity.** Do not claim otherwise or remove those previews.

## Scientific source-manifest provenance

Companion archive: `The_Interconnected_World_205_Chapter_Book_and_Specialist_Expansion_2026.zip`  
SHA-256: `553778563cf4afa4f716687024306ed2ba98b0223fee2213a9fa4c42a8f33e33`.

| Archive entry | Bytes | SHA-256 |
| --- | ---: | --- |
| The_Interconnected_World_205_Chapters_Master_Book_2026.pdf | 3299932 | 14b0a7bdaf18609d08d8469ca4d3cf0b11fcee11e238831e6ba6d5e57f87af5f |
| The_Interconnected_World_Specialist_Depth_12_Chapters_2026.pdf | 422879 | b3f725295c3173264e39a15eaa704dcb7333cf93900b5ba0fe3772b3b63601e2 |
| The_Interconnected_World_205_Chapters_Research_Expanded_2026.md | 1353441 | dafa99bfa11313f653811867502e1ea030b44071d1328e81a887bf24a704f5a4 |
| The_Interconnected_World_Specialist_Depth_12_Chapters_2026.md | 80379 | 015e30f5bc950d53e9279a81dccd62649e135a785e839976219a577ae52dcdf3 |
| calculations_verified.csv | 744 | 922dd4d95e07b7925a1c8de7940bdf8dff98f83e4ec142d335fe5a16cbc53997 |
| illustrations/thermal_gradient.png | 63847 | badf764a1d79598e16d920d0ce759e491b43e11e49d9242c1050fc8abae50ba5 |
| illustrations/inverse_ambiguity.png | 79764 | 5cdfd4538f6df2fde7e3dd606bff3b36933fe27cd40dafb5e96c201a8803bc9c |
| illustrations/pk_decay.png | 57158 | da8099ff53ba738869b30169b0fe546b3f22efe9963fb8bbaba31cca09583973 |
| illustrations/carbon_pool.png | 71678 | f32d28f773281ddf51ea8dd16889cbbed3ce3a206ac73f162d415bada54de912 |

The master Markdown contains chapter headers **1–205, 205 unique and contiguous**. The specialist Markdown contains **12** chapters corresponding to **194–205**; the supplement is not another 12 distinct master chapters. These counts were verified directly from the attached archive, not inferred from page counts.

The user's separate master production mandate `The_World_Lab_Production_Build_Master_Prompt_2026.pdf` has SHA-256 `78327f24e170c859f58c754c40c2999c9301605a624f3245f1affbe9e0a3c48f`. The companion PDF and ZIP remain user-owned inputs, **not vendored into this repository**. No ingestion into a runtime scientific knowledge system has yet been implemented.

## Working module inventory (feature branch)

| Module | Function | Evidence classification |
| --- | --- | --- |
| `src/lib/world-lab/model.ts` | Validated SI-based experiment schema; density/geometry mass; bounded deterministic translational integrator with fixed substeps, gravity, approximate drag, user-applied force, flat-ground impact, friction and restitution | **Computed** with explicit limitations |
| `src/components/world-lab/viewer.ts` | Babylon observer-eye view, visual shapes, continuous camera navigation, sample strata, transparency and user-force overlay | **Illustrative** geology and rendering |
| `src/components/world-lab/world-lab.tsx` | Responsive Explore/Build/Test, material edit, diagnostics, speed/pause/step/reset/snapshot control, save/import/export | GUI for computed + assumed inputs |
| `src/lib/world-lab/storage.ts` | Separate validated IndexedDB persistence | Data persistence |
| `src/lib/world-lab/legacy.ts` | Explicit read-only compatibility converter; fail-closed unsupported cases | Migration safety |
| `src/lib/world-lab/*.test.ts` | Mathematical, schema, temporal and migration invariants | Automated tests (CI results required) |

### Caveats that must be visible to users

The initial test site is an **illustrative, flat, Earth-like sandbox**. It is not satellite terrain, measured underground geology, a georeferenced location, nor a whole-world digital twin. Material properties are user assumptions by default, not discoveries. The solver uses translational Newtonian mechanics **without** rotational inertia, torque, joints, fluid dynamics, realistic aerodynamic lift, thermal stress, digital circuitry, chemical kinetics, biological processes, gravity gradients, electromagnetic propagation, planetary weather or laboratory-certified model validation. Its time speed changes the amount of simulated elapsed time per wall-clock second; replay snapshots are not backward physical dynamics.

## Gates and next work, ordered by dependency

1. **Gate A (this PR):** typecheck, lint, build, World Lab unit tests, Developer Studio route and catalog checks, legacy project preservation, browser viewport test and mobile touch smoke. Do not merge merely because source files exist. Record CI conclusions and actual devices tested.
2. **Gate B:** material registry with provenance and units, scene hierarchy, transformations, inverse camera navigation, per-object sections/cutaways, model versioned experiments, reproducibility exports, safer autosave and undo/redo.
3. **Gate C:** replace the bounded integrator where necessary with verified multibody/contact and coupling adapters; test reference cases and conservation tolerances. Record measured model validity envelopes.
4. **Gate D:** geospatial/atmospheric/astronomical datasets with source license, coordinates, timestamp, measured-vs-modeled labels, offline fallbacks and appropriate uncertainty.
5. **Gate E:** credible multiphysics solvers for electrical, fluid, thermal, structural, chemical, biological and digital systems; field overlays must be computed from solver output, not decoration.
6. **Gate F:** native Kotlin and Swift implementations with identical project schemas and their **own** native UI behavior, extensive integration/device tests and safe legacy migration. Android/iOS remain incomplete until this gate.
7. **Gate G:** secure authenticated cloud projects and jobs, quotas, sandbox isolation, telemetry, capacity controls, deployment, backup/restore, security/performance/accessibility audits, production rollback and release sign-off.

**Exit condition:** only describe a feature as shipped after its tests, data provenance, platform deployment and actual behavior are evidenced. The 205-chapter scientific coverage map in the master mandate remains a research backlog, not 205 implemented solvers.

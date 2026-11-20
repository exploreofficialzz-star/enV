# Scene Studio implementation notes

> **Contract status: proposed, not locked.** `apps/shared/scene-studio-v1.schema.json` is a candidate JSON Schema awaiting owner approval. Do not treat version `1.0` as final until the owner accepts the field names, defaults, limits, coordinate conventions, and examples.

## First implementation slice

This branch adds a declarative JSON contract, three shared golden scenes, TypeScript validation with friendly JSON paths and repair hints, and a Babylon.js web preview. Input is data only; pasted content is parsed as JSON and is never evaluated as JavaScript. Unknown fields are ignored with warnings, and unknown object builder types are displayed as a simple placeholder rather than crashing.

The initial renderer supports `box`/`cube`, `sphere`, `cylinder`, `plane`, and `text`. The broader builder registry, asset library, uploads, ZIP project save/reopen, video export, local voice, captions, and native renderers remain follow-up milestones and are not implied by this preview prototype.

## Proposed conventions (owner review required)

- Coordinates are right-handed, Y-up, with positive X to the right and positive Z toward the default camera; one world unit represents one metre.
- `position`, `rotation`, and `scale` are three-number arrays. Rotation is Euler X-then-Y-then-Z in degrees.
- Scene time is deterministic: `frameIndex / fps`; `seed` is supplied for any future procedural builder.
- Pasted scene text is capped at 1 MB; the proposed schema limits a scene to 100 objects, 60 seconds, 60 fps, and 1920 pixels per dimension. These are conservative starting points, not final product limits.
- Assets must be local project entries or built-in library IDs. The preview rejects remote URLs and parent-folder traversal in asset references. No scene JSON can trigger a network fetch.
- Optional values are filled from the JSON Schema defaults by the web reader. Unknown properties remain forward-compatible and produce a warning.

## Shared fixtures and checks

- `tests/fixtures/scene-studio/basic.json` — static geometry and defaulted companion sections.
- `tests/fixtures/scene-studio/animated.json` — fixed keyframes and deterministic interpolation.
- `tests/fixtures/scene-studio/dialogue-captions.json` — dialogue, speaker voice ID, and caption preferences.
- Run `npm run test:scene-studio` for contract, error-path, safety, warning, and deterministic-time checks.
- Run `npm run typecheck` and `npm run build` for the web integration.

Android and iOS remain native applications; neither will embed the web editor. The catalog record stays `planned` until both a Kotlin and a Swift scene reader/renderer satisfy the shared-contract and acceptance checks. iOS renderer selection (SceneKit/RealityKit/Filament) and Android renderer selection (Filament or another native option) are still open decisions.

## Planned order

1. Owner review of the proposed schema and representative scenes.
2. Complete web validation/preview and supported-builder registry.
3. Add license-manifested assets and secure ZIP import/export.
4. Add deterministic frame-by-frame export, then local voice and matching preview/export captions.
5. Add native Kotlin and Swift readers/renderers, project handling, and export; run golden-scene parity tests on each platform.

The target-style sample video, content priority, mobile export scope, and native renderer choices should be confirmed before expanding beyond the small primitive set. Keyframes-first is the current recommendation; motion presets can later compile into ordinary keyframes.

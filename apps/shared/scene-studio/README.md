# Scene Studio scene format (v1.0, schema rev 2 — DRAFT)

One JSON document describes a scene. Web (TypeScript + Babylon.js), Android (Kotlin) and iOS (Swift) each read it with their own reader. **Status: draft until the owner approves `scene-v1.schema.json`.**

| File | Purpose |
| --- | --- |
| `scene-v1.schema.json` | JSON Schema, the single source of truth for fields, defaults and limits |
| `scenes/valid/*.json` | Scenes every platform must load without errors |
| `invalid-cases.json` | Inputs every platform must reject, with the error code and JSON path |
| `animation-vectors.json` | Expected animation samples and seeded-random values every platform must reproduce |
| `frame-vectors.json` | Expected camera, object and layer values at chosen frames of the valid scenes, plus Euler → quaternion cases (tolerance 1e-6) |
| `render-vectors.json` | Expected particles, water waves, character poses, sky colours, post-processing plans and camera projections (tolerance 1e-9) |
| `asset-manifest.json` | The bundled asset library (every entry is "planned" until a licence-checked file is added) |

The web reference implementation is `src/lib/scene-studio/` (`validate.ts`, `animation.ts`, `frame-state.ts`, `render-look.ts`, `camera-math.ts`, `particles.ts`, `water.ts`, `character-poses.ts`). Run its tests with `node --experimental-strip-types --test src/lib/scene-studio/*.test.ts` (also part of `npm test`). The vector files are written by those tests: to change a rule, change it on the web, regenerate with `UPDATE_SCENE_STUDIO_VECTORS=1 node --experimental-strip-types --test src/lib/scene-studio/*.test.ts`, then make Kotlin and Swift pass the new numbers. Native readers: see [Native readers](#native-readers).

## Conventions

- Coordinates are right-handed, **+Y up**, units are **metres**; the default camera looks toward −Z.
- 3D follows glTF 2.0 and three.js: right-handed, +Y up, metres, the camera looks down −Z, a model's front faces +Z.
- `rotation` is `[x, y, z]` Euler angles in **degrees** with a `rotationOrder` (default `XYZ`, the Blender and three.js default): `XYZ` means the quaternion is `qx ⊗ qy ⊗ qz` (a vector turns about Z first, then Y, then X). Positive angles are right-hand-rule turns. `quaternion` `[x, y, z, w]` is the glTF-native alternative; when present it wins and `rotation` is ignored (the reader sets it to `[0, 0, 0]`). A quaternion is normalised on reading; a zero quaternion is ignored.
- 2D layers follow canvas/SVG/Lottie: pixels, origin top-left, +y down, rotation in clockwise degrees; `scale`, `position`, `size` and `anchor` are `[x, y]`.
- Time is **frame ÷ fps**, never the wall clock. Frames in an export = `round(fps × duration)`. Randomness uses the scene `seed` (mulberry32).
- Every optional field has a default. Unknown fields are ignored with a warning. Bad input never crashes: each problem is reported as `{ severity, code, path, message, fix }` with a `$.json[0].path`, plain-words message and a fix hint that can be pasted back to a chatbot.
- Assets are library names (`library/tree_oak`) or uploaded file names. URLs, `..`, leading `/` and backslashes are rejected; nothing is fetched from the internet.
- Animation: a track targets an object id, a layer id, a shot id, or `"camera"` (the base camera). Easings are quadratic (`easeIn` t², `easeOut` 1−(1−t)², `easeInOut`), `step` holds the earlier value; a keyframe's own `easing` shapes the segment that starts at it, else the track's. Before the first keyframe the first value holds, after the last the last value holds; `loop` wraps time around the last keyframe's time. Colours blend per sRGB channel (halves round up); Euler `rotation` blends component-wise (no shortest-path wrap); `quaternion` blends by slerp (shortest path); `clip` names and `visible` booleans hold the earlier value. Objects, layers and shots share one id space, and `camera` is reserved.

## What is on screen at a frame (`frame-vectors.json`)

- Time is `frame ÷ fps`. Rotation priority: animated `quaternion` > animated Euler `rotation` > the object's own `quaternion` > its own Euler `rotation`.
- The active shot (the latest whose `start` ≤ time) replaces the base camera completely, including its shake. Tracks aimed at `"camera"` change the base camera only; tracks aimed at a shot id change that shot.
- Camera shake (seeded 1D value noise, `seed` from `settings`): position moves by 5 cm × noise in x and y, roll by 0.5° × a third noise value. Noise uses 32-bit wrapping integer maths so every platform gets the same bits.
- An orthographic camera shows `2 × distance × tan(fov ÷ 2)` metres of height at the look-at distance.
- Clip playback time is `(time − time of the latest clip keyframe) × clipSpeed`; renderers loop it by the clip's own length.
- A layer is drawn from `start` (inclusive) to `end` (exclusive, default: the end of the scene) while `visible`.

## Camera maths, look and procedural parts (`render-vectors.json`)

- Camera basis: `forward` toward `lookAt`, `right = forward × up`, `up` rolled toward `right` by `roll` degrees. Looking straight down the top of the picture points to −Z; straight up, +Z; a camera exactly on its target looks down −Z. `projectToScreen` returns pixels (origin top-left) and depth, or nothing for points behind a perspective camera.
- Captions placed `belowSpeaker` sit under the object whose id equals the speaker's name (then the same id ignoring capitals); otherwise they sit at `anchorY` of the picture, centred.
- Environment presets (`studio`, `day`, `sunset`, `night`, `overcast`, `none`) give the sky colours, ambient strength and a default sun when `lights` is absent; an explicit empty `lights` list means no lights. Point-light range is `10 + 4 × intensity` metres (at most 90). Only the first sun casts shadows.
- Post-processing is mapped to the same renderer controls everywhere (`planPost`). Quality `low`/`medium`/`high` sets shadow-map size, anti-aliasing, particle count scale (0.4/0.7/1) and water grid.
- Particles (`rain`, `snow`, `smoke`, `fire`, `sparks`, `dust`, `splash`), water waves and the built-in character's poses (`Idle`, `Walk`, `Run`, `Wave`, `Talk`, `Swim`, `Fall`, `Sit`) are pure functions of (index, time, seed), so any frame can be drawn in any order. Unknown clip names play `Idle`.

## Captions, voice and sound

- Dialogue lines are split into words and grouped (`wordsPerGroup`, 1–6). Word timing is estimated from the text and the voice's `speed` until a speech engine reports real durations. Style `pop` highlights the word being spoken (in the speaker's `speakerColors` colour, else `highlightColor`); `classic` shows the whole group in the speaker's colour or white. Captions can be exported as SRT.
- Speech is produced by a pluggable engine. None is bundled, so a scene exports with silent timing (captions still work) unless a local engine is supplied. Uploaded audio is mixed to mono at 44.1 kHz.
- Everything runs on the person's device: no cloud calls, no API keys.

## Projects and zip input

A project is a zip with `scene.json`, the person's asset files and a `project.json` manifest holding each file's SHA-256. The reader treats every zip as hostile: at most 120 MiB archive, 400 entries, 50 MiB per file, 250 MiB expanded, a 1 MiB scene; path tricks such as `..` are refused, as are overlapping or lying entries, duplicate names (including names that differ only by capital letters) and password-protected zips. Zip64 and multi-disk archives are not supported.

## Native readers

Both native readers are plain code with no dependencies (their own small JSON parser), so they behave the same on every device and in unit tests. Scenes are **checked and explained on the web tool**; a native reader assumes a checked scene. It still never crashes on a bad file: a wrong-typed or out-of-range value becomes its default (what the web validator also substitutes), an unusable item is skipped, and only a file that cannot be read at all (not JSON, a different major version, a size limit broken) is refused with one error type.

| | Android (Kotlin) | iOS (Swift) |
| --- | --- | --- |
| Source | `apps/android/app/src/main/java/com/chastech/env/scenestudio/` | `apps/ios/enV/NativeSceneStudio*.swift` |
| Tests | `apps/android/app/src/test/java/com/chastech/env/scenestudio/` | `apps/ios/enVTests/NativeSceneStudioTests.swift` |
| Status | Compiled and run on the JVM against every vector file (27 tests pass) | **Written but never compiled** (no Swift compiler was available); not yet in the Xcode project: see `apps/ios/NATIVE_SCENE_STUDIO.md` |

They cover reading, defaults, frame state, animation, particles, water, poses, camera maths and the look presets. They do **not** draw anything yet: the native 3D renderers (Filament on Android, RealityKit on iOS) and the native video export are not built, and the native tool is not in the native catalogs. The vector files above are what a future renderer's numbers must match.

## Assumptions to confirm (not yet approved)

1. The rotation and coordinate conventions above (rev 2: glTF/three.js, quaternion or Euler with `rotationOrder`), metres/+Y-up, and the 2D pixel conventions.
2. Limits: 200 objects, 120 s, 60 fps, 7 200 frames, 500 keyframes per track, 1 MB JSON.
3. Caption styles `pop` and `classic`; export formats `mp4` and `webm`.
4. No motion presets in v1 (keyframes only), pending the owner's decision.
5. What "1D" means: this format treats it as audio and dialogue on the time axis (`audio`, `dialogue`, `voices`, `captions`). Confirm or redirect.
6. Which licence-checked 3D asset packs to bundle (every library entry is "planned"), who verifies licences, and which speech engine to ship (none is bundled; the exporter takes a pluggable engine and falls back to silent timing).

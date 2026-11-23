# Scene Studio

Scene Studio creates short animated scenes on the user's device. It accepts structured scene JSON, previews supported 2D and 3D content, and can save a project bundle or export an MP4 where the browser provides the required media APIs.

## Start a scene

1. Open **Scene Studio** in enV's Video category.
2. Copy the built-in instruction prompt and ask the AI chatbot you use to return one JSON scene.
3. Paste the response into Scene Studio and run validation. Use the JSON path and plain-language fix hint to correct problems.
4. Add supported local files referenced by the scene, then build the preview.
5. Play the scene and scrub through its frames to inspect timing, camera movement, captions and audio.
6. Save the project bundle so the scene and supported assets stay together. Export an MP4 when the browser supports WebCodecs, then play the file outside the editor to check it.

## Current limits

- The shared scene format is DRAFT revision 2 and needs product approval before it is treated as a locked public format.
- The asset manifest currently contains zero bundled third-party 3D packs; five candidate packs are marked planned, not shipped.
- No speech model is bundled. Captions and speech timing can be reviewed, but the default voice path is silent.
- Video export currently targets MP4 and depends on browser WebCodecs support, GPU capacity and browser memory. Unit tests do not prove compatibility on every device.
- Android Kotlin and iOS Swift sources are reader, animation and render-math conformance layers—not complete native editors. Native editing UI, native 3D rendering and native video export remain separate engineering work. The full editor is available on Web.

A clean validation result does not guarantee that a particular device can render or encode the scene. Preview it and inspect the exported file on the device that will use it.

# enV Audio Category UX Research

## Findings applied to the redesign

### Ableton Live
Ableton separates the creative workspace into **Arrangement** (a linear timeline) and **Session** (a real-time clip launching surface), while both views share the same tracks and mixer. That suggests an audio category should make the user's next creative surface explicit instead of presenting a flat list of utilities. The redesign uses a workspace switcher and labels the main Music Studio around stems, mix, practice, vocal recording, and karaoke. [1]

### Logic Pro
Logic Pro documents a main window with distinct Tracks, Library, Inspector, Mixer, Smart Controls, and Live Loops surfaces. Live Loops uses a grid of cells for non-linear ideas, while the Tracks area supports linear arrangement. The redesign borrows the separation of source/import, work surface, and delivery, with a compact quick-start set on small screens and a denser workspace navigation on larger screens. [2]

### FL Studio
FL Studio's Channel Rack groups instruments and patterns, while the Playlist sequences audio, pattern, and automation clips. The Mixer is a separate routing and level surface. This reinforces a hierarchy of **source → creative operation → output**, and the redesign uses track-like action rows, badges for local/server behavior, and a separate delivery surface rather than mixing every tool into one undifferentiated grid. [3] [4]

### Supplied reference images
The supplied images point to a dark, high-contrast mobile studio language with colorful track lanes, waveform-first content, a persistent transport/record affordance, concise labels, and a clear return/close path. They are used as visual references, not embedded as product content.

## Product decisions

- Keep local-first privacy visible at the top of the Music Studio.
- Keep the existing Audio Studio's real behaviors: file decoding, waveform preview, browser handoff, separation, mixer, practice, recording, karaoke, and exports.
- Use audio-native nouns and verbs: **source**, **stems**, **mix**, **take**, **transport**, **monitor**, **master**, **delivery**.
- Make desktop feel like a control room through a dark console shell and compact workspace rail.
- Make mobile feel like a track view: short tabs, stacked cards, large record/import affordance, and controls that remain at least touch-sized.
- Distinguish **LOCAL**, **SERVER**, and **STT SERVICE** actions before the user opens a tool.

## References

[1]: https://www.ableton.com/en/manual/live-concepts/ "Ableton Live Concepts — Arrangement, Session, tracks and clips"
[2]: https://support.apple.com/guide/logicpro/welcome/mac "Logic Pro User Guide for Mac — interface, Tracks, Mixer and Live Loops"
[3]: https://www.image-line.com/fl-studio-learning/fl-studio-online-manual/html/channelrack.htm "FL Studio Channel Rack & Step Sequencer"
[4]: https://www.image-line.com/fl-studio-learning/fl-studio-online-manual/html/playlist.htm "FL Studio Playlist"

# enV Audio Category UX/UI Redesign Plan

## Scope

Redesign the web Audio category and the flagship Music Studio surface using the supplied music-studio reference images and documented patterns from Ableton Live, Logic Pro, and FL Studio. Preserve existing audio engines and routes. This pass focuses on information architecture, visual hierarchy, audio-native language, and responsive behavior for desktop and mobile.

## Implementation approach

1. Redesign `/tools/audio` as an audio control room entry point with a dark studio header, workflow rail, primary workspace cards, and a clearly separated long-tail catalog.
2. Re-skin and restructure the Music Studio dashboard above its existing execution workspace. Keep the current file handoff, waveform, analysis, separation, practice, mixer, duet, karaoke, status, progress, and export logic intact.
3. Use audio-native labels and badges to reveal the actual processing model before navigation: local browser processing, configured server processing, or speech-to-text service.
4. Keep existing slugs and deep links unchanged. Only the presentation layer and visible workspace vocabulary change.
5. Use responsive CSS utilities already present in the project. Desktop receives denser console-like grouping; mobile receives stacked track cards, horizontal overflow-safe navigation, and full-width primary actions.

## Project structure

- `src/routes/tools/$category/index.tsx`: Audio category landing page and legacy tool catalog.
- `src/components/engines/audio-music-studio.tsx`: Music Studio dashboard and existing audio workflows.
- `src/components/engines/audio-engine.tsx`: Existing individual audio-tool engines; unchanged in this pass.
- `src/components/tools/tool-shell.tsx`: Shared tool framing; unchanged to avoid cross-category regressions.
- `docs/audio-category-research.md`: Research evidence and design translation.

## Design

### Candidate styles

- **Dark control-room console** (0.04): Near-black surfaces, waveform cyan, signal green, and track colors; compact controls inspired by professional DAWs.
- **Warm analog notebook** (0.03): Paper-like panels, amber meters, and tactile knobs; friendly but less aligned with the supplied references.
- **Neutral utility lab** (0.02): Light surfaces, restrained blue accents, and data-first cards; clear but not musically distinctive.

### Chosen direction: Dark control-room console

- **Design Movement:** Modern digital audio workstation / control-room UI.
- **Core Principles:** Make the signal path legible; show the next musical action first; keep transport and source state visible; preserve touch-sized controls.
- **Color Philosophy:** A charcoal control room reduces visual noise. Cyan carries waveform and signal meaning, emerald marks local readiness, violet and orange differentiate creative lanes, and red is reserved for recording or destructive warnings.
- **Layout Paradigm:** A studio rail and track-oriented workspace rather than a generic centered card grid. The source is the session header; workspaces are the tracks; tools are actions on those tracks.
- **Signature Elements:** Dark waveform header; colored track/workspace lane markers; small uppercase signal badges such as `LOCAL`, `SERVER`, and `STT SERVICE`.
- **Interaction Philosophy:** Selecting a workspace changes the active console lane without losing the loaded source. Import once, then carry the source into compatible tools.
- **Animation:** Use short 150–200ms transitions for hover/selection, no decorative motion during processing, and clear progress bars for model work.
- **Typography System:** Preserve the existing sans-serif system font. Use compact uppercase eyebrow labels for studio metadata and ordinary-weight sentence case for actions and explanations.
- **Brand Essence:** A private browser audio room for creators who need practical production tools without a sprawling DAW setup. Personality: focused, capable, transparent.
- **Brand Voice:** Direct, audio-native, and honest about processing boundaries. Example lines: “Load a source, choose a lane, make the next move.” “Local by default; server routes are labeled before upload.”
- **Wordmark & Logo:** Keep the existing enV identity; use a compact waveform mark beside “Music Studio” rather than inventing a new product logo.
- **Signature Brand Color:** Electric cyan `#67e8f9` for waveform and active transport cues.

## Acceptance outcomes

- Audio category landing page reads as a music/audio studio instead of a generic tool index.
- Music Studio keeps all existing functional workflows while making source, workspace, and output states easier to scan.
- Visible labels use audio-native concepts such as stems, mix, take, monitor, and delivery.
- Local/server/STT boundaries are visible before tool navigation.
- Desktop and mobile layouts remain usable with touch-sized targets and stacked responsive behavior.

# Smartphone Prototype Lab — enV integration

## Entry point
- Tool name: **Smartphone Prototype Lab**
- Web category: **Design**
- Route: `/tools/design/smartphone-prototype-lab`
- Static Babylon scene: `/labs/smartphone-prototype-lab/index.html`
- Scene bundle: compressed first-party JavaScript split into cacheable static chunks.

## Experience
The tool opens the generic smartphone production scene inside the existing enV ToolShell. Users can orbit and zoom the phone, explode or reassemble the major systems, inspect the display, motherboard, camera, power/cooling and material views, select individual components, switch the display architecture between OLED and LCD, and play the manufacturing sequence.

## Engineering boundary
This is a generic educational reference model, not manufacturer CAD, a procurement bill of materials, a semiconductor floorplan, or an approved manufacturing process specification. Component position, count, package integration, display stack, battery chemistry, antenna layout and factory sequencing vary across products. The scene distinguishes common phone technologies from illustrative or optional detail.

## Runtime notes
- The scene is isolated in an iframe so Babylon and generated geometry stay out of the main application bundle.
- The compressed scene is decompressed with the browser `DecompressionStream` API.
- Babylon.js is loaded from the official Babylon CDN; a network connection is required for the first scene load.
- This change registers the web tool only. Android and iOS need separate Kotlin and Swift implementations before native catalogues advertise native support.

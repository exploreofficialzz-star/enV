# Platform Mockup Reference Research

## Scope

enV mockups are original renderings intended to reproduce recognizable interaction/layout characteristics. They are not copies of proprietary screenshots and must not be presented as authentic captures.

## Current reference assumptions

- **Apple/iOS:** Current Apple Human Interface Guidelines emphasize standard navigation controls, clear toolbar grouping, tab bars for top-level navigation, readable status-bar treatment, Dynamic Type, Dark Mode and current Liquid Glass system surfaces. These assumptions inform iMessage/iOS-style chrome and device framing.
- **Discord:** Discord's current mobile guidance describes a mobile-optimized navigation model and its 2026 product work continues to simplify mobile navigation. Discord-specific mockups therefore use mobile-first navigation rather than simply shrinking desktop Discord.
- **WhatsApp:** Current 2026 Android beta reporting shows continuing changes to chat bubble shapes and navigation. Because those changes are still rolling out/testing, enV stores the visual assumption as a versioned approximation rather than claiming one universal current WhatsApp layout.

## Fidelity rule

Every supported platform must have a distinct adapter for:

- header/chrome
- navigation model
- message bubble geometry
- composer layout
- typography hierarchy
- metadata/read state
- media treatment
- supported scene types

When a platform changes, update the adapter and its reference assumptions rather than silently applying a generic renderer.

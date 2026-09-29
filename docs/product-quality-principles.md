# enV Product Quality Principles

These principles guide enV implementation and future agent work. They are informed by patterns documented by successful tool/platform companies, but are original enV engineering principles rather than copied UI or branding.

## 1. Make the task obvious
- A user should understand what to paste/upload and what they will get.
- Prefer one primary action per tool.
- Keep advanced controls secondary until needed.
- Show provider detection and validation early for URL tools.

## 2. Fast path, safe path
- Keep the common operation one or two actions away.
- Use browser/client-side processing when it is genuinely practical.
- Delegate heavy work to the appropriate backend/native runtime when necessary.
- Avoid unnecessary network requests.

## 3. Reliability over tool-count inflation
- A tool is Active only when its underlying operation works.
- Unsupported dependencies stay Coming Soon.
- Every new active tool needs meaningful validation and regression coverage.

## 4. Explain state clearly
- Idle, validating, processing, completed, cancelled, and failed states should be distinguishable.
- Errors should tell users what to do next.
- Long operations should expose progress where reliable.
- Cancellation should be available for operations that can take significant time.

## 5. Privacy by architecture
- Prefer local processing for suitable operations.
- Minimize uploads and unnecessary telemetry.
- Server-side processing must use bounded inputs, isolated temporary storage, safe filenames, and explicit operation allowlists.

## 6. One platform, reusable infrastructure
- Shared engines, adapters, registries, and runtime abstractions should serve web and mobile.
- Avoid product features that can only work on one client when a reusable abstraction is practical.

## 7. Performance is a product feature
- Avoid rendering thousands of tools simultaneously.
- Lazy-load heavy visual assets.
- Avoid blocking the main thread unnecessarily.
- Keep media downloads and processing observable and cancellable.

## 8. Small bets, strong regression protection
- Make focused changes.
- Test the changed capability and nearby functionality.
- Keep catalog generation/audit green.
- Never silently remove working functionality.

## 9. Accessibility is part of functionality
- Inputs need labels.
- Buttons need clear names.
- Focus states must remain usable.
- Mobile layouts must remain practical.

## 10. Platform ambition, simple experience
The long-term goal is a large global utility platform, but individual tools should feel simple. Complexity belongs in the infrastructure, not in the user's path to completing a task.

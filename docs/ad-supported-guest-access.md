# Ad-supported guest tools

## Release behavior

enV supports a Web-only ad-funded path for a deliberately selected set of lightweight tools. A visitor can open an approved tool online and use it without creating an enV account. The ad is a funding mechanism, not an access check: blocking, failing or unfilled ads must never prevent the tool from opening or completing.

Only one responsive ad placement is currently used, below the tool interface. There are no ads inside the working surface, in full-screen mode, in native Android/iOS clients, or when the device is offline.

## Tool eligibility

A tool appears in the ad allowlist only when all of these conditions hold:

- Its ID is explicitly included in `VITE_AD_SUPPORTED_TOOL_IDS`.
- Its catalogue status is `active`; it runs on the client; it does not require account authentication or an enV backend.
- The shared offline capability policy classifies its operation as `device-local`.
- It is not a fitness/personal tool, a finance-prefixed tool, or a tool carrying a health, finance or earnings disclaimer.

The allowlist is a build-time deployment setting. Do not add AI, cloud, media-processor, upload, remote-URL or other cost-bearing operations simply to increase ad inventory. A selected ID is still subject to all checks above.

## Google AdSense configuration

The implementation is intentionally dormant by default. Before enabling it:

1. Obtain AdSense approval for `envtools.store` and create a responsive display ad unit for tool pages.
2. Set `VITE_ADS_ENABLED=true`, `VITE_ADSENSE_CLIENT_ID=ca-pub-...`, `VITE_ADSENSE_TOOL_SLOT_ID=...`, and a comma-separated `VITE_AD_SUPPORTED_TOOL_IDS` list in the Web production build environment.
3. Configure Google AdSense Privacy & Messaging or another suitable certified CMP for the regions and ad types served. Only then set `VITE_ADSENSE_PRIVACY_CONFIGURED=true`.
4. Publish the exact authorized-seller line supplied by AdSense in the root `/ads.txt`. Never guess the publisher ID or seller relationship.
5. Verify the site and ad unit in AdSense, then inspect the deployed page for a real ad request and a successful fill before describing ads as live.

The client sends non-personalized ad requests by default. This does not replace a required consent-management platform: Google notes that non-personalized ads can still use cookies or identifiers for frequency capping and aggregated reporting, and consent may be required where applicable. Google requires a Google-certified CMP integrated with the IAB TCF when serving personalized ads to users in the EEA, UK and Switzerland.

Official provider references: [Google's personalized and non-personalized ad guidance](https://support.google.com/adsense/answer/9007336?hl=en), [Google's CMP requirement for publishers in the EEA, UK and Switzerland](https://support.google.com/adsense/answer/13554116?hl=en), and [Google's ads.txt publisher-ID guidance](https://support.google.com/adsense/answer/9785052?hl=en). Review these current policies before enabling an ad type or adding an authorized-seller record.

## Offline and token boundary

Ads never load or make ad requests while offline. The existing offline tool package and local execution behavior remain separate from ad serving.

The current repository still keeps production offline token spending disabled pending native integrity verification, recovery safeguards and independent review. The ad implementation does not enable `BILLING_OFFLINE_ENABLED`, does not claim that offline usage is now being charged, and does not weaken the offline wallet production lock. That release gate must be completed independently before promising token-backed offline consumption.

Online ad support also does not grant access to AI, cloud, media, account, premium or backend operations. Those remain subject to their own authentication, cost controls, rate limits and billing policies.

## Operator checklist

- [ ] AdSense site approved and responsive unit created.
- [ ] Privacy & Messaging/CMP configured for the traffic regions and intended ad personalization mode.
- [ ] Exact `ads.txt` seller line published and verified.
- [ ] Only reviewed, active, device-local tool IDs added to the allowlist.
- [ ] Web production environment variables set and a production build deployed.
- [ ] Guest test: selected online tool opens and works without an account.
- [ ] Negative test: backend/auth/sensitive/non-allowlisted tools show no ad.
- [ ] Offline test: ad script is not requested and local tool behavior remains unchanged.

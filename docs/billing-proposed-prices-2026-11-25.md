# enV per-tool proposed workload rates — 2026-11-25

Version: env-per-tool-rate-proposal-2026-11-25-v1

This is the generated draft rate schedule for every tool profile. Local rates are workload-based prices, not a claim about measured handset CPU bills. AI rates are calculated from the selected provider/model and actual returned usage. Cloud/media/document rates remain tied to measured processor and infrastructure cost.

- Numeric local tool rates: 9,780
- AI tools with provider/model metering: 28
- Cloud/remote tools awaiting invoice and infrastructure allocation: 206
- Total generated profiles: 10,014

## Proposed local rate distribution

| Milli-tokens per unit | enV Tokens | USD reference per unit | Tools |
|---:|---:|---:|---:|
| 75 | 0.075 | $0.00075 | 12 |
| 100 | 0.100 | $0.00100 | 5601 |
| 125 | 0.125 | $0.00125 | 1388 |
| 150 | 0.150 | $0.00150 | 121 |
| 175 | 0.175 | $0.00175 | 823 |
| 200 | 0.200 | $0.00200 | 30 |
| 225 | 0.225 | $0.00225 | 21 |
| 250 | 0.250 | $0.00250 | 1308 |
| 300 | 0.300 | $0.00300 | 26 |
| 350 | 0.350 | $0.00350 | 2 |
| 400 | 0.400 | $0.00400 | 187 |
| 450 | 0.450 | $0.00450 | 4 |
| 500 | 0.500 | $0.00500 | 91 |
| 600 | 0.600 | $0.00600 | 127 |
| 800 | 0.800 | $0.00800 | 21 |
| 950 | 0.950 | $0.00950 | 1 |
| 1000 | 1.000 | $0.01000 | 12 |
| 1200 | 1.200 | $0.01200 | 1 |
| 1500 | 1.500 | $0.01500 | 1 |
| 2500 | 2.500 | $0.02500 | 3 |

## Metering rules

- Each local profile contains its own tool ID, unit, proposed milli-token rate, cost-driver dimensions, formula and factors. Rates are calculated from the operation type and workload metadata; they remain provisional pending benchmarks and approval.
- Quote previews may convert client-supplied measurements (characters, pixels, duration, pages, bytes, assets or records) into fractional workload units. These inputs are labelled preview-only; settlement must use measurements captured by the actual execution handler.
- AI operations use provider-specific input/output-token, audio-second or compute-second prices. The selected model and usage record determine the proposed amount. Model registry estimates are not provider invoices.
- Remote media, document and processor operations use measured provider invoices and allocated infrastructure cost. They receive no invented fixed fee while invoice-level cost is missing.
- The separate 267-tool ad-free session access tariff is not an operation price and is not substituted for this per-tool schedule.
- Advertising eligibility is a separate policy. Studio, Labs, Sandbox, AI and high-end tools remain outside Adsterra regardless of their billing profile.
- All proposed rates are non-billable until their profile is audited and production billing is separately enabled.
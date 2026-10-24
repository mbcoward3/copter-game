# Rendering and asset implementation

Acceptance for the review follow-up (October 24, 2026):

| Area | Required outcome |
| --- | --- |
| Shadows | With the same camera/quality, reflection on/off preserves the set of main-view shadow casters; each viewport updates once |
| Lifetime | Repeated rescue prop/animal retirement releases private resources and preserves shared assets |
| Animation | Animal pose and foliage wind run in the depth shader as well as the surface shader |
| Uploads | Instance changes upload active ranges; unchanged static lists do not upload matrices |
| Measurement | Serial, seeded real-page captures include CPU/GPU percentiles, full-frame counters, screenshots and memory |
| Models | Shared material/rotor polish applies to all appropriate vehicles; authored shape changes preserve gameplay envelopes |
| Pipeline | Build emits asset budgets/contracts; hosted and offline outputs share the same source |
| Quality | Runtime resolution adapts independently without repeatedly reallocating shadow/MSAA targets |

Progress and measured results are recorded here as implementation proceeds. Hardware coverage is limited to hardware available on this machine; integrated-GPU acceptance remains explicitly unverified.

## Results (October 24, 2026)

Measured on Chrome/ANGLE D3D11, AMD Radeon RX 6950 XT, 1440×900, DPR 1, seed 20261024, Best quality.

| Area | Result |
| --- | --- |
| Shadows | Pass. Reflections on and off submit the same 153 shadow casters (`npm run render-check`). |
| Lifetime | Pass. A retired rescue frees all 8 private animal materials; the ring is one shared geometry. 96 rescues over 12 cycles: geometry 219 → 220, programs flat at 72. |
| Animation | Implemented: animals and foliage use deformation-matched depth materials. Checked by eye in play screenshots only. |
| Uploads | Pass (`npm test`): unchanged instances skip upload; changed ones upload only the active prefix. |
| Measurement | `npm run profile`, all 16 combinations, 20 s each: every frame p95 7.0–7.1 ms (display cap ~144 Hz); GPU p95 5.9–9.8 ms solo, 8.0–10.9 ms split; CPU submission p95 ≤ 2.6 ms solo, ≤ 4.2 ms split; simulation p95 ≤ 0.3 ms. Auto quality stayed at Best, scale 1. No page errors. |
| Models | Vehicle far LODs: helicopter 53.6k → 20.4k triangles, seaplane 17.0k → 7.6k, boat 18.1k → 7.3k. Far bodies share the near body's AO texture and materials. Sockets come from `model-contracts.json`. |
| Pipeline | Pass. `build/asset-report.json` is written on every build. Hosted build: 9.3 MB first load, 51 KB on reload (`node tools/hosted-check.mjs`). Offline HTML is 11.7 MB. |
| Quality | Pass. Resolution changes keep the same shadow map and MSAA targets. |

Submitted triangles are higher than in the review's paused probes (1.2–3.4M vs 1.1–1.3M). Shadows and the mirror now get their own visibility (union of main, shadow and mirror frusta), and the mirror gets a far-tree proxy instead of dropping near trees. GPU time is the same as before or lower. The two numbers come from different scenes, so this is not a like-for-like speedup claim.

Checks: `npm test`, `npm run check` (72 runs) and `npm run render-check` pass. `npm run play-check`: 9–11 of 11 pass. The failures were two-player outings that fail on `main` at the same rate: plane+boat fire passed 2/6 on this build and 2/5 on `main`, and a one-off boat-in-pier.

Not verified: integrated GPUs, DPR 2, mobile/thermal, other browsers, long sessions, the Docker/nginx image (Docker was not running), and how the new seaplane doorway, glazing and boat pillars look up close. Art approval needs a person.

# ADR 0003: Range from a terrain path model in the browser, not a ray tracer

Status: accepted, 2026-11-05.

## Context

A system's catalogue range now means an open field: flat, clear ground, on its standard mast. Where it really stands should change that, including its mast height, and the game must show why. The prediction and the live detection have to agree, or the prediction misleads. Detection checks every sensor against every drone on every scan, in JavaScript, and the run must replay identically from its seed (ADR 0001).

## Decision

Use one small model, `sim/propagation.js`, for radar, RF detection and jamming, and `sim/site-range.js` to turn it into a reach. The prediction, the rings, the path profile and the live detection all call it.

- **Terrain and buildings:** the Bullington method in ITU-R P.526-15, section 4.5.1, equations 31 and 49 to 57. Its loss starts as an obstacle enters the first Fresnel zone, which is how mast height counts.
- **Trees:** Weissberger's model, taking whichever is less: through the trees, or diffracted over their tops.
- **The earth's curve:** added to the profile, at the 4/3 effective radius.
- **Loss to range:** reach = open-field range x 10^(-loss / 20). This holds for a one-way link, and for a radar, which takes the loss both ways over the fourth power of range.

Cameras and lasers need a clear line. Acoustic sensors keep their simple hill and noise factors. Guided weapons fly over the ground, so where they stand does not change their range.

## Alternatives

| Alternative | Why not |
|---|---|
| NVIDIA Sionna RT | Python, built on Mitsuba 3, and needs a 3D mesh of the scene. It suits urban multipath and machine learning, not thousands of paths a second in a browser, and the game has no 3D scene for it. Could be used offline to check a real map |
| NTIA ITM (Longley-Rice) | A good candidate for checking this model offline. It adds statistical variability the game does not need, and porting it adds far more code than this model |
| NTIA P.528 | For air-to-ground paths beyond the horizon. The game's paths are under about 20 km, so the terrain matters more |
| pycraf (P.452), SPLAT!, Signal-Server | Server-side tools for planning, under GPL. Useful offline, not in the running game |

## Consequences

- A prediction cannot disagree with play, because they share the code.
- The formulas are tested against known ITU and Weissberger values. The model as a whole has not been checked against ITM or real measurements.
- Not modelled: ground reflection lobes, weather, atmospheric absorption, and each jammed link's own band. Each has a `shortcut:` comment or is listed in `docs/TODO.md`.

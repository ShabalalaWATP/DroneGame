# To do

What is still open now the rebuild to React, FastAPI and SQLite is on `main`. Detail lives in the documents linked from each item.

## Decisions for you

- [ ] **Add a remote backup.** This work exists only on one machine. Choose where it lives, and keep the repository private until you decide otherwise.
- [ ] **Commit or drop the uncommitted mapping plan edits.** `docs/REAL_MAPPING_PLAN.md` has another author's changes in the working tree, and the mapping stages below depend on them.
- [ ] **Confirm the mapping plan's assumptions.** Grid format, Great Britain coverage, what "offline" means, open data only, and whether the app is for commercial, non-commercial or public sector use, which decides the satellite imagery allowed. See "Assumptions to confirm" in `docs/REAL_MAPPING_PLAN.md`.
- [ ] **Decide what happens to `parked-friendlies-roe-spectrum`.** It holds untested work on friendly drones, rules of engagement, defence targeting and `spectrum.js`, and predates the rebuild. Reuse its ideas or delete it.
- [ ] **Delete `refactor/client-server`?** It now points at the same commit as `main`.
- [ ] **Leave the early mapping plan draft in commit `393ac0e`?** It was included by accident in Phase 3. Removing it means rewriting history, so the suggestion is to leave it, and it must be decided before a remote exists.

## Once a remote exists

- [ ] Add CI: both test suites, the reference digests, the build, `npm audit` and `pip-audit`.

## Planned features

Full detail is in `docs/MASTER_IMPLEMENTATION_PLAN.md`.

**Feature A: configurable sensors and jammers**

- [x] A1: per-unit definitions and kind checks, with digests unchanged
- [x] A2: small, medium and large catalogue entries, and the toolbar
- [x] A3: editing in the unit panel, with names and settings in laydowns and the API
- [ ] A4: radar physics, arcs, tracker fixes and map drawing
- [ ] A5: environment and electro-optical physics
- [ ] A6: RF detector, libraries and jammer physics
- [ ] A7: balance pass. This is the place to fix five lasers never losing.

**Feature B: magazine depth**

- [x] B1: magazine, storage and reload rules in the simulation. Shots are still paid for from the budget, at the user's request
- [ ] B2: balance rack size, storage and reload time. The digests are re-baselined; the balance is not done
- [x] Resupply between waves: buy back used rounds, emptiest launcher first. A bought round is paid for once
- [x] B3: the Cost tab is now Magazine depth, with a row for each launcher and laser. Expanding rows and Refill buttons are not built

**Systems added outside the plan**

- [x] Small and large interceptors, missiles and lasers, and three acoustic sensors, all from public sources
- [ ] Review the placeholder prices. The DragonFire's $2M looks low beside about $8M reported for the smaller LOCUST, and the Iron Beam and NASAMS launcher prices are set low only so that they fit the budget
- [ ] Balance the new systems. Cheap long-range acoustic stations and the Large missile have not been tuned

**Feature C: unit panel** (build this first)

- [x] C1: click a sensor or effector on the map to see its details, read-only
- [x] C2: every system shows its magazine, rounds fired, storage, reload, cost per round and range. Sensors and jammers show their own figures instead of rounds

**Feature D: wizard** (the guided steps, zone and debrief are built)

- [ ] Tuning one unit from the wizard, as in wireframe frame 7b. Kept as a to-do by choice: A3 is built, so nothing blocks it.
- [x] Setting the site's location on the start card: click a map, use this laptop's location, or type a BNG grid reference, decimal latitude and longitude, or eastings and northings.
- [ ] Typing the site's location as MGRS. Not in the mapping plan, and not small: it needs the lettering of MGRS squares and a UTM conversion that the code does not have.
- [ ] The Ask box, for typing your own questions. Not built, and the one part still to decide: it needs a language model, so it would go through FastAPI, off by default and blocked on real-site worlds.

**Later: named real systems**

- [x] Real systems listed by name when you pick a kind in the toolbar, with settings for the next one placed
- [x] UK systems added: Blighter A400, Saab Giraffe 1X, AUDS jammer, Rapid Ranger, Stormer HVM, Terrahawk Paladin, Sky Sabre, RapidDestroyer
- [x] Ranges checked against datasheets and sources, with each assessment stated, and open-field range separated from predicted range at a spot
- [x] One terrain path model for radar, RF and jamming, with rings, a polar plot and a path profile ([ADR 0003](adr/0003-range-from-a-terrain-path-model.md))
- [ ] More real systems, such as Giraffe AMB and Aveillant Gamekeeper, and replacing the two generic entries. A row for guns and one for RF weapons, which sit under Missile and Laser for now
- [x] Hit chance for guided rounds, by weapon, evasion, target speed, range and track quality. Launchers shoot, look and shoot while there is time, salvo when there is not, and move to the next target while rounds fly
- [x] A beam's damage falls with distance, and sensor error grows as the signal weakens
- [ ] Better figures for hit chance: 8 of 11 are assumptions, because no rate is published. Only the Sting, P1-SUN and DroneHunter have reported figures
- [ ] Jamming strength that falls with distance: inside its reach a jammer works fully, then stops. Real jamming depends on how far the drone is from its own controller too
- [ ] Use the bands a detector listens on: `listens` is only drawn on the Spectrum tab, so it does not limit what is heard. Each jammed link should use its own band
- [ ] A radar that classifies by micro-Doppler, as the IRIS and A400 do. Only cameras identify an airframe now
- [ ] The Sting is built to hit Shahed-type drones, but a game rule says interceptors cannot catch fixed-wing drones
- [ ] Check the path model offline against NTIA ITM, and against any real measurements
- [ ] Rain and haze for lasers and cameras, and ground reflection lobes for radar

**Real-world mapping** (see `docs/REAL_MAPPING_PLAN.md`)

- [x] M0 to M4, and the map building and live layer from M5
- [ ] Model site, live OS map and place search (these need an OS API key), Wales and Scotland lidar, sharper aerial photos, and a test on a dense city
- [ ] Read coordinate limits from the world. The backend still checks against the fixed `WORLD_LIMIT` in `backend/app/schemas.py`, one of the mapping plan's small asks of the rebuild, and it matters once real worlds differ in size.

## Known limits to fix if they start to matter

- [ ] **A test that sometimes fails.** `save-panels.test.jsx`, "shows kept runs and saves them when the server is back", failed in about 1 of 4 runs on a busy machine: it checks for the error message before the list has finished reloading.
- [ ] **The wizard on a small window.** Below about 1,380 px wide, the popup covers the left edge of the SAPIENT panel. It can be moved or collapsed. See `#wizard` in `frontend/src/style.css`.
- [ ] **Automated browser test.** The frame loop and page-load code in `frontend/src/game.js` and most of `frontend/src/render` need WebGL, so they are only checked by hand.
- [ ] **Duplicate saved runs.** A run can be saved twice if the page closes or the connection drops just after the server stored it, or if two tabs retry together. Fix: send an id the server deduplicates on. See `frontend/src/api/run-saver.js`.
- [ ] **Back/forward cache.** A page restored this way keeps playing a run that was already recorded when it closed. See `frontend/src/game.js`.
- [ ] **One simulation at a time.** The bus, clock, terrain and random streams are module-level singletons. Pass them in if parallel runs are needed. See `frontend/src/sim/simulation.js`.
- [ ] **Stored figure keys.** The backend accepts keys such as `constructor`. They are harmless there, and the frontend ignores them on import. Reject them at the API if the backend ever uses them.

## Only if this is ever hosted

- [ ] Work through "Before hosting" in `docs/SECURITY_NOTES.md`: sign-in, ownership checks, rate limits, HTTPS, a move off SQLite and a new security review.

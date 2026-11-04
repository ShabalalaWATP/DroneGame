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

- [ ] B1: magazine rules in the simulation
- [ ] B2: re-baseline the digests and balance rack size and missile capacity
- [ ] B3: the magazine tab

**Feature C: unit panel** (build this first)

- [x] C1: click a sensor or effector on the map to see its details, read-only
- [ ] C2: ammunition state, alongside B1

**Feature D: wizard** (the guided steps, zone and debrief are built)

- [ ] Tuning one unit from the wizard, as in wireframe frame 7b. Waits for A3.
- [ ] Setting the site's location: click a map, or type latitude and longitude, a BNG grid reference, eastings and northings, or MGRS. Waits for M4. MGRS is not in the mapping plan, and latitude and longitude means running the pack's fit backwards.
- [ ] The Ask box, for typing your own questions. Not built, and the one part still to decide: it needs a language model, so it would go through FastAPI, off by default and blocked on real-site worlds.

**Later: named real systems**

- [ ] A list of specific sensors and effectors to choose from within each kind, such as named radars, with their own figures. Not yet planned in detail.

**Real-world mapping** (see `docs/REAL_MAPPING_PLAN.md`)

- [x] M0: prove the data
- [x] M1: separate the world from its source
- [ ] M2: pack builder and loader, including England lidar
- [ ] M3: draw the real world, with satellite, hybrid and the map controls
- [ ] M4: choose the world, place the site and effectors
- [ ] M5: online extras
- [ ] M6: Wales and Scotland lidar, and real features

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

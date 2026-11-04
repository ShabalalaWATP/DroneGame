# To do

What is still open now the rebuild to React, FastAPI and SQLite is on `main`. Detail lives in the documents linked from each item.

## Decisions for you

- [ ] **Add a remote backup.** This work exists only on one machine. Choose where it lives, and keep the repository private until you decide otherwise.
- [ ] **Commit or drop the uncommitted plan edits.** `docs/MASTER_IMPLEMENTATION_PLAN.md` (the feature plans) and `docs/REAL_MAPPING_PLAN.md` have another author's changes in the working tree. The features below depend on them.
- [ ] **Confirm the mapping plan's assumptions.** Grid format, Great Britain coverage, what "offline" means and open data only. See "Assumptions to confirm" in `docs/REAL_MAPPING_PLAN.md`.
- [ ] **Decide what happens to `parked-friendlies-roe-spectrum`.** It holds untested work on friendly drones, rules of engagement, defence targeting and `spectrum.js`, and predates the rebuild. Reuse its ideas or delete it.
- [ ] **Delete `refactor/client-server`?** It now points at the same commit as `main`.
- [ ] **Leave the early mapping plan draft in commit `393ac0e`?** It was included by accident in Phase 3. Removing it means rewriting history, so the suggestion is to leave it, and it must be decided before a remote exists.

## Once a remote exists

- [ ] Add CI: both test suites, the reference digests, the build, `npm audit` and `pip-audit`.

## Planned features

Full detail is in the uncommitted `docs/MASTER_IMPLEMENTATION_PLAN.md`.

**Feature A: configurable sensors and jammers**

- [ ] A1: per-unit definitions, laydown data and pricing, with digests unchanged
- [ ] A2: small, medium and large catalogue entries, and the toolbar
- [ ] A3: editing in the unit panel
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

**Real-world mapping** (see `docs/REAL_MAPPING_PLAN.md`)

- [ ] M0: prove the data
- [ ] M1: separate the world from its source
- [ ] M2: pack builder and loader
- [ ] M3: draw the real world
- [ ] M4: choose the world, place the site and effectors
- [ ] M5: online extras
- [ ] M6: lidar and real features
- [ ] Read coordinate limits from the world. The backend still checks against the fixed `WORLD_LIMIT` in `backend/app/schemas.py`, one of the mapping plan's small asks of the rebuild, and it matters once real worlds differ in size.

## Known limits to fix if they start to matter

- [ ] **Automated browser test.** The frame loop and page-load code in `frontend/src/game.js` and most of `frontend/src/render` need WebGL, so they are only checked by hand.
- [ ] **Duplicate saved runs.** A run can be saved twice if the page closes just after the server stored it, or if two tabs retry together. Fix: send an id the server deduplicates on. See `frontend/src/api/run-saver.js`.
- [ ] **Back/forward cache.** A page restored this way keeps playing a run that was already recorded when it closed. See `frontend/src/game.js`.
- [ ] **One simulation at a time.** The bus, clock, terrain and random streams are module-level singletons. Pass them in if parallel runs are needed. See `frontend/src/sim/simulation.js`.
- [ ] **Stored figure keys.** The backend accepts keys such as `constructor`. They are harmless there, and the frontend ignores them on import. Reject them at the API if the backend ever uses them.

## Only if this is ever hosted

- [ ] Work through "Before hosting" in `docs/SECURITY_NOTES.md`: sign-in, ownership checks, rate limits, HTTPS, a move off SQLite and a new security review.

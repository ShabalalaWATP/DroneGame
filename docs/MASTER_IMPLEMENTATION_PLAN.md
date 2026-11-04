# Site Guard: client-server re-engineering plan

Status: approved 2026-11-04. Work happens on `refactor/client-server`, branched from `main`.

## Goal

Move Site Guard from static files to a React frontend, a FastAPI backend and a SQLite database, with no loss of existing features and a structure that follows SOLID.

## Decisions already made

| Decision | Choice | Reason |
|---|---|---|
| Where the simulation runs | In the browser | Same performance and offline use. A server simulation only pays for itself with multiplayer, real hardware or tamper-proof scores. |
| What the backend does | Stores and serves saved data, and serves the built frontend | It takes no part in live play |
| Engineering rules | SOLID and Ponytail (see below) | Requested |

## How SOLID and Ponytail work together

Ponytail asks for the smallest complete change and no unrequested abstractions. It also says never to cut anything the user asked for, and SOLID was asked for. So SOLID applies wherever it separates things that really do change for different reasons.

**The test for a new seam:** add one only if it has two real implementations today, or a test needs it, or it separates two reasons to change that already exist in the code. Otherwise leave it out and record any known limit in a comment: `shortcut: <the limit>, <when to upgrade>`.

| Principle | Where it applies | Where it does not |
|---|---|---|
| **S**ingle responsibility | Split `main.js` into simulation rules, Three.js rendering and React UI. Split `network.js` by job. Routes, services and SQL stay in separate files. | No one-function files, and no splitting of code that always changes together |
| **O**pen/closed | Effector behaviour moves to a table keyed by `def.fire`. Today only `guided` exists, so the laser gains `beam` and the jammer gains `jam`, replacing the `def.id === 'laser'` and `def.id === 'jammer'` branches. Drone movement is keyed by role. Dock tabs come from a list. | No plugin system. Adding a system still means editing the data files. |
| **L**iskov substitution | Every effector honours one contract: `act(system, target, dt)`. Every sensor honours one detection contract. Every store honours its Protocol. | No class hierarchies. Plain functions and objects are enough. |
| **I**nterface segregation | The simulation exposes three small surfaces: `commands`, `snapshot()` and `on(event)`. Each React component reads only its own hook, replacing the 10-argument `initDock`. | No interface for a single caller inside one module |
| **D**ependency inversion | The simulation knows nothing about rendering or the UI: they subscribe to it. Backend services depend on small Protocols, and routes receive them through `Depends`. | No dependency injection container. No repository base classes. |

## Target layout

```text
frontend/
  package.json, package-lock.json, vite.config.js, index.html
  src/
    sim/      Rules only: no React, no DOM, no rendering (runs in Node)
    render/   Three.js only: reads simulation state, never changes it
    ui/       React components and hooks
    api/      One small fetch client
backend/
  pyproject.toml, uv.lock
  app/
    main.py        App creation, middleware, static files
    routes/        HTTP only: parse, call a service, return
    services/      Rules and limits
    db/            SQL, migrations/*.sql, connection handling
    schemas.py     Pydantic models
  tests/
docs/
```

### Where the existing code goes

Files stay under the 350-line target, with 400 as the exceptional limit. `config.js` is data, and is split because it is 557 lines, not because the split adds any design value.

| Today | Lines | Target |
|---|---|---|
| `main.js`: state, placement rules, drones, targeting, effectors, missiles, waves, economy, sandbox, reset, snapshots | 1,469 | `sim/simulation.js`, `sim/drones.js`, `sim/targeting.js`, `sim/effectors.js`, `sim/waves.js`, `sim/economy.js`, `sim/laydown.js`, `sim/snapshot.js` |
| `main.js`: scene, models, rings, beliefs, labels, effects, ghost, input | | `render/scene.js`, `render/models.js`, `render/drone-view.js`, `render/belief-view.js`, `render/labels.js`, `render/effects.js`, `render/placement.js` |
| `main.js`: HUD, toolbar, tuning, sandbox panel, approvals, minimap | | `ui/` components. The minimap canvas drawing code moves as it is. |
| `network.js` | 702 | `sim/sensors.js`, `sim/registration.js`, `sim/fusion.js`, `sim/tasking.js`, `sim/authority.js`, `sim/network.js` |
| `config.js` | 557 | `sim/config/` split into world, systems, drones, comms and figures |
| `sapient-ui.js`, `network-ui.js` | 467, 470 | One component per dock tab under `ui/dock/`. The plan, network and spectrum canvas drawing code moves as it is. |
| `replay.js` | 221 | `sim/recorder.js`, `render/replay-view.js`, `ui/Timeline.jsx` |
| `terrain-view.js` | 245 | `render/terrain-view.js`, unchanged |
| `tracker.js`, `comms.js`, `terrain.js`, `sapient.js`, `rng.js`, `sapient-help.js` | | `sim/`, unchanged. These already have no browser dependencies, and `sapient-help.js` holds plain text. |
| `style.css` | 224 | Kept and imported as it is |
| `tools/` (regression checks and digests) | | `tests/` in Vitest, and `tools/balance.js` for balance runs |
| `serve.py`, `vendor/` | | Deleted in Phase 2 |
| `README.txt` | | Replaced at cut-over |

## Choices made to keep it small

These are deliberately left out. Each can be added later if a real need appears.

| Left out | Used instead | When to reconsider |
|---|---|---|
| SQLAlchemy and Alembic | Standard library `sqlite3`, numbered SQL files and `PRAGMA user_version` | Moving to Postgres or hosting for many users |
| TypeScript | Plain JavaScript, as the codebase is today | A later project of its own. Changing language during the restructure would make regressions harder to trace. |
| Redux, TanStack Query, React Router | `useSyncExternalStore` and `fetch` | The UI gains real page navigation |
| react-three-fiber | One component that mounts the existing Three.js scene | Never, for this game: per-frame updates should not go through React |
| Rewriting vector maths | Keep `Vector3` from `three` inside `sim/`, as math only | See the note below |
| Web Worker for the simulation | Main thread, as today | Frame rate becomes a measured problem |
| CORS, Docker, sign-in | Same-origin only, local run, bound to `127.0.0.1` | Hosting (see Security) |
| A scenarios table | Three tables only | Custom scenarios become a feature |
| Reopening a saved run in replay | The run's inputs are stored, but no replay feature is built | Someone wants it. The inputs cannot be recovered later, which is why they are stored now. |

**Why `Vector3` stays:** I confirmed it loads and runs in Node. Hand-written replacements could round floats differently, which would change results and break the reference runs that prove the restructure is safe. Importing it is a maths dependency, not a rendering one, and a test enforces that no other part of `three` is used in `sim/`.

## Database

SQLite file at `backend/data/siteguard.db`, which is git-ignored. JSON columns hold structured game data, and are validated by Pydantic on the way in.

```sql
CREATE TABLE laydowns (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  world TEXT NOT NULL,            -- the terrain seed today
  spec TEXT NOT NULL,            -- JSON: systems, positions, wiring, bands
  game_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE runs (
  id INTEGER PRIMARY KEY,
  scenario_seed TEXT NOT NULL,
  world TEXT NOT NULL,            -- the terrain seed today
  spec TEXT NOT NULL,            -- a copy, so editing a laydown never rewrites history
  figures TEXT NOT NULL,         -- tuning in force, since it changes the result
  commands TEXT NOT NULL,        -- operator inputs by simulation step
  game_version TEXT NOT NULL,
  digest TEXT NOT NULL,
  waves_completed INTEGER NOT NULL,
  kills INTEGER NOT NULL,
  leaks INTEGER NOT NULL,
  health REAL NOT NULL,
  budget_left REAL NOT NULL,
  capex REAL NOT NULL,
  consumables REAL NOT NULL,
  enemy_cost REAL NOT NULL,
  finished_at TEXT NOT NULL
);

CREATE TABLE figure_sets (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  figures TEXT NOT NULL,         -- JSON: the same shape as exportFigures()
  game_version TEXT NOT NULL,
  created_at TEXT NOT NULL
);
```

**Correction to the earlier outline:** a seed and laydown alone cannot regenerate a run. Engagement approvals, jam band changes and the moment each wave starts all affect the result, as do tuned figures. That is why `figures` and `commands` are stored too.

SAPIENT messages are not stored, because one run produces thousands. The existing NDJSON export still covers saving a log.

## API

All under `/api/v1`, JSON only.

| Method and path | Purpose |
|---|---|
| `GET /health` | Liveness check |
| `GET, POST /laydowns` | List, create |
| `GET, PUT, DELETE /laydowns/{id}` | Read, replace, delete |
| `GET, POST /runs` | List with paging, record a finished run |
| `GET, DELETE /runs/{id}` | Read, delete |
| `GET, POST /figure-sets` | List, create |
| `GET, DELETE /figure-sets/{id}` | Read, delete |

Run results are reported by the browser, so they cannot be trusted as proof of a score. They are labelled as such, and there is no leaderboard.

## Security

Runs locally with no sign-in, which is the main thing to design around.

- **Bind to `127.0.0.1` only.** This also fixes the `serve.py` issue of exposing the folder to the LAN.
- **Block attacks from web pages you visit:** `TrustedHostMiddleware` limited to `localhost` and `127.0.0.1` stops DNS rebinding. With no CORS and JSON-only writes, other sites cannot post to the API.
- **Validate all input with Pydantic:** known system IDs only, coordinates inside the world, finite numbers, name length limits, a capped number of systems and a request size limit. Seeds are length-limited.
- **SQL uses bound parameters only.**
- **No raw HTML from data in React:** `dangerouslySetInnerHTML` is banned. Source links in the Sources tab allow `https:` only.
- **Content Security Policy** on served pages, with no inline scripts and same-origin connections only.
- **Keep the database out of reach:** only the built frontend folder is served as static files, never the project root.
- **Hosting is not covered:** it would need sign-in, per-user ownership checks on every object, and a new security review before any deployment.

## Phases

Every phase leaves the game working and ends with a commit or small series of commits. Each behaviour-preserving phase must reproduce the reference digests exactly.

### Phase 0: Repo hygiene

- [x] Add `.gitattributes` and normalise line endings, which clears the 13 noise-only modified files
- [x] Add `.gitignore`: `node_modules`, `dist`, `.venv`, `__pycache__`, coverage output, `backend/data/`, `.claude/`
- [x] Rename `master` to `main` and create a working branch from it
- [x] Settle the open decisions (see Settled decisions)

**Done when:** `git status` shows only intended changes.

### Phase 1: Fix the small bugs and make runs repeatable

- [x] `serve.py`: use `ThreadingHTTPServer` and bind to `127.0.0.1`
- [x] Stop the seed in the URL being injected as HTML at `main.js:1101`
- [x] Remember the laydown at the first wave, so Reset and Retry restore destroyed systems
- [x] Remove strike drones that leave the world, so a wave cannot stay open for ever
- [x] Rebuild the run from its laydown when the first wave starts, so build time and placement order cannot affect it. Time between later waves remains an operator input, recorded in Phase 3.
- [x] Replace `Math.random` in `injectFault` at `network.js:673` with a seeded draw that cannot shift the simulation stream. The two UI uses, the seed button and the packet pulses, can stay.
- [x] Correct the Sell tooltip, the stale comment at `network.js:5` and the variance formula at `tracker.js:236`
- [x] Remove `addTracer` and `FUSION.trackTimeout`
- [x] Record reference runs: several seeds and laydowns, scripted through `window.game`, saved as digest fixtures

**Done when:** a run's digest no longer depends on idle time, and each bug has a check that failed before its fix.

### Phase 2: Move to Vite, with no behaviour change

- [x] Move the current files to `frontend/src/`, and install `three@0.160.0` (the same version as `vendor/`) and Vite
- [x] Update the imports, keeping the current `index.html` and UI

- [x] Delete `serve.py` and `vendor/` early, because nothing can use them after the move. The npm copy of Three.js is byte-identical to the vendored one.
- [x] Use port 5199, because Docker holds 5173 on this machine

**Done when:** `npm run dev` plays the game, and reference digests match in both the dev server and the production build.

### Phase 3: Separate the simulation

- [x] Add a command dispatcher: every action that changes state goes through `commands`, and is logged by simulation step
- [x] Move rules from `main.js` into `sim/`, one area at a time, replacing direct mesh creation with events
- [x] Replace `d.group.rotation.y` in snapshots with a heading stored in the simulation
- [x] Split `network.js` and `config.js`
- [x] Add a boundary test: `sim/` has no DOM or React, and takes only `Vector3` from `three`
- [x] Add Vitest and run reference digests in Node. If Node and Chromium disagree on floats, record that and baseline in Node, after proving the browser still matches its own fixtures.
- [x] Add a Node balance script that reproduces the laydown table from the review

**Done when:** a full game runs in Node with no browser, digests match, and every source file meets the size target. `ui/sapient-ui.js` and `ui/network-ui.js` stay over it until Phase 5 replaces them, and a test holds everything else to the limit.

**Result:** Node and Chromium agree on every digest, so no re-baselining was needed. 201 tests pass, with 98.8% statement and 93.2% branch coverage of `sim/`. `main.js` went from 1,469 lines to about 100.

**Accepted limit:** `bus`, `clock`, `terrainState` and the random number streams stay as module-level singletons, because two simulations never run at once. Record it as a `shortcut:` comment. Upgrade if parallel runs are ever needed.

### Phase 4: Fix ghost-track engagement and check balance

This is the one phase that deliberately changes results, so it gets its own re-baselined digests.

- [x] An effector only acquires a real drone close to the track's estimated position, not any drone the track was tied to
- [x] Display and behaviour text must come from the track, not from the true drone
- [x] Rerun the balance table. The review measured a defence that depends on this bug, so expect a sharp drop.
- [x] Tune only enough to restore a playable game, mainly radar clutter. A full rebalance (lasers, budget, the wave 4 wall) is separate work.

**Done when:** engagements happen only near real drones, balance results are recorded in the development story, and new digests are committed with the reason.

**Result:** the plan expected radar clutter to be the problem. Measuring showed trees were: they caused 80-86% of radar misses inside its range, and clutter only 4%, because a 6 m mast sits below the 12-20 m canopy. Engagements now happen only within 300 m of a real drone, against up to 8.5 km before.

- **Changed:** masts raised to 25 m (radar) and 15 m (compact radar and camera), clutter penalty 0.3, and bearing-only tracks need three different sensors to confirm.
- **Wave lost, seeds 1 / 7 / 42, before and after this phase:** Mixed 7/6/6 to 12/13/13. 3 lasers 7/8/4 to 8/9/8. One of everything 10/11/11 to 12/11/12. 8 interceptors and 6 jammers stay at 4/4/4.
- **Still open for the rebalance:** 5 lasers now reach the 30-wave cap on all three seeds, so that laydown never loses. With RF detectors in the mix, only about half of confirmed tracks sit on a real drone.

### Phase 5: React frontend

- [x] Add React with no extra libraries. One `GameCanvas` component owns the Three.js scene.
- [x] Add a `useSimulation` hook on `useSyncExternalStore`, updating panels about 5 to 10 times a second
- [x] Port one panel at a time, deleting its old DOM code each time: HUD, toolbar, control panel, approvals, sandbox, tuning, timeline, minimap, then each dock tab
- [x] Keep name tags and other per-frame labels in `render/`, outside React

**Done when:** every item on the parity checklist passes in a browser, and no `innerHTML` built from data remains.

**Result:** every panel is React, and every source file is within 350 lines. `style.css` is unchanged, and class names and ids were kept, so the game looks the same. Reference digests match in Node and the browser, 304 tests pass, with 97.8% statement and 91.2% branch coverage of `sim/` and `ui/`. The parity checklist passes in a browser, except that figure import and log and figure export were only tested with stubbed files.

### Phase 6: Backend

- [x] Create the project with `uv` and Python 3.12 or later, adding FastAPI and Uvicorn only, with pytest and httpx for tests
- [x] Add the migration runner, the three tables, the Protocols and SQLite stores, services, routes and the security items above
- [x] Test against real SQLite, including rejected input, oversized requests, wrong hosts, and migrations from empty and from the previous version

**Done when:** tests pass at 90% coverage or higher, and the API docs match the table above.

**Result:** 106 tests pass at 98.9% coverage, against real SQLite files, and the API table is checked by a test. The protections were also checked against the real server over sockets. Interactive docs are off because they load scripts from a CDN, and the schema is at `/api/v1/openapi.json`. Packages are limited to releases at least two weeks old through `exclude-newer` in `pyproject.toml`.

**Schema decisions:** the column is `world`, not `terrain_seed`, as the mapping plan asked, because renaming later would also change the API. The `munitions_bought` column is left for Feature B to add in its own migration, because nothing can fill it until then. Coordinates are checked against a fixed limit, which real-world packs will need to replace.

### Phase 7: Connect saving to the game

- [x] Add a save and load laydown panel, a run history panel, and saved figure sets in the Sources tab
- [x] Record a run when it ends, however it ends
- [x] **Keep playing if the backend is down:** the game still runs and panels show a clear message. A run that fails to save is reported to the player and not silently lost.
- [x] Have the Vite dev server proxy `/api` to the backend, so no CORS is needed

**Done when:** a laydown saved in one session loads in another and plays with the same digest, given the same inputs.

**Result:** verified end to end against the real backend: a laydown saved in one page session, reloaded and played with the same inputs gave the same digest, kills, budget and health. With the backend stopped, panels say so, the game keeps playing and runs are kept in the browser, then saved when it returns.

**Additions:** figure edits and enemy learning now go through logged commands, and enemy learning joined the figures, because both change results. The authority and auto-start settings in force are logged at the start of a run. A saved run replays to its own digest, tested with tuning, operator inputs, decisions and time between waves. Sample records in `backend/tests/fixtures/` are checked by both test suites, so a change of shape on either side fails.

### Phase 8: Cut-over and documentation

- [x] FastAPI serves the built frontend, with one documented command to build and one to run
- [x] Replace `README.txt` with a proper README
- [x] Write the README, `docs/DEVELOPMENT_STORY.md`, `docs/SECURITY_NOTES.md` and ADRs for the simulation location and for choosing `sqlite3`
- [x] Add CI only if a remote exists by then
- [ ] Run the security and code quality reviewers over the whole branch

**Done when:** a clean clone can be installed and played by following only the README.

## Feature parity checklist

Check in a real browser at the end of Phase 5 and again at the end of Phase 8.

- [x] Start screen: scenario seed, terrain seed, random seed, Deploy, and seeds in the URL
- [x] Placement: all eight systems, hotkeys 1 to 8, ghost preview and reasons for refusal, sell and refund, laydown lock
- [x] Camera controls and the minimap (click, drag, scroll)
- [x] Waves: start, auto-start, speeds, pause, wiring warning, adaptation, game over and retry
- [x] Toggles: ranges, truth overlay, labels, highlight tracks
- [x] Engagement authority: all three modes, approval cards, auto-pause and expiry
- [x] Sandbox: wave levels, custom attacks, clear, exit keeps the laydown
- [x] Reset run and New laydown, including the two-click confirmation
- [x] Replay: timeline, stepping, play, event markers, keyboard shortcuts
- [x] Messages tab: filters, freeze, clear, export, inject fault, explain
- [x] Nodes tab, and Plan tab with coverage maps
- [x] Network tab: auto-wire, clear, click to wire, tapped wires, step to next packet, band settings
- [x] Spectrum tab, and Learn tab with follow a track
- [x] Cost tab, and Sources tab with edit, reset, import, export and the range scale
- [x] Tuning panel, legend, and `window.game` in development builds

## Testing

| Area | Tool | Target |
|---|---|---|
| `sim/` | Vitest in Node, plus reference digests | 90% coverage |
| `ui/` logic and hooks | Vitest with React Testing Library | 90% coverage |
| `render/` | Excluded from coverage because it needs WebGL, and checked with a browser smoke test | Smoke test passes |
| `backend/` | pytest with httpx | 90% coverage, stronger on validation |

Tests cover behaviour that could really break. Coverage thresholds go in the config and are not lowered to pass.

## Risks

| Risk | Mitigation |
|---|---|
| Phase 3 changes results without anyone noticing | Reference digests after every step, in small commits |
| Node and Chromium disagree on floating-point results | Check early in Phase 3, and baseline in Node if needed |
| The Phase 4 fix leaves the game unplayable | The Node balance script makes tuning cheap, and the phase has its own stopping point |
| React slows the game | Panels update on a throttle, and nothing per-frame goes through React |
| Long pause in new features | Each phase leaves a playable game and can be stopped at |
| Saved laydowns break when rules change | `game_version` is stored, and a mismatch shows a warning |
| Ponytail's plugin changes on update | Version 5.3.3 was reviewed. Review again before updating. |

## Settled decisions

1. **`parked-friendlies-roe-spectrum` stays parked.** It is untested and branched before Three.js was bundled locally. The feature gets rebuilt on the new structure after Phase 5, using the branch as reference only.
2. **No GitHub remote yet.** CI in Phase 8 is therefore skipped. The risk is that this work has no off-machine backup until a remote is added.
3. **Default branch renamed from `master` to `main`.**

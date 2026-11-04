# Development story

How Site Guard moved from static files to a React, FastAPI and SQLite application, and what was learned on the way. For what is planned next, see the [implementation plan](MASTER_IMPLEMENTATION_PLAN.md).

## Where it started

A browser game in plain JavaScript modules with no build step: about 5,500 lines, including a 1,469-line `main.js` that mixed rules, rendering and UI, and no tests. The simulation design was already strong: seeded random streams, a Kalman tracker, a comms model and real SAPIENT messages.

A review found these bugs by running the game:

- `serve.py` handled one connection at a time, so one idle browser socket stopped the page loading.
- A seed in the URL ran as script.
- Reset lost systems the enemy had destroyed.
- Drones drifting under GNSS jamming could hold a wave open forever.
- Results depended on how long you spent building.
- Ghost tracks scored kills from kilometres away.

## Decisions

- **Client-server for data, but the simulation stays in the browser.** See [ADR 0001](adr/0001-simulation-runs-in-the-browser.md).
- **Standard library `sqlite3`, with JSON columns for tuning.** See [ADR 0002](adr/0002-sqlite-with-json-columns.md).
- **SOLID, with a test for each seam.** Add one only if it has two real implementations today, a test needs it, or it separates two reasons to change that already exist.
- **Ponytail for restraint.** No TypeScript, Redux, React Router, react-three-fiber, SQLAlchemy or Docker.

## How it went

**Phases 0 and 1: hygiene and bugs.** Thirteen "modified" files were only line endings. Each fix had a check that failed on the old code first. A rebuild at the first wave made runs independent of build time and placement order.

**Phase 2: Vite.** The npm copy of Three.js was byte-identical to the bundled one, and digests matched in dev and production. Docker holds port 5173 on the development machine, so the game uses 5199.

**Phase 3: separating the simulation.** The risky step, protected by reference digests. They matched in Node on the first attempt, which also settled the worry that Node and Chromium might disagree on floating point. Keeping Three.js `Vector3` in the rules, rather than rewriting it, was what made that possible.

**Phase 4: ghost tracks.** The plan expected radar clutter to be the problem and predicted the fix would make the game much harder. Measuring showed both were wrong: trees caused 80-86% of radar misses inside its range and clutter only 4%, because a 6 m mast sits below the canopy. Raising masts made radar viable, and Mixed went from wave 6 to wave 13. Five lasers now never lose, which is left for a rebalance.

**Phase 5: React.** Every panel became a component while keeping class names, so the game looks the same. Removing HTML built from strings closes the kind of injection found in the review, and a test keeps it that way.

**Phase 6: backend.** Protections were checked against the real server over sockets, as well as in tests. FastAPI masked an oversized-body error as a 400 until the body was read before the app saw it.

**Phase 7: saving.** A laydown saved in one session, reloaded and played with the same inputs gave the same digest. Stopping the server mid-session showed runs being kept safely and saved on its return.

**Phase 8: cut-over.** FastAPI serves the built game on one port, and the strict Content Security Policy held across every tab with no violations. A clean clone was installed and played from the README alone. Two independent reviews then found real bugs that 489 passing tests had missed: importing figures could overwrite `Object.keys`, a run could be reported as kept when it had been lost, closing the page mid-save lost the run, deleting the last row on the last page stranded the Runs tab, and systems and ground leaked GPU memory. Each was reproduced with a failing test before it was fixed, and the GPU fixes were confirmed by counting live WebGL buffers in a browser.

## What kept proving useful

- **Measuring instead of predicting.** Twice the measurement overturned the plan's explanation. Tracks being mislabelled was the first guess in Phase 4, and they turned out to be ghosts.
- **Independent review.** Reviewers given the code, not the conclusions, found what the author's own tests were written not to see.
- **Breaking things on purpose.** Twice a test that looked solid passed with the fix removed. One read its limit from the setting being broken, and another edited a drone that was never engaged in its window.
- **Digests as a safety net.** They caught stale browser files during Phase 1, when a re-run gave exactly the old values.
- **Being honest about test setups.** Digests that looked broken in Phase 5 came from a page on the wrong terrain seed.

## Mistakes worth remembering

- A `git add -A` in Phase 3 committed another author's draft of `docs/REAL_MAPPING_PLAN.md`. Later commits staged only named paths.
- An early test for prototype pollution used an object literal, where `__proto__` sets the prototype instead of adding a key, so it passed on vulnerable code. `JSON.parse` is what real input goes through, and it reproduced the bug.
- A test in Phase 5 looped forever waiting for a spotter that had been shot down, which hung the run for over eight minutes.

## Real maps

Started with measurements rather than code. Two test areas showed lidar works and is worth having, that a third of tall cover sits outside OS woodland outlines, and that a whole pack is about a third of the size first estimated. The design held: Three.js stays the only renderer, the rules read the same grids, and generated worlds still give the same digests. A hand test also caught what unit tests had not: the server lists a pack's full fingerprint, and the store compared it with the short form.

## Numbers at the end of Phase 8

| | Before | After |
|---|---|---|
| Automated tests | 0 | 509 |
| Largest source file | 1,469 lines | 246 lines |
| Commands to run | 1 | 1, after a one-time build |

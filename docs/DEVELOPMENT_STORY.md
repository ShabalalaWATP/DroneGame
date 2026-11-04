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

## After Phase 8

A whole-repo audit found four bugs that the test suites had missed, each now fixed with a test that failed first:

- The coverage map kept showing the previous laydown, because node ids repeat after a reload and its cache key held little else.
- A connection dropping while the server's answer arrived deleted the browser's kept copy of a run.
- Going back to live from a replay restarted the clock, even with a weapons decision still waiting.
- The message export said it saved every message, but the log keeps only the newest 5,000.

## The wizard

Alex steered this one by editing a wireframe canvas directly: moving the button, marking which decisions they agreed, and striking out in-wave tips because the run should feel like a simulation. The first plan had an AI chat box at its centre. It became a scripted guide, because the browser can only reach its own backend, the game has to work offline, and a coverage gap on a real site should not leave the machine. The chat box stays undecided in `docs/TODO.md`.

Only a real browser showed one bug: the highlight ring landed inside the popup. The popup's blur makes it the frame that fixed-position children are measured from, which jsdom does not model. The ring now draws straight into the page.

## Clicking a system to see what it is

Stage C1 of the planned features: click a sensor or effector on the map, or its button in the Nodes tab, and a panel shows what it is doing, its health, range, ammunition, network link, position and cost. Selection is view state and not a command, so it is never logged and cannot change a run. The reference digests did not move.

Prototyping changed the design before any code was written. Starting wave 1 rebuilds every system with a new id and sometimes a new callsign, so the panel finds its unit again by position. In a real browser, a CSS rule flattened the jammer's list and the panel covered the toolbar with the dock open. jsdom showed neither. The assistant wizard had also taken the planned spot beside the minimap, so the panel moved beside the control panel.

## Small, medium and large

Stages A1 and A2: radar, RF detector, camera and jammer each come in three sizes, chosen from the toolbar or by pressing a hotkey again. Each placed unit now has its own definition over the catalogue's.

The change came in two checks. Adding the sizes and the kind checks left all five reference digests exactly as they were. The renames then changed all five, because names travel in registration messages, but kills, leaks, health and budget matched in every scenario, so the new digests record only the new names.

Checking sources changed two figures. The large radar's assumed 5 km became 4.3 km, scaled from a reported 9 km against a 0.2 m² drone. The large camera became 1.6 km at a fixed 2° view, because range and view have to be set as a pair until the zoom is modelled. Laydown fields and API fields moved to A3, because nothing could write them yet.

The small detector needed testing against the tracker: its ±30° bearing looked likely to fill it with ghost tracks. It does not. Alone, small detectors track almost nothing, and beside a radar they do no harm.

## Editing one system

Stage A3: the Unit panel gains a Configure side for renaming a unit, changing its fields within its size's limits, and selling it. Only fields that already change the game are offered, and arcs, bands and lens choices wait for the stages that give them rules.

A unit's values are worked out when read, from the catalogue and its own settings, so edits in the Sources tab still reach it and no unit can drift out of step. With nothing changed, the saved laydown and the reference digests are exactly as before.

The user reported they still could not click a system. It turned out to be worse: with a placement tool on, clicking a model bought a second one on the ground behind it, because the ground point was far enough away to be legal. My earlier check had pressed Esc first. The running server also had to be restarted, or it would have refused saves using the new sizes and settings, which no test of the code on disk could show.

## Real maps

Started with measurements rather than code. Two test areas showed lidar works and is worth having, that a third of tall cover sits outside OS woodland outlines, and that a whole pack is about a third of the size first estimated. The design held: Three.js stays the only renderer, the rules read the same grids, and generated worlds still give the same digests. A hand test also caught what unit tests had not: the server lists a pack's full fingerprint, and the store compared it with the short form.

The real maps were built on their own branch while the wizard, unit editing and the zone went on `main`, so the two met in one merge. Both were kept. The earlier OpenStreetMap demo stays for generated ground only, as a real world has its own map controls, and the start screen gained the map picker under the wizard's welcome.

## Better placement advice

Alex said the wizard's placement advice did not work well, and measuring agreed. It scored spots mostly on ground height, so on three test terrains interceptors and missiles were pushed about 2.4 km out to the build limit, three systems shared one ridge, and one approach had no sensor cover. It also ignored the zone the player had drawn.

It now tries spots across the build zone and asks the simulation's own detection and line-of-sight checks what each would see or reach in the zone. It judges the two weakest drone types, low flyers first when equally covered, and says why it chose the spot. A camera is valued where another sensor can cue it. On the same terrains, long-reach weapons stay within about 1.5 km and nothing bunches. The honest result is that a medium radar sees only about 9% of the build area against a low FO Strike, which the old advice never showed.

A real browser found one more problem no test could: the suggested ring landed behind the wizard's popup, so the camera now slides it into clear view.

## Map switcher and topography

The map choice then moved out of the crowded control panel into a switcher beside the minimap, with previews drawn from the pack. A topographic map and contours came from the height grid already in every world, so they needed no new data. Marching squares runs over a lightly smoothed copy, as raw lidar makes contours fizz. Two faults turned up on the way: a stale paint could draw over a newer choice of map, and a failed live map could undo a later choice. Location now falls back to a Wi-Fi estimate if high accuracy times out, and a position outside the world offers a map of that place instead of stopping there.

## Real systems in the toolbar

Stage A2 delivered sizes when the user had asked for types: S, M and L are abstractions, and what they wanted was to choose a real radar and set it up before placing it. Clicking a toolbar row now opens a list of the real systems of that kind, with the settings the next one will be placed with. New catalogue entries left the reference digests alone, because each system's name is only carried once it is placed.

The lesson is about reading the request. It had been said more than once, and each time it was answered with a plan stage instead.

## Numbers at the end of Phase 8

| | Before | After |
|---|---|---|
| Automated tests | 0 | 509 |
| Largest source file | 1,469 lines | 246 lines |
| Commands to run | 1 | 1, after a one-time build |

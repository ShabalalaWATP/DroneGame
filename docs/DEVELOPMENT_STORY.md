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

Alex then asked for Leaflet-style light and dark maps, and reported that location timed out on a weak connection. Leaflet itself draws flat tiles in the page and cannot wrap a map over 3D ground, so it was not used. The light and dark maps are the pack's OS map recoloured, which works offline and needs no new provider. Live tiles now appear as they arrive. Location asks for a rough and a precise reading together, and uses whichever comes first.

Alex confirmed the project is non-commercial, which allowed EOxCloudless for satellite and hybrid styles across Britain on the start map. It needs no key. It is 10 m per pixel, the same as the packs, so it adds coverage rather than sharpness.

Alex then found that a sensor could not stand in a gap between houses. Placement read the 20 m grid, where any cell with enough building in it counts as solid, so about 57% of marked spots on both real maps were not on a building at all. Placement on real maps now reads the true outlines. Line of sight still reads the grid, as changing it would change how every real-map run plays.

## Magazines

Alex asked for magazine depth, with each system showing its count, rounds fired, storage, reload time, cost per missile and range when clicked. Asked what the $15M should become, they chose to keep paying per shot as well, so a launcher can now run out of money or rounds. That made the change smaller than the plan: prices and saved runs stay as they were. Storage and reload had been left out of the plan, and they became the core of it.

A radar has no rounds, so sensors show scans, detections and scan period in the same rows, and jammers show time spent jamming. The reference digests were re-baselined, because reloading changes runs: a Mixed laydown now leaks a drone it used to stop.

The balance tool shows the rule matters and is not yet balanced. The Mixed laydown now falls at wave 7, not 12 or 13, with about $9.6M unspent, because nothing refills storage. One of everything with 3 lasers went the other way, from about wave 12 to about wave 25, because missiles that run out stop draining the budget.

Resupply followed, which raised a question the plan had not faced: if firing costs money and rounds cost money, a bought round would be charged twice. Bought rounds are now marked as paid. Alex also pointed out that the range rings had gone. They had not: "Show ranges" was on and the rings were being drawn, but at 35% opacity and a pixel wide they vanished against the bright OS map, which arrived after they were tuned on dark ground. Real maps now draw them wider, stronger and darker. Alex's own comparison with the original game is what exposed this, because no test looks at contrast. The "New laydown" button did what they wanted but its name hid it, so it became "Clear map".

The first tests passed for the wrong reason. Starting wave 1 rebuilds every system, so they were changing units that no longer existed; a failing hand-over test exposed it, and they now act after the rebuild.

## A tidier SAPIENT panel

Alex called the SAPIENT panel a hot mess: ten tabs in one list wrapped over two rows, and it opened on the raw message log. The tabs now sit on one row under five small headings (Live, Comms, Plan and cost, Records, Reference), so all of them stay one click away and nothing has to be expanded first. A two-level menu was the other option, but it would have hidden tab names behind a guess. The panel now opens on Nodes, which says what each system is doing. Tab ids did not change, so the wizard and tests still reach them.

The map buttons and map credit drew over the panel, and at 800x600 it ran 14 px off the left of the window. Both are fixed. Inside the tabs, the empty JSON box no longer takes half the Messages tab, the filter chips fit on one row, and the Network diagram closes up its rows so a system can no longer fall below the canvas where it could not be clicked.

## More sizes and acoustic sensors

Alex asked for other sizes of laser, missile and interceptor, and for acoustic sensors in three sizes, using real kit with public figures. Each new entry names a real system, and its `ref` separates what is published from what is assumed. The sourcing paid for checking: the article first cited for one acoustic station's range and price turned out to hold neither, so it was replaced by the one that did.

Real prices do not always rise with size. A long-range acoustic station is reported at about $500, cheaper than a medium array, and the LOCUST laser at about $8 million, four times the $2 million figure for the larger DragonFire. The figures were kept rather than bent to fit, and the test that demanded rising prices now covers only the older kinds. Launcher prices and most magazine figures remain placeholders, and each one says so.

Acoustic sensors added a real rule, not just a row: they need no line of sight and hear drones that make no radio signal, but hills and built-up ground cut their reach. Those loss factors and each drone's loudness are assumptions.

Models now scale with size and are 40% smaller overall. The scale also sets where a shot leaves the launcher, so the reference digests were re-recorded. The eighth toolbar row pushed Sell out of sight on a normal screen, which only a browser check showed, so Sell is now pinned to the bottom of the toolbar.

## Threats by name, and real ones

The wizard recommended whichever system was the medium size, whatever it faced. It now reasons from the threat: the faster a drone flies, the further out it must be seen, so it picks the cheapest system of a kind that gives a minute's warning of the most threats (twenty seconds for a weapon). The player can plan against every type or one drone. A small fixed-wing spotter gets a small radar, and a low fibre-optic drone calls for the large one, because clutter caps a radar's reach against low flyers.

Abbreviations such as FO and FW went from the screen, including the tags over drones. The alert text carries the names, so three reference digests were re-recorded, and every other figure in them stayed the same.

Real drones are data on top of the four types, not new rules: each one starts from its type and overrides what is public. So interceptors, the wizard and the debrief treat a Geran-2 as a fixed-wing strike drone, and the waves are untouched. Research found less than hoped in places. No named Chinese military fibre-optic drone has published figures, so the entry is a commercial one and says so, and no source gives a munition mass for most commercial drones, so those are labelled assumptions.

## Real ranges, UK systems and range from where you stand

Every sensor and effector was checked against datasheets where they could be read. The IRIS sheet gives real test figures by drone weight, so its 2 km became 3.1 km. The A400 sheet gives a range for each radar cross-section, and its table follows exactly the fourth-root law the game already used, which is a useful independent check. Eight UK systems were added, in their own file so that the catalogue stays under the line limit.

The first pass at RF ranges was wrong. The AARTOS was cut to 5.6 km by taking the same fraction that Dedrone publishes between its ideal and normal figures. The user questioned it, and a link budget showed 14 km was believable: the "normal" figures already include real-world losses, and the game applies those itself from terrain and trees, so discounting them counted them twice. That led to the bigger change. A catalogue range now means an open field, and one path model (ITU-R P.526 Bullington, Weissberger for trees, the earth's curve) gives what a spot really gets. Detection, jamming, the rings and the path profile all call the same code, so the prediction cannot disagree with play. Sionna and other ray tracers were considered and left out: see ADR 0003.

The old rule that hid RF behind a hill entirely, and only slightly weakened it in forest, was backwards. Measured foliage loss is far higher than the old figure, and signals do bend over hills. Reference runs moved by a few kills, and how long each laydown survives barely changed.

An audit of the tracker, measured rather than read: one or two RF detectors alone never confirm a track, which is a deliberate rule because two bearings always cross somewhere. Three do, with about 160 m mean error at a 3 degree bearing error, and 2.9 km at 30 degrees. A fourth adds little.

## Drawing the area to defend without the wizard

Alex pointed out there was no way to draw the area to defend on the map outside the wizard. The tool already existed, but only the wizard's zone step could switch it on. A new button beside the minimap now opens a small panel to draw, undo, close and clear the area, and shows how much of it the sensors can see for each drone type, using the wizard's own scoring. It is still a planning aid that stays out of the simulation, so drones attack the same way whatever is drawn.

## Drones attack the drawn area

The drawn area had been a planning aid, and Alex asked for drones to attack it instead. A closed outline now goes into the simulation as a logged command and saves in the laydown. Each strike drone aims for a random spot inside it, spotters circle its centre, and the fusion node measures threats from that centre, so it engages whatever is closest to the area. FPV and FO strikes can still turn on a loud emitter.

It locks when the first wave starts, like the laydown. Drawing is limited to 5 km from the station, because drones appear at 6 km and need room to fly in. Runs with no area draw no extra random numbers, so the recorded reference digests did not change. Systems can still only be built within 2.5 km of the station, so a far area is deliberately hard to defend.

## Rounds that can miss, and error that grows with range

Until now a guided round always arrived, and a laser did the same damage at any range. Each weapon now has a hit chance, lowered by evasion, by how fast the target is against the round, by range and by the quality of the track when it was fired. That last one is what ties sensor accuracy to results for the first time. Where there is evidence the figure is worked back from it: with the other effects, the Sting's claimed 80 to 90% comes to about 66% against an FPV, close to the 68% average President Zelenskyy gave, and the P1-SUN's $3,000 a kill at $1,000 a drone comes to about 1 in 3. Most others have no published rate, and say so.

A beam stays at full strength to a quarter of its range and then falls with distance, so dwell doubles when range doubles, as ST Engineering publishes for its CDLE laser. Sensor error follows the monopulse relationship, where error goes with 1 / sqrt(SNR), so it stays near the quoted figure close in and is about 2.2 times larger at the limit of reach. Hills and trees shorten the reach and so worsen it too.

Measuring the first version showed a problem the code did not show. The Mixed laydown fell from wave 11 to wave 7, and leaks were all fixed-wing drones. Its one missile launcher was firing, then sitting idle for a 40 s flight while others got through. It was a fire control flaw that perfect rounds had hidden. Launchers now shoot, look and shoot while there is time, salvo when there is not, and move to the next target while their rounds fly. Mixed then reached wave 9 or 10, spending far more of its budget.

## Any mix of drones in the waves

Another session had already added 21 real drones, but only to the sandbox and the planning tools. This one added three it had left out, the Geran-3 jet, the ASN-301 anti-radar drone and the Wing Loong II, and let the waves send any ticked mix. Each wave keeps its size and timing, and each type's place is taken in turn by the ticked drones of that type, so the default mix builds exactly the waves it did before and the reference digests did not move.

Measuring each country's drones against the Mixed laydown showed how much a game rule now matters. Generic waves last to wave 9 or 10, Russia's to 6 to 8, China's to 2 to 4 and Iran's to wave 2. Iran's drones are all fixed-wing, and interceptor drones are barred from fixed-wing targets, so one missile launcher faces them alone. That rule was always unrealistic, since a Sting is built to hit Shaheds, and it is now the main question for balance.

Alex chose to lift it for the Sting and the P1-SUN, leaving the small net carrier limited to small, slow drones. Hit chance already falls as the target gets faster, so a Shahed is a fair shot and a jet a hard one. Against Mixed, Iran's waves then lasted to wave 11 or 12 instead of 2, China's to 4 or 5 and Russia's to 8 or 9. The generic game got easier too: Mixed held to wave 15 to 17 instead of 9 or 10, and eight interceptors with three compact radars to 14 to 16 instead of 4. Generic waves may want strengthening to match.

## Numbers at the end of Phase 8

| | Before | After |
|---|---|---|
| Automated tests | 0 | 509 |
| Largest source file | 1,469 lines | 246 lines |
| Commands to run | 1 | 1, after a one-time build |

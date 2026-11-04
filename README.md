# Site Guard

A counter-drone defence game and command-and-control simulator. You place and network sensors and weapons around a power station on a fixed $15M budget, then watch a fusion node detect, track and engage inbound drones using SAPIENT (BSI Flex 335 v2.0) messages. The heart of it is the gap between where drones really are and where your system believes they are.

## Run it

You need [Node.js](https://nodejs.org) 22.12 or later and [uv](https://docs.astral.sh/uv/). uv installs a suitable Python by itself. Run these from the project folder:

```bash
npm --prefix frontend ci
```

```bash
npm --prefix frontend run build
```

```bash
uv --directory backend run --no-dev python -m app
```

Then open <http://localhost:8200>. The first two commands are only needed once, or again after changing the frontend.

It runs entirely on your machine, works offline, and is only reachable from this computer.

## Playing

Press **Deploy**, pick a system from the left (or press 1 to 8), and click the ground to place it. Open **SAPIENT > Network > Auto-wire** to connect everything, then press **Start wave**. The laydown locks once the first wave starts, and the **Sandbox** lets you try attacks first without risk.

| Keys | |
|---|---|
| 1 to 8, X, Esc | Choose a system, sell, cancel |
| Space | Pause, or play and pause a replay |
| Left, Right | Step back and forward through the timeline |
| R, T, L | Ranges, truth overlay, labels |

The same scenario seed, terrain seed and laydown give the same run. Time between later waves is part of what you did, so it changes the run's noise but not the attack.

## Saved data

Laydowns, run history and figure sets are in `backend/data/siteguard.db`, a single SQLite file that git ignores. To back it up or move it, copy that file while the game is closed. Set `SITE_GUARD_DB` to keep it somewhere else.

The game still plays if the save server is not running. Panels say so, and a finished run is kept in the browser and saved when the server returns.

## Developing

Run these in two terminals. The game is at <http://localhost:5199>, reloads as you edit, and sends saves through to the backend:

```bash
uv --directory backend run --no-dev python -m app
```

```bash
npm --prefix frontend run dev
```

| Task | Command |
|---|---|
| Frontend tests | `npm --prefix frontend test` |
| Frontend coverage | `npm --prefix frontend run coverage` |
| Backend tests and coverage | `uv --directory backend run pytest` |
| How far each laydown gets | `npm --prefix frontend run balance` |

### How it fits together

```text
frontend/src/
  sim/      The rules. No DOM, no rendering, so a full game runs in Node.
  render/   Three.js. Reads simulation state each frame, and never changes it.
  ui/       React panels, refreshed about 10 times a second.
  api/      The backend client, and keeping runs safe when it is down.
  game.js   Wires the simulation to the view and runs the frame loop.
backend/app/
  routes/   HTTP only.
  services/ The rules for saved records, behind small Protocols.
  db/       All the SQL, and numbered migrations.
  schemas.py   What the API accepts: the trust boundary.
  security.py  What protects a local service with no sign-in.
```

Everything that changes the game goes through `sim.commands`, which logs it by simulation step, so a saved run can be reproduced exactly.

### Changing behaviour on purpose

Five reference runs in `frontend/tests/support/` pin down the simulation's behaviour exactly. If a change is meant to alter results, re-record them and say why in the commit:

```bash
cd frontend
node tests/support/print-digests.js > tests/support/reference-digests.json
```

Raise `GAME_VERSION` in `frontend/src/sim/config/world.js` at the same time, so old saves warn that they may not play the same. If a saved record changes shape, also run `node tests/support/write-fixtures.js`, because both test suites check those files. A database change needs a new numbered file in `backend/app/db/migrations/`.

### More

- [Implementation plan](docs/MASTER_IMPLEMENTATION_PLAN.md)
- [Development story](docs/DEVELOPMENT_STORY.md)
- [Security notes](docs/SECURITY_NOTES.md)
- [Decision records](docs/adr/)

## Accuracy

The figures are drawn from public sources, mostly vendor claims and press reports, and many are labelled assumptions. The **Sources** tab shows the evidence and confidence for each one, and lets you change it. This is a game and a teaching tool, not a model to base real decisions on.

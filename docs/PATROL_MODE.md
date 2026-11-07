# Patrol mode: design note

Status: prototype. A first playable slice is in the code (see "What the slice does"). Everything else here is design, not yet built.

In the fixed-site game the player defends the station, or an area drawn around it. In patrol mode the player protects a group of simulated people walking a set route, with air defence vehicles moving alongside them. It is a simulation for teaching, not a planning tool. Every speed and mobile performance figure below is an assumption, and each one the slice uses is labelled `ASSUMPTION` in the Sources tab.

## How the route is set

The player clicks waypoints on the ground, as when drawing the area to defend, and closes the loop by clicking near the first point or double-clicking. The route always loops back from the last waypoint to the first.

The route is checked on the ground every 20 m along each leg. It is refused if it:

- leaves the map. Attacks start out from the patrol, as they do from a drawn area, so it needs no ring around the station to leave them room;
- crosses water;
- crosses ground steeper than the build rule allows (a slope of 0.4), the same test as for placing a system or a group of people;
- goes through a building outline.

The refusal says which, and the player redraws. A later version should snap legs to mapped paths and roads from the map pack instead of straight lines, and allow open (out and back) routes.

## Which drones hunt the patrol, and how they find it

Strike drones (FPV, FO, fixed-wing) attack the patrol in place of the station. The ones that already look for loud radio emitters still do, so an FPV can dive on the radar vehicle instead of the people. Spotters orbit the patrol, not the station, and the fusion node measures threats from the patrol.

Finding it, in the slice: every strike drone knows where the patrol is at every moment and homes on it. That is the simplest rule and the most dangerous case, as if a spotter or ISR feed passed a live fix. It is labelled here as an assumption, not a claim about real capability.

Finding it, as designed: a drone homes on the last position passed to it. That fix is refreshed only while a spotter is on station with working video, and otherwise goes stale, so jamming a spotter's video makes strikes land where the patrol was. Emitter seekers would also be drawn by the escort's terminals and radar, which gives the player a real trade between seeing and being seen.

## Sensors and weapons on the move

Sensors work on the move in the slice. The sensor vehicle's radar scans from wherever it is, with no penalty. The network reads each node's live position, so detections, bearings and status reports carry where the node really is. Starlink sky checks re-run as a node moves (they are cached on position), and cellular picks the best tower from wherever the node is.

Weapons fire from the halt. While the weapon vehicle has an engagement task, the whole patrol stops, and it walks on once the task ends. That stands for a crew that must stop, lay the launcher and fire, and it keeps the escort together.

As designed, each mobile system would get two figures: whether it can sense on the move, and a penalty if it does (a radar's error grows and its range shrinks while bouncing over rough ground). A camera would need to stop to sweep. A jammer would work on the move, but with a mast that must be lowered to drive.

## Which assets can be mobile, and how fast

The people on patrol are soldiers, drawn in MultiCam with helmets, body armour and rifles at true size; it changes only the drawing.

The escort is a column of 1 to 6 vehicles, chosen in the Area panel once the route is drawn: a Patria 6x6, a Toyota Hilux or a Mule UGV in the Milrem THeMIS class, each carrying one system it can take (a Mule light ones, a Hilux medium ones too, a Patria anything that rides) at a gap ahead of or behind the soldiers. A new patrol gets a Blighter A800 on a Hilux 40 m ahead and a Thales Rapid Ranger on a Patria 40 m behind. Every vehicle moves at the group's walking pace, keeping its gap along the route, and a sensor on one stands on the vehicle's short mast (2 to 3.5 m, an assumption).

| Figure | Value | Basis |
| --- | --- | --- |
| Walking speed of the patrol | 1.4 m/s | assumption |
| Gap from the people to each escort vehicle, along the route | 40 m | assumption |
| People in the patrol | 12 | assumption |

These are in the Sources tab under "Patrol" and can be edited, which is logged like any other figure change.

As designed, a mobile flag and a road speed would be added to each system that is vehicle-mounted in real life, all labelled assumptions: small radars, RF detectors and jammers, cameras on masts, and short-range missiles and guns on vehicles. Large radars, large lasers and the Sky Sabre class would stay fixed, or redeploy only between waves.

## Choosing and saving a mobile laydown

The player draws the route, and the default column is added; they can then change each vehicle, what it carries and its gap, or add and remove vehicles. Each system is paid from the budget like any other (the vehicles themselves are not priced), and each gets a Starlink terminal (the fusion node gets one too if it has none). Escorts cannot be sold on their own: clearing or redrawing the patrol removes them and refunds them in full, as nothing has happened yet. The patrol locks when the first wave starts, like the rest of the laydown, and a patrol and a drawn area cannot both be set.

A saved laydown carries the patrol as its route, `patrol: [[x, z], ...]`, and its column, `patrolColumn: [{ vehicle, system, gap }, ...]`, beside the systems. The escort and its people are rebuilt from these and the figures when the laydown is restored, so they are not in the saved structures or people lists; a laydown saved before the column existed gets the default one. With a deployment pack deployed that lists vehicles, the column takes only the pack's vehicles, each as many times as the pack has, less any parked on the map; a system parked on a vehicle outside a patrol is saved with the structures, with a `vehicle` field. The backend accepts the route with the same limits as the area to defend (2 to 32 points).

As designed, the player would pick which systems ride with the patrol and where each sits in the column (ahead, behind, on a flank), from the mobile systems above. A mix of fixed systems near the route and mobile ones in the column should be allowed, since that is how a real route would be covered.

## Winning and losing

In the slice the patrol has the same integrity as the site, and each strike that reaches it costs the same. A run is lost when integrity reaches zero, and a strike on the patrol can also cause casualties among its people, counted as for any other group. Waves run as in the fixed-site game.

As designed, a run would be won by walking a set number of laps, and lost when casualties pass a chosen share of the group or the patrol cannot move (both escorts destroyed). The debrief would report casualties, laps and time halted.

## Determinism, replay and digests

- Nothing in the patrol draws a random number. It moves a set distance each simulation step, so the same seed and laydown give the same run.
- Setting the patrol is a logged command, `setPatrol`, so a run's command log reproduces it.
- A run with no patrol runs no patrol code and draws nothing extra, so the fixed-site reference digests do not change. The tests check this.
- A run with a patrol adds the distance walked to its digest, and its people's casualties are already in it.
- Replay: snapshots already record each system's health and task. The slice does not record where the escort was, so replaying a patrol run draws the escort where it is now. Recording escort positions in each snapshot is the next step for replay.

## What the slice does

- Draw a looped route from the Area to defend panel ("Draw a patrol route"). It is checked on the ground as above.
- A group of 12 simulated people walks the route at 1.4 m/s once the first wave starts, with the radar 40 m ahead and the Rapid Ranger 40 m behind, both moving with them.
- Strike drones home on the patrol and spotters orbit it. Emitter seekers can still pick the radar.
- The patrol halts while the Rapid Ranger is engaging.
- A strike on the patrol damages its integrity and can cause casualties. It lands on the patrol's spot, as a strike on a system lands on the system, because a strike counts from 30 m and a small drone's casualty radius is 25 m.
- The route saves in the laydown and is restored with its escort.

## Left out of the slice

- Spotter-cued targeting with a stale fix: drones know where the patrol is at all times.
- Choosing the escort systems, their places in the column and their road speeds.
- Penalties for sensing on the move, and stopping to sweep.
- Open routes, and routes along mapped roads.
- Win by laps, and loss by casualties or by losing both escorts.
- Escort positions in replay snapshots.
- A hotkey and a toolbar button for the patrol: it is in the Area to defend panel only.
- Moving range rings are re-predicted only every 100 m of travel.
- The end-of-run card still says the site was lost, not the patrol.

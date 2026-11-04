# Site Guard: real-world mapping plan

Status: proposed 2026-11-04, not approved or started. It follows `MASTER_IMPLEMENTATION_PLAN.md` and depends on its phases where noted.

## Goal

Let a player choose between the current procedural world and a real part of Great Britain, with:

- real elevation that drives line of sight, not just the picture
- British National Grid (BNG) references and a grid overlay
- the protected site and the effectors placed on the real map
- the whole thing working offline, with extra options when online

## The design in five decisions

| # | Decision | Why |
|---|---|---|
| 1 | **Keep Three.js as the only renderer.** Real terrain is the existing mesh with a map draped on it. | Drones, rings, beliefs, labels and placement all work in scene metres and raycast against one mesh. MapLibre or Cesium would mean two renderers, a Web Mercator or globe frame, and a rewrite of those views. |
| 2 | **The simulation only ever reads a local grid, from an "area pack".** Online and offline use the same pack format. | `sim/` already touches terrain through a small surface (`groundAt`, `los`, `coverAt`, `canopyAt`, `bldgAt`, `slope`, plus the grids). If the pack produces that surface, the rules do not change. |
| 3 | **Online only changes the picture and how packs are obtained, never the rules.** | A run's digest depends on the grids alone, so the same laydown gives the same result with or without a connection. |
| 4 | **The scene is aligned to BNG.** `x = E - E0`, `z = -(N - N0)`, `y = height ODN - H0`, with the site at the origin. | OS EPSG:27700 tiles line up with the scene without reprojection, and grid references become simple arithmetic. |
| 5 | **Conversion to lat/long happens in the build tool.** Each pack stores a local fit around its centre. | Full OSTN15 accuracy, with no projection library in the browser. |

Rejected: **Cesium and MapLibre** (see 1), **proj4js in the browser** (see 5), **OpenStreetMap tiles offline** (the [OSMF vector tile policy](https://operations.osmfoundation.org/policies/vector/) prohibits bulk download, and OS open data covers the need).

## What "the switch" means

Procedural and real are different worlds, so a mid-game switch cannot keep the laydown valid. There are two controls:

| Control | Choices | When |
|---|---|---|
| **World** | Procedural (seed), or Real (area pack and site position) | Before deployment. Changing it clears the laydown. Uses the existing `emit('terrain')` rebuild path. |
| **Display** | 3D or plan view; base layer OS map, OS live (online), or shaded relief; grid on or off | Any time, including mid-run |

## Data sources

All are open data. Licence and access were checked on 2026-11-04 except where marked.

| Need | Source | Notes |
|---|---|---|
| Elevation, all of GB | [OS Terrain 50](https://docs.os.uk/os-downloads/products/land-and-terrain-portfolio/os-terrain-50/os-terrain-50-overview) | 50 m posts, 4 m RMSE, 162 MB. Bare earth: no trees or buildings. |
| Elevation, trees and building heights, England | [EA LIDAR Composite DTM 1 m](https://environment.data.gov.uk/dataset/13787b9a-26a4-4775-8523-806d13af58fc) and first-return DSM | OGL, about 99% of England. DSM minus DTM gives real canopy and building heights. **Unconfirmed:** the DSM licence and a good bulk route for the DTM (WMS and ImageServer are listed, a WCS was only seen for the DSM). Wales and Scotland lidar were not checked. |
| Buildings, water, power lines | [OS OpenMap Local](https://docs.os.uk/os-downloads/products/maps-and-imagery-portfolio/os-openmap-local) GeoPackage | 3.5 GB for GB. Spec lists these feature types. **Unconfirmed:** a woodland layer here (it is confirmed in Zoomstack, which is the fallback). |
| Offline map picture | OS VectorMap District or OpenMap Local GeoTIFF | 5.4 GB and 15.4 GB for GB. Already in BNG, so no rendering step. **Unconfirmed:** pixel size, which decides which one. |
| Online map picture | [OS Maps API](https://docs.os.uk/os-apis/accessing-os-apis/os-maps-api/layers-and-styles), `Light_27700`, `Outdoor_27700`, `Road_27700` | Open data to zoom 9 (1.75 m per pixel). Zoom 10 to 13 is Premium. |
| Choosing a GB area | OS MiniScale or GB Overview Maps | One small bundled image. |

**Licence rule:** Packs are built only from downloaded open data. API tiles are never stored in a pack. [OS terms](https://osdatahub.os.uk/legal/apiTermsConditions) limit Premium API data to a temporary cache of up to 24 hours (seen in a search summary; the page itself would not load). I found no clear statement for OpenData API tiles, so this plan does not rely on storing them.

**Not modelled from real data:** mobile masts. No OS open product lists them, and OSM would bring ODbL share-alike questions. Keep the current high-ground picker (`terrain.js:176`) and label those masts as notional.

## Area packs

An area pack is one `.sgmap` file covering a square of GB, by default 30 x 30 km. The site can go anywhere that leaves a full 14 km world around it, so moving the site needs no rebuild and works offline.

```text
JSON header   version, area bounds in BNG, cell size, H0 datum, lat/long fit, geoid separation,
              data tier (terrain50 or lidar), source and attribution list, build date, grids SHA-256
Grids         ground Float32, canopy Uint8, bldg Uint8, cover Uint8, gzipped, 20 m cell
Features      buildings, power lines
Basemap       896 m square image tiles at 3.5 m per pixel, separate from the grids hash
```

Rough size: 16 MB of raw grids, and an estimated 50 to 100 MB in total. M0 replaces this estimate with a measured figure.

**Keep the 20 m cell.** The `los` cost and all tuning stay the same. When aggregating 1 m lidar: ground is the cell mean, canopy and buildings are a high percentile of DSM minus DTM, inside the woodland and building footprints. This errs towards blocking sight, because a low percentile would hide real obstacles.

**The Terrain 50 tier has no height data for obstacles,** so canopy uses `TERRAIN.canopyMin` to `canopyMax` and buildings use an assumed height. The pack records its tier, and the UI shows it, so nobody reads a 50 m model as survey-grade.

**World identity:** `{ pack: gridsHash, e0, n0, siteMode }`. It goes through `deploy`, into the command log, saved laydowns and run specs. A laydown can then never be loaded onto the wrong ground.

## Coordinates

| Topic | Approach |
|---|---|
| Grid references | New `sim/bng.js`: E/N to and from `SU 12345 67890` at 6, 8 and 10 figures, with validation. About 60 lines, no dependency. |
| Site position | Snaps to a 20 m post, so cutting a world is an array copy with no resampling |
| Heights | `H0` is the ground at the site, so `groundAt(0,0) = 0` and `SITE_POS` stays valid. Display uses `y + H0` as metres ODN. |
| SAPIENT lat/long | Replace the flat-earth maths in `location()` (`sapient.js:50`) with the pack's fit. Nothing reads these locations back into the rules, so only output changes. Procedural worlds keep today's formula exactly. Without this, grid convergence (up to about 3 degrees at the GB edges) would put a position 7 km out about 370 m wrong. |
| SAPIENT height | `z` becomes ellipsoidal (`y + H0 + geoid separation`), to match `LOCATION_DATUM_WGS84_E`. Procedural worlds are unchanged. |
| SAPIENT bearings | `bearingOf` (`core.js:65`) measures from scene north, which is now grid north. Preferred fix: declare grid datum in real worlds instead of `RB_DATUM` (`core.js:9`). **Check the ICD has a grid value:** I recall `RANGE_BEARING_DATUM_GRID` but have not verified it. Otherwise, add the site's convergence on send and remove it in the tracker. |
| Earth curvature | Ignored. The bulge on a 7 km path is about 0.7 m with standard refraction, well inside the 4 m RMSE. |
| Grid scale factor | Ignored. Under 0.05% across the world. |

## Milestones

Sizes are rough estimates: S is up to 2 days, M is up to a week, L is more.

### M0: Prove the data (S)

- [ ] Build one pack by hand for an inland site and a coastal site
- [ ] Settle the unconfirmed items in the data table: lidar bulk route, DSM licence, GeoTIFF pixel size, woodland layer
- [ ] Measure pack size and texture sharpness at 4096 pixels

**Done when:** the unknowns have answers and this plan is corrected. Stop and revisit if lidar has no workable bulk route, in which case the Terrain 50 tier becomes the product.

### M1: Separate the world from its source (S)

Needs master plan Phase 3 finished, as the same files are changing in the working tree now.

- [ ] Move the queries out of `generateTerrain` (`terrain.js:189` to `:226`) into `makeWorld(grids)`, and move `rasterBox` (`terrain.js:115`) out of its closure
- [ ] Make `deploy` (`simulation.js:99`) take a world, not just a terrain seed

**Done when:** the reference digests are **byte-identical**. This is the only milestone allowed to refactor procedural code.

### M2: Pack builder and loader, no visuals (M)

- [ ] `tools/mapbuild/`: a Python CLI with `uv`, using rasterio, pyogrio and pyproj with OSTN15. It stays out of the FastAPI app's production dependencies.
- [ ] Terrain 50 and OpenMap Local tier only
- [ ] `sim/world-pack.js`: `parsePack(buffer)` validates and `cutWorld(pack, e0, n0, siteMode)` builds a world. The sim stays synchronous and DOM-free. Fetching and decompression sit outside it.
- [ ] `sim/bng.js`, the lat/long fit, and the `location()` change
- [ ] A small fixture pack in `tests/support/`, plus a reference digest for it

**Done when:** a full game plays in Node on a real pack, repeatably, and procedural digests still match.

### M3: Draw the real world (M)

- [ ] `buildWorldView` (`terrain-view.js`): apply the map as a texture and skip the height and snow colouring (`:36`) in real worlds. Use `meshStride` 2, as real ground is less forgiving than noise at 60 m.
- [ ] Set `terrainState.hillshade` from the basemap. The minimap (`minimap.js:22`) and SAPIENT plan (`sapient-ui.js:225`) then show the real map with no further change.
- [ ] A draped 1 km grid with edge labels, using the `drapedRing` approach, and the same grid on the 2D canvases
- [ ] Plan view: a top-down orthographic camera. Placement raycasting (`placement.js`) carries over.
- [ ] Cursor readout: `SU 12345 67890, 143 m ODN`
- [ ] True scale for trees, houses and pylons in real worlds (`TERRAIN.visualScale` 1). `STRUCT_SCALE` stays, because it is part of the rules.
- [ ] Attribution line on screen, taken from the pack header

**Done when:** verified in the browser on the inland and coastal packs, including frame rate compared with procedural.

### M4: Choose the world, place the site and effectors (M)

Best after master plan Phase 5, so this UI is not written twice. If this is wanted sooner, keep it in one small panel and accept porting it.

- [ ] Import a pack from a file into IndexedDB, list packs, and show a clear message on quota errors. Packs can be re-imported if the browser evicts them. Works with no backend.
- [ ] World selector beside the existing deploy controls (`panels.js:14`), with a site picker on the plan map, by click or typed grid reference
- [ ] Two site modes:
  - **Real site:** no stamping or levelling. The real buildings are the site. Build this first, as it is the smaller job.
  - **Model site:** stamps `STATION` and levels a platform only as wide as the station. Warn when the earthworks would be large.
- [ ] Effectors: the existing `placementProblem` rules (`laydown.js`), plus a typed grid reference, and grid references in labels and panels
- [ ] Laydown export as a grid reference list
- [ ] Add the world identity to the `laydowns` and `runs` schema before Phase 6 is built

**Done when:** a player with no internet imports a pack, places a site and laydown by grid reference, plays, and reloads to the same digest.

### M5: Online extras (M)

- [ ] Live OS Maps layer for the display, assembled from tiles up to zoom 9, held in memory and the normal browser cache only
- [ ] Tile proxy so the API key is never in the bundle: a Vite dev proxy first, FastAPI in Phase 6. Allowlisted styles, zoom limit, tile bounds limited to GB.
- [ ] Place search by postcode or name
- [ ] "Build this area" in the app, calling the builder through the backend. Needs Phase 6.

**Done when:** pulling the network mid-run changes nothing except the live layer, which falls back to the pack's map with a message, and the digest is unchanged.

### M6: Lidar tier and real features (M)

- [ ] England lidar in the builder: real canopy and building heights
- [ ] Draw real buildings and real power lines from the pack's features
- [ ] Sharper close-up map around the site, only if M0 or M3 shows 3.5 m per pixel is not good enough

**Done when:** a known obstacle, such as a real ridge or wood, visibly and measurably blocks a sensor at a spot checked against the OS map.

## Online and offline at a glance

| | Offline | Online |
|---|---|---|
| Terrain and rules | Area pack | The same area pack |
| Map picture | Pack | Pack or live OS Maps |
| New area | Builder, from national files already on disk | The same, plus lidar and in-app building |
| Find a place | Grid reference | Also postcode and name |
| App itself | Bundled with no CDN use. No service worker needed when served locally. | Same |

## Testing

- **Invariant:** procedural reference digests never change.
- `bng.js`: round trips and published OS worked examples. Bad input is rejected.
- `parsePack`: rejects wrong magic, wrong version, wrong lengths and oversized dimensions.
- `cutWorld`: heights are rebased, bounds are enforced, and a site too near the pack edge is refused.
- Lat/long fit: compared with pyproj OSTN15 at the corners and centre of a pack, within a set tolerance.
- Fixture pack digest: repeatable, and unaffected by which basemap is used.
- Coastal fixture: sea cells behave as water, and drones spawned over them fly normally.
- Coverage: 90% or higher on new modules, using the existing Vitest setup. Builder tested with pytest.

## Security and sensitivity

- **Real sites make the output more sensitive.** A coverage gap map and laydown for a named power station is more sensitive than the same data on invented ground. So: no bundled presets of real critical sites, laydowns stay local by default, and there is no sharing feature.
- **Online use discloses the area of interest.** Tile and search requests show OS what area is being studied. For a sensitive site, use an offline pack. The UI should say this when the live layer is turned on.
- **API key:** server side only, from an environment variable, never in the bundle or a pack.
- **Packs are untrusted input.** Validate the header and lengths before allocating, verify the hash, and never render header text as HTML.
- **Proxy and builder endpoints:** fixed upstream hosts only (no SSRF), bounds checked, size and rate limited.
- **Attribution:** OS and EA statements shown on screen. Confirm the exact wording for the current year during M3.

## Risks

| Risk | Effect | Response |
|---|---|---|
| Balance shifts on real ground | Laydowns and budgets tuned for a valley with ridges may not suit flat or urban land | Accept for now. Real worlds are compared with each other, not with procedural. |
| Real urban areas have many buildings | Draw calls and clutter | Instanced boxes as today, capped. Measured in M3. |
| 20 m cell hides small gaps and hedges | Slightly pessimistic sight lines at low level | Documented limit. The cell comes from the pack, so 10 m can be tried later, at four times the memory. Audit first for any use of `TERRAIN.cell` where `data.cell` is meant. |
| Fixed `SITE.radius` of 150 m | A real site may be much bigger or smaller | Fixed in this plan. Per-site radius is an easy follow-up. |
| Lidar age and gaps | Trees and buildings may be out of date | Pack records source and date, and the UI shows them. |
| Working tree churn | Phase 3 is uncommitted and touches the same files | M1 waits for Phase 3. |

## Left out on purpose

MGRS and non-GB maps (the design permits them, but they need another grid module and global data), aerial imagery (not open data), named CNI presets, 3D building footprints beyond boxes, live weather, Premium OS zooms, multi-pack worlds across area boundaries, and a tile streaming engine.

## Sources

OS: [Maps API layers and zooms](https://docs.os.uk/os-apis/accessing-os-apis/os-maps-api/layers-and-styles), [Terrain 50](https://docs.os.uk/os-downloads/products/land-and-terrain-portfolio/os-terrain-50/os-terrain-50-overview), [OpenMap Local](https://docs.os.uk/os-downloads/products/maps-and-imagery-portfolio/os-openmap-local), [Downloads API, used for file sizes](https://api.os.uk/downloads/v1/products), [API terms](https://osdatahub.os.uk/legal/apiTermsConditions), [OS Transform on Helmert and OSTN15](https://github.com/OrdnanceSurvey/os-transform).
Environment Agency: [LIDAR Composite DTM 1 m](https://environment.data.gov.uk/dataset/13787b9a-26a4-4775-8523-806d13af58fc).
OpenStreetMap: [vector tile usage policy](https://operations.osmfoundation.org/policies/vector/).

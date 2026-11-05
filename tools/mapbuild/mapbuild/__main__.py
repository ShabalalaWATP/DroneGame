"""Build a map pack: uv run --directory tools/mapbuild python -m mapbuild --centre "SU 22 66" --name "Savernake" --data <folder> --out <file>"""

import argparse
import os
import re
import sys
import time
from datetime import date

import numpy as np

from . import download, features, fit, packfile, pictures, terrain
from .grid import Window, parse_grid_ref

SOURCES = {
    "osmap": "Contains OS data © Crown copyright and database right",
    "lidar": "Contains Environment Agency information © Environment Agency and/or database right",
}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="mapbuild", description="Build a Site Guard map pack from open data.")
    parser.add_argument("--centre", required=True, help='the middle of the pack, as a grid reference such as "SU 22 66", or as easting,northing')
    parser.add_argument("--name", required=True, help="the name shown in the game")
    parser.add_argument("--data", required=True, help="the folder of OS downloads: terrain50, openmap_su, vmd_su and so on")
    parser.add_argument("--out", required=True, help="the .sgmap file to write")
    parser.add_argument("--size", type=int, default=30, help="the width of the pack in km (default 30)")
    parser.add_argument("--lidar-km", type=int, default=14, help="the width of the middle part to fetch lidar for, in km. 0 for none. England only.")
    parser.add_argument("--fetch", action="store_true", help="download any OS files that are missing from --data")
    parser.add_argument("--no-satellite", action="store_true", help="leave out the satellite picture")
    args = parser.parse_args(argv)
    if args.size % 2 or args.lidar_km % 2 or not 16 <= args.size <= 60 or args.lidar_km > args.size:
        parser.error("--size must be even, from 16 to 60, and --lidar-km must be even and no bigger than --size")

    began = time.time()
    say = lambda text: print(f"[{time.time() - began:5.0f}s] {text}", flush=True)
    east, north = map(int, args.centre.split(",")) if re.fullmatch(r"\d{1,6},\d{1,7}", args.centre) else parse_grid_ref(args.centre)
    window = Window(east // 1000 * 1000, north // 1000 * 1000, args.size * 500)
    position = fit.geo_fit(window)  # first, so a refusal does not waste an hour of downloads
    if args.fetch:
        download.ensure(args.data, window.squares(), say)

    t50, no_tile = terrain.terrain50(args.data, window)
    say(f"Terrain 50: {window.side} x {window.side} posts, {t50.min():.1f} to {t50.max():.1f} m, {no_tile.mean():.1%} with no tile")
    source = features.OpenMap(args.data, window)
    wood, _ = source.read("Woodland")
    houses, _ = source.read("Building")
    power, _ = source.read("ElectricityTransmissionLine")
    surface, _ = source.read("SurfaceWater_Area")
    tidal, _ = source.read("TidalWater")
    roads, road_fields = source.read("Road", ["CLASSIFICA"])
    names, name_fields = source.read("NamedPlace", ["DISTNAME", "CLASSIFICA", "FONTHEIGHT"])
    say(f"OpenMap Local: {len(houses)} buildings, {len(wood)} woods, {len(roads)} roads, {len(names)} names")

    cover = features.cover_grid(window, wood, houses, power, np.concatenate([surface, tidal]), no_tile)
    lidar_grids = terrain.lidar(window, args.lidar_km * 500, houses, say) if args.lidar_km else None
    ground, canopy, bldg, cover = terrain.combine(window, t50, lidar_grids, cover, cover == 1, cover == 2)
    grids = packfile.Grids(ground, canopy, bldg, cover)
    packfile.check(grids)

    feature_lists = features.feature_lists(window, houses, power, roads, road_fields, names, name_fields, bldg)
    os_pictures = pictures.os_map(args.data, window, say)
    this_year = date.today().year
    sat_pictures, sat_year = ([], None) if args.no_satellite else pictures.satellite(window, [this_year - 1, this_year - 2], say)

    credits = {"osmap": f"{SOURCES['osmap']} {this_year}"}
    if args.lidar_km:
        credits["lidar"] = f"{SOURCES['lidar']} {this_year}"
    if sat_year:
        credits["satellite"] = f"Contains modified Copernicus Sentinel data {sat_year}"
    header = {
        "name": args.name[:80], "east": window.east, "north": window.north, "half": window.half, "cell": 20, "N": window.side,
        "tier": "lidar" if args.lidar_km else "terrain50", "lidarHalf": args.lidar_km * 500, "built": date.today().isoformat(), "credits": credits,
        **position,
    }
    written = packfile.write_pack(args.out, header, grids, feature_lists, os_pictures + sat_pictures)
    say(f"wrote {args.out}: {os.path.getsize(args.out) / 1e6:.1f} MB, hash {written['gridsSha256'][:16]}, fit error {written['fitErrorM']} m")
    return 0


if __name__ == "__main__":
    sys.exit(main())

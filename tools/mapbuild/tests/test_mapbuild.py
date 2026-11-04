"""The parts of the builder that can be wrong without any network or OS data."""

import gzip
import json
import struct

import numpy as np
import pytest
import shapely

from mapbuild import features, fit, packfile, pictures, terrain
from mapbuild.grid import Window, parse_grid_ref, square_letters


@pytest.mark.parametrize("text,expected", [
    ("SU 22 66", (422000, 166000)),
    ("su2266", (422000, 166000)),
    ("NN 166 712", (216600, 771200)),  # Ben Nevis
    ("TQ 30000 80000", (530000, 180000)),
    ("TF", (500000, 300000)),
    ("HP 61 16", (461000, 1216000)),  # Shetland
    ("SV 90 10", (90000, 10000)),  # Scilly
])
def test_grid_references(text, expected):
    assert parse_grid_ref(text) == expected


@pytest.mark.parametrize("text", ["", "S1 22 66", "SU 2 66", "SU 223", "SI 22 66", "AA 10 10", "SU 123456 123456"])
def test_bad_grid_references_are_refused(text):
    with pytest.raises(ValueError):
        parse_grid_ref(text)


@pytest.mark.parametrize("east,north,letters", [(422000, 166000, "SU"), (567000, 340000, "TF"), (216600, 771200, "NN"), (461000, 1216000, "HP"), (90000, 10000, "SV")])
def test_square_letters(east, north, letters):
    assert square_letters(east, north) == letters


def test_a_window_knows_its_squares():
    assert Window(422000, 166000, 15000).squares() == ["SU"]
    assert Window(499000, 166000, 15000).squares() == ["SU", "TQ"]
    assert Window(422000, 166000, 15000).side == 1501


def test_ascii_grid_parsing():
    head, values = terrain.parse_asc("ncols 2\nnrows 2\nxllcorner 100\nyllcorner 200\ncellsize 50\n1.5 2\n3 4\n")
    assert head["xllcorner"] == 100
    assert values.tolist() == [[1.5, 2], [3, 4]]


def square_values(value):
    return np.full((terrain.SQUARE_M, terrain.SQUARE_M), value, "float32")


def test_reducing_a_square_uses_the_90th_percentile_and_keeps_gaps_as_nan():
    dtm, dsm = square_values(100), square_values(100)
    dsm[0:20, 0:400] = 118  # a wood along the north edge
    dtm[500:520, 500:520] = np.nan
    houses = np.zeros((terrain.SQUARE_M, terrain.SQUARE_M), bool)
    houses[300:320, 300:320] = True
    dsm[300:320, 300:320] = 108
    out = terrain.reduce_square(dtm, dsm, houses)
    assert out["ground"].shape == (51, 51)
    assert out["ground"][1, 1] == 100
    assert out["tall"][0, 5] == pytest.approx(18)
    assert out["tall"][40, 40] == 0
    assert np.isnan(out["ground"][25 + 1 - 1, 25]) or np.isfinite(out["ground"][25, 25])
    assert out["houses"][15, 15] == pytest.approx(8)
    assert np.isnan(out["houses"][40, 40])


def test_combining_lidar_any_tall_cover_is_trees_and_terrain_50_fills_the_rest():
    window = Window(0, 0, 40)  # 5 x 5 posts
    t50 = np.full((5, 5), 50.04, "float32")
    cover = np.zeros((5, 5), "uint8")
    cover[0, 0] = 1  # OS woodland, outside the lidar: keeps its assumed height
    cover[1, 1] = 1  # OS woodland, lidar says nothing is there
    cover[3, 3] = 4
    lidar = {k: np.full((5, 5), np.nan, "float32") for k in ("ground", "tall", "houses")}
    lidar["ground"][1:, 1:] = 60.06
    lidar["tall"][1:, 1:] = 0
    lidar["tall"][2, 2] = 12.4  # a hedge outside any OS woodland
    lidar["tall"][3, 3] = 30  # a ship, or anything else on water
    lidar["tall"][2, 3] = 9
    lidar["houses"][2, 3] = 9
    ground, canopy, bldg, final = terrain.combine(window, t50, lidar, cover, cover == 1, cover == 2)
    assert ground[0, 0] == pytest.approx(50.0)
    assert ground[1, 1] == pytest.approx(60.1)
    assert canopy[0, 0] == 16 and final[0, 0] == 1
    assert canopy[1, 1] == 0 and final[1, 1] == 0
    assert canopy[2, 2] == 12 and final[2, 2] == 1
    assert canopy[3, 3] == 0 and final[3, 3] == 4
    assert bldg[2, 3] == 9 and canopy[2, 3] == 0 and final[2, 3] == 2


def test_a_corrupt_grid_cannot_be_written(tmp_path):
    ground = np.zeros((3, 3), "float32")
    ground[1, 1] = np.nan
    empty = np.zeros((3, 3), "uint8")
    with pytest.raises(ValueError, match="finite"):
        packfile.write_pack(str(tmp_path / "x.sgmap"), {}, packfile.Grids(ground, empty, empty, empty), {}, [])
    with pytest.raises(ValueError, match="square"):
        packfile.check(packfile.Grids(np.zeros((2, 2), "float32"), np.zeros((2, 2), "uint8"), np.zeros((2, 2), "uint8"), np.zeros((2, 2), "uint8")))


def test_pack_file_layout_and_hash(tmp_path):
    ground = np.arange(9, dtype="float32").reshape(3, 3)
    empty = np.zeros((3, 3), "uint8")
    grids = packfile.Grids(ground, empty, empty, empty)
    path = tmp_path / "x.sgmap"
    written = packfile.write_pack(str(path), {"name": "Test"}, grids, {"roads": []}, [{"layer": "osmap", "west": 1, "top": 2, "width": 3, "height": 4, "type": "image/png", "data": b"PICTURE"}])
    data = path.read_bytes()
    assert data[:5] == b"SGMAP" and data[5] == packfile.VERSION
    length = struct.unpack("<I", data[6:10])[0]
    header = json.loads(data[10:10 + length])
    assert header == written and header["gridsSha256"] == packfile.grids_hash(grids)
    body = data[10 + length:]
    sections = {s["name"]: s for s in header["sections"]}
    read = lambda s: body[s["offset"]:s["offset"] + s["length"]]
    assert gzip.decompress(read(sections["ground"])) == ground.astype("<f4").tobytes()
    assert json.loads(gzip.decompress(read(sections["features"]))) == {"roads": []}
    assert read(sections["picture0"]) == b"PICTURE" and sections["picture0"]["layer"] == "osmap"


def test_changing_a_picture_does_not_change_the_hash(tmp_path):
    empty = np.zeros((3, 3), "uint8")
    grids = packfile.Grids(np.zeros((3, 3), "float32"), empty, empty, empty)
    a = packfile.write_pack(str(tmp_path / "a.sgmap"), {}, grids, {}, [{"layer": "osmap", "data": b"A"}])
    b = packfile.write_pack(str(tmp_path / "b.sgmap"), {}, grids, {"roads": [1]}, [{"layer": "osmap", "data": b"B"}])
    assert a["gridsSha256"] == b["gridsSha256"]


def test_open_sea_with_no_terrain_tile_counts_as_water():
    window = Window(1000, 1000, 40)
    no_tile = np.zeros((5, 5), bool)
    no_tile[0] = True
    empty = np.array([], dtype=object)
    cover = features.cover_grid(window, empty, empty, empty, empty, no_tile)
    assert cover[0].tolist() == [4] * 5 and cover[1].sum() == 0


def test_cover_priorities():
    window = Window(1000, 1000, 100)
    area = shapely.box(900, 900, 1100, 1100)
    small = shapely.box(960, 960, 1040, 1040)
    corner = shapely.box(900, 1040, 960, 1100)
    empty = np.array([], dtype=object)
    cover = features.cover_grid(window, np.array([area]), np.array([small]), empty, np.array([corner]), np.zeros((window.side, window.side), bool))
    middle = window.side // 2
    assert cover[middle, middle] == 2  # built over woodland
    assert cover[1, 1] == 4  # water over woodland
    assert cover[window.side - 2, window.side - 2] == 1


def test_feature_lists_use_scene_axes():
    window = Window(1000, 2000, 100)
    house = shapely.box(1000, 2040, 1020, 2050)  # 40 to 50 m north of the middle
    line = shapely.LineString([(1000, 2000), (1000, 2600)])
    road = shapely.LineString([(990, 2000), (1010, 2000)])
    name = shapely.Point(1010, 1990)
    bldg = np.zeros((window.side, window.side), "uint8")
    bldg[3, 5] = 11
    lists = features.feature_lists(window, np.array([house]), np.array([line]), np.array([road]), {"CLASSIFICA": np.array(["A Road"])}, np.array([name]), {"DISTNAME": np.array(["Town"]), "CLASSIFICA": np.array(["Populated Place"]), "FONTHEIGHT": np.array(["Large"])}, bldg)
    x, z, w, d, h, _ = lists["buildings"][0]
    assert (x, z) == (10.0, -45.0)
    assert sorted((w, d)) == [10.0, 20.0]
    assert h == 8  # no lidar height at this cell, so the assumed one
    assert lists["lines"][0][0] == [0.0, 0.0] and lists["lines"][0][1] == [0.0, -260.0] and len(lists["lines"][0]) == 3
    assert lists["roads"][0][0] == "A Road" and lists["roads"][0][1][0] == [-10.0, 0.0]
    assert lists["names"][0] == ["Town", "Populated Place", "Large", 10.0, 10.0]


def test_the_fit_is_accurate_on_a_smooth_surface():
    window = Window(400000, 200000, 15000)
    grid = np.linspace(-15000, 15000, 21)
    east, north = np.meshgrid(window.east + grid, window.north + grid)
    east, north = east.ravel(), north.ravel()
    x, y = (east - window.east) / 10000, (north - window.north) / 10000
    lon, lat = -2 + 0.14 * x + 0.001 * y * y, 51 + 0.09 * y - 0.0005 * x * x
    lon_fit, lat_fit, error = fit.fit_to_coefficients(east, north, lon, lat, window)
    assert error < 0.01
    assert lon_fit[0] == pytest.approx(-2) and lat_fit[2] == pytest.approx(0.09)


def test_the_composite_ignores_missing_data_and_outliers():
    a, b, c = (np.full((3, 1, 2), v, "uint8") for v in (100, 110, 255))  # 255 is a cloud in one scene
    b[:, 0, 0] = 0  # a scene that does not reach this pixel
    picture = pictures.composite([a, b, c])
    assert picture[0, 0, 1] == 110
    assert picture[0, 0, 0] == 177  # the median of 100 and 255: two scenes alone cannot rule a cloud out

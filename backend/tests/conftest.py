import copy

import pytest
from fastapi.testclient import TestClient

from app.main import create_app

SPEC = {
    "structures": [
        {"id": "radar", "x": 30.0, "z": 0.0, "uplink": "cellular", "cellBand": "B8", "jam": None},
        {"id": "jammer", "x": -25.5, "z": 12.0, "uplink": "starlink", "cellBand": "n78", "jam": ["control24", "gnss"]},
    ],
    "fusionUplinks": ["starlink", "cellular"],
    "fusionCell": "B8",
}
FIGURES = {"structures": {"radar": {"published": 3000.0}}, "drones": {}, "comms": {}, "world": {"rangeScale": 2.0}, "waves": {}}


def laydown(**over):
    return {"name": "Ring of radars", "world": "1", "spec": copy.deepcopy(SPEC), "game_version": "0.1.0", **over}


def run(**over):
    return {
        "scenario_seed": "7", "world": "1", "spec": copy.deepcopy(SPEC), "figures": copy.deepcopy(FIGURES),
        "commands": [{"step": 0, "name": "startWave", "args": []}, {"step": 40, "name": "toggleJamBand", "args": [{"node": "abc"}, "gnss", True]}],
        "game_version": "0.1.0", "digest": "e3c0c9db", "waves_completed": 6, "kills": 71, "leaks": 3, "health": 10.0,
        "budget_left": 8902451.0, "capex": 2607549.0, "consumables": 3490000.0, "enemy_cost": 1305600.0, **over,
    }


def figure_set(**over):
    return {"name": "Long range radars", "figures": copy.deepcopy(FIGURES), "game_version": "0.1.0", **over}


@pytest.fixture
def db_path(tmp_path):
    return tmp_path / "data" / "test.db"


@pytest.fixture
def client(db_path):
    with TestClient(create_app(db_path), base_url="http://localhost", raise_server_exceptions=True) as c:
        yield c

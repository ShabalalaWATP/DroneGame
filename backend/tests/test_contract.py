"""Records made by the real game must be accepted and come back unchanged. The frontend's tests check the same files against what
the game produces today, so a change of shape on either side fails a test."""

import json
from pathlib import Path

import pytest

API = "/api/v1"
FIXTURES = Path(__file__).parent / "fixtures"


def fixture(name):
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


@pytest.mark.parametrize("path, name", [("laydowns", "laydown.json"), ("runs", "run.json"), ("figure-sets", "figure-set.json")])
def test_a_record_from_the_game_round_trips(client, path, name):
    body = fixture(name)
    made = client.post(f"{API}/{path}", json=body)
    assert made.status_code == 201, made.text
    saved = client.get(f"{API}/{path}/1").json()
    for key, value in body.items():
        assert saved[key] == value or _same_figures(saved[key], value), key


def _same_figures(saved, sent):
    """Empty groups the game leaves out come back filled in, which means the same thing."""
    return isinstance(saved, dict) and {k: v for k, v in saved.items() if v} == {k: v for k, v in sent.items() if v}


def test_the_sample_run_exercises_every_kind_of_figure():
    figures = fixture("run.json")["figures"]
    assert figures["structures"] and figures["drones"] and figures["comms"] and figures["world"] and figures["waves"] and figures["adapt"]
    names = {c["name"] for c in fixture("run.json")["commands"]}
    assert {"setAuthority", "startWave", "toggleJamBand", "endRun"} <= names

"""Map packs on this machine: listing them, and building a new one with the separate builder, one at a time."""

import json
import os
import re
import struct
import subprocess
import threading
from pathlib import Path
from typing import Any

MAGIC = b"SGMAP"
MAX_HEADER = 1 << 20
FILE_NAME = re.compile(r"^[A-Za-z0-9_-]{1,64}\.sgmap$")
BUILDER = Path(__file__).resolve().parents[3] / "tools" / "mapbuild"


def maps_root() -> Path:
    return Path(os.environ.get("SITE_GUARD_MAPS") or Path.home() / "site-guard-maps")


def read_summary(path: Path) -> dict[str, Any] | None:
    """What the list shows, from a pack's header. A file that isn't a readable pack is left out."""
    try:
        with path.open("rb") as file:
            start = file.read(10)
            if start[:5] != MAGIC or len(start) != 10:
                return None
            length = struct.unpack("<I", start[6:10])[0]
            if length > MAX_HEADER:
                return None
            header = json.loads(file.read(length))
        return {
            "file": path.name, "hash": str(header["gridsSha256"]), "name": str(header["name"])[:80], "east": int(header["east"]), "north": int(header["north"]),
            "half": int(header["half"]), "tier": str(header["tier"]), "lidarHalf": int(header.get("lidarHalf", 0)),
        }
    except (OSError, ValueError, KeyError, TypeError):
        return None


class PackLibrary:
    def __init__(self, root: Path | None = None) -> None:
        self.root = root or maps_root()

    @property
    def folder(self) -> Path:
        return self.root / "packs"

    def list(self) -> list[dict[str, Any]]:
        if not self.folder.is_dir():
            return []
        found = (read_summary(p) for p in sorted(self.folder.iterdir()) if FILE_NAME.match(p.name))
        return [s for s in found if s]

    def path_of(self, name: str) -> Path | None:
        """Only a plain name in the folder, so a request can never reach anything else."""
        if not FILE_NAME.match(name):
            return None
        path = self.folder / name
        return path if path.is_file() else None


class BuildBusy(Exception):
    """A map is already being built."""


class PackBuilder:
    """Runs the builder as a separate process with fixed arguments, so its mapping packages stay out of this application."""

    def __init__(self, library: PackLibrary, run=subprocess.Popen) -> None:
        self.library, self.run = library, run
        self.lock = threading.Lock()
        self.state: dict[str, Any] = {"running": False, "ok": None, "message": ""}

    def status(self) -> dict[str, Any]:
        with self.lock:
            return dict(self.state)

    def start(self, east: int, north: int, lidar: bool) -> dict[str, Any]:
        with self.lock:
            if self.state["running"]:
                raise BuildBusy
            self.state = {"running": True, "ok": None, "message": "Starting"}
        name = f"area_{east // 1000}_{north // 1000}"
        self.library.folder.mkdir(parents=True, exist_ok=True)
        command = [
            "uv", "run", "--quiet", "--directory", str(BUILDER), "python", "-m", "mapbuild",
            "--centre", f"{east},{north}", "--name", f"Area around {east // 1000}, {north // 1000}",
            "--data", str(self.library.root / "os"), "--out", str(self.library.folder / f"{name}.sgmap"), "--fetch", "--lidar-km", "14" if lidar else "0",
        ]
        try:
            process = self.run(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace")
        except OSError:
            with self.lock:
                self.state = {"running": False, "ok": False, "message": "The map builder could not start. It needs uv installed."}
            return self.status()
        threading.Thread(target=self._watch, args=(process,), daemon=True).start()
        return self.status()

    def _watch(self, process) -> None:
        last = ""
        for line in process.stdout:
            last = line.strip()[:200] or last
            with self.lock:
                self.state["message"] = last
        ok = process.wait() == 0
        with self.lock:
            self.state = {"running": False, "ok": ok, "message": "Finished" if ok else last or "The map could not be built."}

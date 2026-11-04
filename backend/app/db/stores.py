"""SQL for each table. Every value is a bound parameter; the only text ever joined into SQL is written here, never from input."""

import json
import sqlite3
from typing import Any


def _decode(row: sqlite3.Row, *json_columns: str) -> dict[str, Any]:
    record = dict(row)
    for column in json_columns:
        record[column] = json.loads(record[column])
    return record


class SqliteLaydownStore:
    def __init__(self, conn: sqlite3.Connection) -> None:
        self.conn = conn

    def list(self) -> list[dict[str, Any]]:
        rows = self.conn.execute("SELECT id, name, world, game_version, created_at, updated_at FROM laydowns ORDER BY updated_at DESC, id DESC")
        return [dict(r) for r in rows]

    def get(self, laydown_id: int) -> dict[str, Any] | None:
        row = self.conn.execute("SELECT * FROM laydowns WHERE id = ?", (laydown_id,)).fetchone()
        return _decode(row, "spec") if row else None

    def add(self, data: dict[str, Any], now: str) -> int:
        with self.conn:
            cur = self.conn.execute(
                "INSERT INTO laydowns (name, world, spec, game_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
                (data["name"], data["world"], json.dumps(data["spec"]), data["game_version"], now, now),
            )
        return cur.lastrowid

    def replace(self, laydown_id: int, data: dict[str, Any], now: str) -> bool:
        with self.conn:
            cur = self.conn.execute(
                "UPDATE laydowns SET name = ?, world = ?, spec = ?, game_version = ?, updated_at = ? WHERE id = ?",
                (data["name"], data["world"], json.dumps(data["spec"]), data["game_version"], now, laydown_id),
            )
        return cur.rowcount > 0

    def delete(self, laydown_id: int) -> bool:
        with self.conn:
            return self.conn.execute("DELETE FROM laydowns WHERE id = ?", (laydown_id,)).rowcount > 0


_RUN_SUMMARY = "id, scenario_seed, world, game_version, digest, waves_completed, kills, leaks, health, budget_left, capex, consumables, enemy_cost, finished_at"


class SqliteRunStore:
    def __init__(self, conn: sqlite3.Connection) -> None:
        self.conn = conn

    def list(self, limit: int, offset: int) -> tuple[list[dict[str, Any]], int]:
        rows = self.conn.execute(f"SELECT {_RUN_SUMMARY} FROM runs ORDER BY finished_at DESC, id DESC LIMIT ? OFFSET ?", (limit, offset))
        items = [dict(r) for r in rows]
        return items, self.conn.execute("SELECT COUNT(*) FROM runs").fetchone()[0]

    def get(self, run_id: int) -> dict[str, Any] | None:
        row = self.conn.execute("SELECT * FROM runs WHERE id = ?", (run_id,)).fetchone()
        return _decode(row, "spec", "figures", "commands") if row else None

    def add(self, data: dict[str, Any], now: str) -> int:
        with self.conn:
            cur = self.conn.execute(
                "INSERT INTO runs (scenario_seed, world, spec, figures, commands, game_version, digest, waves_completed, kills, leaks,"
                " health, budget_left, capex, consumables, enemy_cost, finished_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    data["scenario_seed"], data["world"], json.dumps(data["spec"]), json.dumps(data["figures"]), json.dumps(data["commands"]),
                    data["game_version"], data["digest"], data["waves_completed"], data["kills"], data["leaks"],
                    data["health"], data["budget_left"], data["capex"], data["consumables"], data["enemy_cost"], now,
                ),
            )
        return cur.lastrowid

    def delete(self, run_id: int) -> bool:
        with self.conn:
            return self.conn.execute("DELETE FROM runs WHERE id = ?", (run_id,)).rowcount > 0


class SqliteFigureSetStore:
    def __init__(self, conn: sqlite3.Connection) -> None:
        self.conn = conn

    def list(self) -> list[dict[str, Any]]:
        rows = self.conn.execute("SELECT id, name, game_version, created_at FROM figure_sets ORDER BY created_at DESC, id DESC")
        return [dict(r) for r in rows]

    def get(self, figure_set_id: int) -> dict[str, Any] | None:
        row = self.conn.execute("SELECT * FROM figure_sets WHERE id = ?", (figure_set_id,)).fetchone()
        return _decode(row, "figures") if row else None

    def add(self, data: dict[str, Any], now: str) -> int:
        with self.conn:
            cur = self.conn.execute(
                "INSERT INTO figure_sets (name, figures, game_version, created_at) VALUES (?, ?, ?, ?)",
                (data["name"], json.dumps(data["figures"]), data["game_version"], now),
            )
        return cur.lastrowid

    def delete(self, figure_set_id: int) -> bool:
        with self.conn:
            return self.conn.execute("DELETE FROM figure_sets WHERE id = ?", (figure_set_id,)).rowcount > 0

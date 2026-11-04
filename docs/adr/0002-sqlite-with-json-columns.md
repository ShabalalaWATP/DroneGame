# ADR 0002: SQLite with JSON columns, using the standard library

Status: accepted, 2026-11-04.

## Context

The game needs to keep saved laydowns, run history and tuning figures. The parameters are still changing, and a feature plan adds many more per-unit settings.

## Decision

Use one SQLite file through Python's standard library `sqlite3`. Keep structured game data in JSON columns, validated by Pydantic on the way in. Use real columns only for what gets filtered or sorted. Migrations are numbered SQL files tracked with `PRAGMA user_version`.

## Reasons

- **Parameters can change without a migration.** Adding, renaming or removing a tuning figure touches no schema. A column for each parameter would need a migration for every change.
- **No server to run.** It is one local file, which suits a game that runs on one machine.
- **Few dependencies.** Three tables and a small migration runner did not justify SQLAlchemy and Alembic.

| Alternative | Why not |
|---|---|
| PostgreSQL | Needs a server. It is the likely next step if this is hosted for many users, and it also has strong JSON support. |
| MongoDB | Its main advantage is a flexible schema, which JSON columns already give, and it adds a server. |
| CSV or JSON files | Poor for comparing runs and for saving safely. |
| SQLAlchemy and Alembic | More to learn and maintain for three tables. Worth adding alongside a move to PostgreSQL. |

## Consequences

- All SQL is in `backend/app/db/stores.py`, with services behind small Protocols, so changing the database touches one file.
- Pydantic has to validate JSON columns, because the database only checks that they are valid JSON.
- Each migration runs inside a transaction and applies fully or not at all. A database from a newer version of the game is refused and left untouched.

## When to revisit

Move to PostgreSQL if several users need to write at once.

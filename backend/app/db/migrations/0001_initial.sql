-- JSON columns hold structured game data, validated by the API on the way in. Columns are only for what gets filtered or
-- sorted, so tuning parameters can change without a migration.

CREATE TABLE laydowns (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  world TEXT NOT NULL,              -- the terrain seed today
  spec TEXT NOT NULL CHECK (json_valid(spec)),  -- systems, positions, wiring, bands
  game_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE runs (
  id INTEGER PRIMARY KEY,
  scenario_seed TEXT NOT NULL,
  world TEXT NOT NULL,
  spec TEXT NOT NULL CHECK (json_valid(spec)),          -- a copy, so editing a laydown never rewrites history
  figures TEXT NOT NULL CHECK (json_valid(figures)),    -- tuning in force, since it changes the result
  commands TEXT NOT NULL CHECK (json_valid(commands)),  -- operator inputs by simulation step
  game_version TEXT NOT NULL,
  digest TEXT NOT NULL,
  waves_completed INTEGER NOT NULL,
  kills INTEGER NOT NULL,
  leaks INTEGER NOT NULL,
  health REAL NOT NULL,
  budget_left REAL NOT NULL,
  capex REAL NOT NULL,
  consumables REAL NOT NULL,
  enemy_cost REAL NOT NULL,
  finished_at TEXT NOT NULL
);

CREATE TABLE figure_sets (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  figures TEXT NOT NULL CHECK (json_valid(figures)),    -- the same shape as exportFigures()
  game_version TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX runs_finished ON runs (finished_at DESC);

-- Sync (Nov 2026): the whole app's data as one JSON snapshot per save (the last 30 kept, for undo), the devices
-- signed in with the PIN, and the PIN itself (salted PBKDF2 hash, set by `npm run set-pin`) with its lockout.
CREATE TABLE IF NOT EXISTS snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  saved_at TEXT NOT NULL,
  device TEXT,
  data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tokens (
  hash TEXT PRIMARY KEY,
  device TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS auth (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  pin_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  fails INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER NOT NULL DEFAULT 0
);

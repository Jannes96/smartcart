import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const DB_PATH = process.env.DATABASE_PATH ?? "./data/smartcart.db";

mkdirSync(dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS lists (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS items (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    list_id    TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    quantity   TEXT,
    checked    INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_items_list ON items(list_id);

  CREATE TABLE IF NOT EXISTS profiles (
    code       TEXT PRIMARY KEY,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS profile_lists (
    profile_code TEXT NOT NULL REFERENCES profiles(code) ON DELETE CASCADE,
    list_id      TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
    added_at     TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (profile_code, list_id)
  );
`);

export default db;

/**
 * CASTmir backend — SQLite storage (Node's built-in node:sqlite, no native build step)
 */
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const DB_PATH = path.join(__dirname, 'data', 'castmir.db')

export const db = new DatabaseSync(DB_PATH)

db.exec(`
  CREATE TABLE IF NOT EXISTS raw_prompts (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    text         TEXT NOT NULL,
    created_date TEXT
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    date          TEXT NOT NULL,
    college       TEXT NOT NULL,
    department    TEXT NOT NULL,
    model         TEXT NOT NULL,
    prompt_text   TEXT NOT NULL,
    pmi_score     REAL NOT NULL,
    quality_score REAL NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_date    ON sessions(date);
  CREATE INDEX IF NOT EXISTS idx_sessions_college  ON sessions(college);
  CREATE INDEX IF NOT EXISTS idx_sessions_model    ON sessions(model);
`)

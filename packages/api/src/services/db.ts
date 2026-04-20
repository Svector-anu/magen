import Database from "better-sqlite3";
import { resolve } from "path";

const DB_PATH = process.env.DB_PATH ?? resolve(process.cwd(), ".magen.db");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma("journal_mode = WAL");
    _db.pragma("foreign_keys = ON");
    migrate(_db);
  }
  return _db;
}

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS policies (
      id                  TEXT PRIMARY KEY,
      recipient_wallet    TEXT NOT NULL,
      recipient_display_name TEXT NOT NULL,
      amount_usdc         TEXT NOT NULL,
      frequency           TEXT NOT NULL,
      approval_mode       TEXT NOT NULL,
      start_date          TEXT NOT NULL,
      end_date            TEXT,
      approval_period_end TEXT,
      memo                TEXT,
      vault_address       TEXT NOT NULL,
      status              TEXT NOT NULL DEFAULT 'active',
      last_executed_at    TEXT,
      next_execution_at   TEXT NOT NULL,
      created_at          TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id            TEXT PRIMARY KEY,
      policy_id     TEXT NOT NULL REFERENCES policies(id),
      status        TEXT NOT NULL DEFAULT 'pending',
      tx_hash       TEXT,
      error         TEXT,
      attempt       INTEGER NOT NULL DEFAULT 0,
      next_retry_at TEXT,
      created_at    TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_jobs_policy_id ON jobs(policy_id);
    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
    CREATE INDEX IF NOT EXISTS idx_policies_status ON policies(status);
  `);

  // Additive migrations for existing DBs
  for (const col of [
    "ALTER TABLE jobs ADD COLUMN attempt INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE jobs ADD COLUMN next_retry_at TEXT",
  ]) {
    try { db.exec(col); } catch { /* column already exists */ }
  }
}

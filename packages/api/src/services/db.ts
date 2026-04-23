import { DatabaseSync } from "node:sqlite";
import { resolve } from "path";

const DB_PATH = process.env.DB_PATH ?? resolve(process.cwd(), ".magen.db");

let _db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (!_db) {
    _db = new DatabaseSync(DB_PATH);
    _db.exec("PRAGMA journal_mode = WAL");
    _db.exec("PRAGMA foreign_keys = ON");
    migrate(_db);
  }
  return _db;
}

function migrate(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS policies (
      id                  TEXT PRIMARY KEY,
      owner_wallet        TEXT NOT NULL DEFAULT '',
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

  for (const col of [
    "ALTER TABLE jobs ADD COLUMN attempt INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE jobs ADD COLUMN next_retry_at TEXT",
    "ALTER TABLE policies ADD COLUMN owner_wallet TEXT NOT NULL DEFAULT ''",
  ]) {
    try { db.exec(col); } catch { /* column already exists */ }
  }
}

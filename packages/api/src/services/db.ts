import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL is required");

export const sql = postgres(DATABASE_URL, { ssl: "require", max: 10 });

export async function migrate(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS policies (
      id                     TEXT PRIMARY KEY,
      owner_wallet           TEXT NOT NULL DEFAULT '',
      recipient_wallet       TEXT NOT NULL,
      recipient_display_name TEXT NOT NULL,
      amount_usdc            TEXT NOT NULL,
      frequency              TEXT NOT NULL,
      approval_mode          TEXT NOT NULL,
      start_date             TEXT NOT NULL,
      end_date               TEXT,
      approval_period_end    TEXT,
      memo                   TEXT,
      auditor_wallet         TEXT,
      vault_address          TEXT NOT NULL,
      status                 TEXT NOT NULL DEFAULT 'active',
      last_executed_at       TEXT,
      next_execution_at      TEXT NOT NULL,
      created_at             TEXT NOT NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS jobs (
      id            TEXT PRIMARY KEY,
      policy_id     TEXT NOT NULL REFERENCES policies(id),
      status        TEXT NOT NULL DEFAULT 'pending',
      tx_hash       TEXT,
      error         TEXT,
      attempt       INTEGER NOT NULL DEFAULT 0,
      next_retry_at TEXT,
      created_at    TEXT NOT NULL
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_jobs_policy_id ON jobs(policy_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_policies_status ON policies(status)`;

  await sql`
    CREATE TABLE IF NOT EXISTS contacts (
      id                TEXT PRIMARY KEY,
      display_name      TEXT NOT NULL,
      aliases           TEXT NOT NULL DEFAULT '[]',
      email             TEXT,
      ens_name          TEXT,
      wallet_address    TEXT,
      resolution_status TEXT NOT NULL DEFAULT 'unresolved',
      created_at        TEXT NOT NULL,
      updated_at        TEXT NOT NULL
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_contacts_wallet ON contacts(wallet_address)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_contacts_ens ON contacts(ens_name)`;

  await sql`
    CREATE TABLE IF NOT EXISTS notifications (
      id         TEXT PRIMARY KEY,
      wallet     TEXT NOT NULL,
      type       TEXT NOT NULL,
      title      TEXT NOT NULL,
      body       TEXT NOT NULL,
      policy_id  TEXT,
      job_id     TEXT,
      tx_hash    TEXT,
      read_at    TEXT,
      created_at TEXT NOT NULL
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_notifications_wallet ON notifications(wallet)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(wallet, read_at)`;
}

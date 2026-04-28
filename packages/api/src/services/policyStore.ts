import { randomUUID } from "crypto";
import { getDb } from "./db.js";
import type { DisbursementPolicy } from "@magen/shared";

export interface StoredPolicy {
  id: string;
  owner_wallet: string;
  recipient_wallet: string;
  recipient_display_name: string;
  amount_usdc: string;
  frequency: string;
  approval_mode: string;
  start_date: string;
  end_date?: string;
  approval_period_end?: string;
  memo?: string;
  auditor_wallet?: string;
  vault_address: string;
  status: "active" | "cancelled" | "expired" | "paused";
  last_executed_at?: string;
  next_execution_at: string;
  created_at: string;
}

function nextExecutionDate(frequency: string, from: Date): Date | null {
  const d = new Date(from);
  switch (frequency) {
    case "once":    return null;
    case "daily":   d.setDate(d.getDate() + 1); break;
    case "weekly":  d.setDate(d.getDate() + 7); break;
    case "monthly": d.setMonth(d.getMonth() + 1); break;
    default:        return null;
  }
  return d;
}

export function createPolicy(policy: DisbursementPolicy, vaultAddress: string, ownerWallet: string): StoredPolicy {
  const db = getDb();
  const now = new Date();
  const startDate = new Date(policy.start_date);
  const firstExecution = startDate > now ? startDate : now;

  const row: StoredPolicy = {
    id: policy.id,
    owner_wallet: ownerWallet,
    recipient_wallet: policy.recipient_wallet,
    recipient_display_name: policy.recipient_display_name,
    amount_usdc: policy.amount_usdc,
    frequency: policy.frequency,
    approval_mode: policy.approval_mode,
    start_date: policy.start_date,
    end_date: policy.end_date,
    approval_period_end: policy.approval_period_end,
    memo: policy.memo,
    auditor_wallet: policy.auditor_wallet,
    vault_address: vaultAddress,
    status: "active",
    next_execution_at: firstExecution.toISOString(),
    created_at: now.toISOString(),
  };

  const params = Object.fromEntries(
    Object.entries({ ...row, last_executed_at: null }).map(([k, v]) => [k, v === undefined ? null : v])
  );
  db.prepare(`
    INSERT INTO policies (
      id, owner_wallet, recipient_wallet, recipient_display_name, amount_usdc, frequency,
      approval_mode, start_date, end_date, approval_period_end, memo, auditor_wallet,
      vault_address, status, last_executed_at, next_execution_at, created_at
    ) VALUES (
      @id, @owner_wallet, @recipient_wallet, @recipient_display_name, @amount_usdc, @frequency,
      @approval_mode, @start_date, @end_date, @approval_period_end, @memo, @auditor_wallet,
      @vault_address, @status, @last_executed_at, @next_execution_at, @created_at
    )
  `).run(params as unknown as Record<string, string | number | null>);

  return row;
}

export function listActivePolicies(ownerWallet: string): StoredPolicy[] {
  return getDb()
    .prepare(`SELECT * FROM policies WHERE status = 'active' AND owner_wallet = ? ORDER BY created_at DESC`)
    .all(ownerWallet) as unknown as StoredPolicy[];
}

export function cancelPolicy(id: string, ownerWallet: string): boolean {
  const result = getDb()
    .prepare(`UPDATE policies SET status = 'cancelled' WHERE id = ? AND owner_wallet = ? AND status = 'active'`)
    .run(id, ownerWallet);
  return result.changes > 0;
}

const EXEC_CAP_PER_HOUR = Number(process.env.EXEC_CAP_PER_HOUR ?? 3);

export function listDuePolicies(): StoredPolicy[] {
  const now = new Date().toISOString();
  return getDb().prepare(`
    SELECT p.* FROM policies p
    WHERE p.status = 'active'
      AND p.next_execution_at <= ?
      AND (p.end_date IS NULL OR p.end_date > ?)
      AND (p.approval_period_end IS NULL OR p.approval_period_end > ?)
      AND NOT EXISTS (
        SELECT 1 FROM jobs j
        WHERE j.policy_id = p.id AND j.status IN ('pending', 'processing')
      )
      AND (
        SELECT COUNT(*) FROM jobs j
        WHERE j.policy_id = p.id
          AND j.status = 'done'
          AND j.created_at > datetime('now', '-1 hour')
      ) < ?
  `).all(now, now, now, EXEC_CAP_PER_HOUR) as unknown as StoredPolicy[];
}

export function pausePolicy(id: string): void {
  getDb()
    .prepare(`UPDATE policies SET status = 'paused' WHERE id = ? AND status = 'active'`)
    .run(id);
}

export function resumePolicy(id: string, ownerWallet: string): boolean {
  const now = new Date().toISOString();
  const result = getDb()
    .prepare(`UPDATE policies SET status = 'active', next_execution_at = ? WHERE id = ? AND owner_wallet = ? AND status = 'paused'`)
    .run(now, id, ownerWallet);
  return result.changes > 0;
}

export interface DashboardData {
  stats: {
    active_policies: number;
    total_policies: number;
    jobs_executed: number;
    jobs_pending: number;
    jobs_failed: number;
    success_rate: number;
  };
  policies: (StoredPolicy & { last_error?: string | null; last_job_status?: string | null })[];
  recent_jobs: {
    id: string;
    policy_id: string;
    status: string;
    tx_hash: string | null;
    error: string | null;
    created_at: string;
    recipient_display_name: string;
    frequency: string;
  }[];
}

export function getDashboardData(ownerWallet: string): DashboardData {
  const db = getDb();

  const policies = db.prepare(`
    SELECT p.*,
      (SELECT j.error  FROM jobs j WHERE j.policy_id = p.id ORDER BY j.created_at DESC LIMIT 1) AS last_error,
      (SELECT j.status FROM jobs j WHERE j.policy_id = p.id ORDER BY j.created_at DESC LIMIT 1) AS last_job_status
    FROM policies p
    WHERE p.owner_wallet = ?
    ORDER BY p.created_at DESC
  `).all(ownerWallet) as unknown as StoredPolicy[];

  const counts = db.prepare(`
    SELECT
      COUNT(CASE WHEN j.status = 'done' THEN 1 END)                    AS executed,
      COUNT(CASE WHEN j.status IN ('pending', 'processing') THEN 1 END) AS pending,
      COUNT(CASE WHEN j.status = 'failed' THEN 1 END)                  AS failed
    FROM jobs j
    JOIN policies p ON j.policy_id = p.id
    WHERE p.owner_wallet = ?
  `).get(ownerWallet) as { executed: number; pending: number; failed: number };

  const recent_jobs = db.prepare(`
    SELECT j.id, j.policy_id, j.status, j.tx_hash, j.error, j.created_at,
           p.recipient_display_name, p.frequency
    FROM jobs j
    JOIN policies p ON j.policy_id = p.id
    WHERE p.owner_wallet = ?
    ORDER BY j.created_at DESC
    LIMIT 20
  `).all(ownerWallet) as unknown as DashboardData["recent_jobs"];

  const executed = counts?.executed ?? 0;
  const failed = counts?.failed ?? 0;
  const total_finished = executed + failed;

  return {
    stats: {
      active_policies: policies.filter((p) => p.status === "active").length,
      total_policies: policies.length,
      jobs_executed: executed,
      jobs_pending: counts?.pending ?? 0,
      jobs_failed: failed,
      success_rate: total_finished === 0 ? 0 : Math.round((executed / total_finished) * 100),
    },
    policies,
    recent_jobs,
  };
}

export function advancePolicy(id: string, executedAt: Date): void {
  const db = getDb();
  const policy = db.prepare(`SELECT * FROM policies WHERE id = ?`).get(id) as unknown as StoredPolicy | undefined;
  if (!policy) return;

  const next = nextExecutionDate(policy.frequency, executedAt);

  if (!next) {
    db.prepare(`UPDATE policies SET status = 'expired', last_executed_at = ? WHERE id = ?`)
      .run(executedAt.toISOString(), id);
  } else {
    db.prepare(`UPDATE policies SET last_executed_at = ?, next_execution_at = ? WHERE id = ?`)
      .run(executedAt.toISOString(), next.toISOString(), id);
  }
}

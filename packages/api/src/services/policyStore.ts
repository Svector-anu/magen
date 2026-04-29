import { randomUUID } from "crypto";
import { sql } from "./db.js";
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

export async function createPolicy(policy: DisbursementPolicy, vaultAddress: string, ownerWallet: string): Promise<StoredPolicy> {
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

  await sql`
    INSERT INTO policies (
      id, owner_wallet, recipient_wallet, recipient_display_name, amount_usdc, frequency,
      approval_mode, start_date, end_date, approval_period_end, memo, auditor_wallet,
      vault_address, status, last_executed_at, next_execution_at, created_at
    ) VALUES (
      ${row.id}, ${row.owner_wallet}, ${row.recipient_wallet}, ${row.recipient_display_name},
      ${row.amount_usdc}, ${row.frequency}, ${row.approval_mode}, ${row.start_date},
      ${row.end_date ?? null}, ${row.approval_period_end ?? null}, ${row.memo ?? null},
      ${row.auditor_wallet ?? null}, ${row.vault_address}, ${row.status},
      ${null}, ${row.next_execution_at}, ${row.created_at}
    )
  `;

  return row;
}

export async function listActivePolicies(ownerWallet: string): Promise<StoredPolicy[]> {
  return sql<StoredPolicy[]>`
    SELECT * FROM policies WHERE status = 'active' AND owner_wallet = ${ownerWallet}
    ORDER BY created_at DESC
  `;
}

export async function cancelPolicy(id: string, ownerWallet: string): Promise<boolean> {
  const result = await sql`
    UPDATE policies SET status = 'cancelled'
    WHERE id = ${id} AND owner_wallet = ${ownerWallet} AND status IN ('active', 'paused')
  `;
  return result.count > 0;
}

const EXEC_CAP_PER_HOUR = Number(process.env.EXEC_CAP_PER_HOUR ?? 3);

export async function listDuePolicies(): Promise<StoredPolicy[]> {
  const now = new Date().toISOString();
  return sql<StoredPolicy[]>`
    SELECT p.* FROM policies p
    WHERE p.status = 'active'
      AND p.next_execution_at <= ${now}
      AND (p.end_date IS NULL OR p.end_date > ${now})
      AND (p.approval_period_end IS NULL OR p.approval_period_end > ${now})
      AND NOT EXISTS (
        SELECT 1 FROM jobs j
        WHERE j.policy_id = p.id AND j.status IN ('pending', 'processing')
      )
      AND (
        SELECT COUNT(*) FROM jobs j
        WHERE j.policy_id = p.id
          AND j.status = 'done'
          AND j.created_at::timestamptz > NOW() - INTERVAL '1 hour'
      ) < ${EXEC_CAP_PER_HOUR}
  `;
}

export async function pausePolicy(id: string): Promise<void> {
  await sql`UPDATE policies SET status = 'paused' WHERE id = ${id} AND status = 'active'`;
}

export async function resumePolicy(id: string, ownerWallet: string): Promise<boolean> {
  const now = new Date().toISOString();
  const result = await sql`
    UPDATE policies SET status = 'active', next_execution_at = ${now}
    WHERE id = ${id} AND owner_wallet = ${ownerWallet} AND status = 'paused'
  `;
  return result.count > 0;
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

export async function getDashboardData(ownerWallet: string): Promise<DashboardData> {
  const policies = await sql<(StoredPolicy & { last_error?: string | null; last_job_status?: string | null })[]>`
    SELECT p.*,
      (SELECT j.error  FROM jobs j WHERE j.policy_id = p.id ORDER BY j.created_at DESC LIMIT 1) AS last_error,
      (SELECT j.status FROM jobs j WHERE j.policy_id = p.id ORDER BY j.created_at DESC LIMIT 1) AS last_job_status
    FROM policies p
    WHERE p.owner_wallet = ${ownerWallet}
    ORDER BY p.created_at DESC
  `;

  const [counts] = await sql<{ executed: string; pending: string; failed: string }[]>`
    SELECT
      COUNT(CASE WHEN j.status = 'done'                         THEN 1 END) AS executed,
      COUNT(CASE WHEN j.status IN ('pending', 'processing')     THEN 1 END) AS pending,
      COUNT(CASE WHEN j.status = 'failed'                       THEN 1 END) AS failed
    FROM jobs j
    JOIN policies p ON j.policy_id = p.id
    WHERE p.owner_wallet = ${ownerWallet}
  `;

  const recent_jobs = await sql<DashboardData["recent_jobs"]>`
    SELECT j.id, j.policy_id, j.status, j.tx_hash, j.error, j.created_at,
           p.recipient_display_name, p.frequency
    FROM jobs j
    JOIN policies p ON j.policy_id = p.id
    WHERE p.owner_wallet = ${ownerWallet}
    ORDER BY j.created_at DESC
    LIMIT 20
  `;

  const executed = Number(counts?.executed ?? 0);
  const failed = Number(counts?.failed ?? 0);
  const total_finished = executed + failed;

  return {
    stats: {
      active_policies: policies.filter((p) => p.status === "active").length,
      total_policies: policies.length,
      jobs_executed: executed,
      jobs_pending: Number(counts?.pending ?? 0),
      jobs_failed: failed,
      success_rate: total_finished === 0 ? 0 : Math.round((executed / total_finished) * 100),
    },
    policies,
    recent_jobs,
  };
}

export async function advancePolicy(id: string, executedAt: Date): Promise<void> {
  const rows = await sql<StoredPolicy[]>`SELECT * FROM policies WHERE id = ${id}`;
  const policy = rows[0];
  if (!policy) return;

  const next = nextExecutionDate(policy.frequency, executedAt);
  const executedAtIso = executedAt.toISOString();

  if (!next) {
    await sql`UPDATE policies SET status = 'expired', last_executed_at = ${executedAtIso} WHERE id = ${id}`;
  } else {
    await sql`
      UPDATE policies SET last_executed_at = ${executedAtIso}, next_execution_at = ${next.toISOString()}
      WHERE id = ${id}
    `;
  }
}

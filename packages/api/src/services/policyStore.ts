import { randomUUID } from "crypto";
import { getDb } from "./db.js";
import type { DisbursementPolicy } from "@magen/shared";

export interface StoredPolicy {
  id: string;
  recipient_wallet: string;
  recipient_display_name: string;
  amount_usdc: string;
  frequency: string;
  approval_mode: string;
  start_date: string;
  end_date?: string;
  approval_period_end?: string;
  memo?: string;
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

export function createPolicy(policy: DisbursementPolicy, vaultAddress: string): StoredPolicy {
  const db = getDb();
  const now = new Date();
  const startDate = new Date(policy.start_date);
  const firstExecution = startDate > now ? startDate : now;

  const row: StoredPolicy = {
    id: policy.id,
    recipient_wallet: policy.recipient_wallet,
    recipient_display_name: policy.recipient_display_name,
    amount_usdc: policy.amount_usdc,
    frequency: policy.frequency,
    approval_mode: policy.approval_mode,
    start_date: policy.start_date,
    end_date: policy.end_date,
    approval_period_end: policy.approval_period_end,
    memo: policy.memo,
    vault_address: vaultAddress,
    status: "active",
    next_execution_at: firstExecution.toISOString(),
    created_at: now.toISOString(),
  };

  db.prepare(`
    INSERT INTO policies (
      id, recipient_wallet, recipient_display_name, amount_usdc, frequency,
      approval_mode, start_date, end_date, approval_period_end, memo,
      vault_address, status, last_executed_at, next_execution_at, created_at
    ) VALUES (
      @id, @recipient_wallet, @recipient_display_name, @amount_usdc, @frequency,
      @approval_mode, @start_date, @end_date, @approval_period_end, @memo,
      @vault_address, @status, @last_executed_at, @next_execution_at, @created_at
    )
  `).run({ ...row, last_executed_at: null });

  return row;
}

export function listActivePolicies(): StoredPolicy[] {
  return getDb()
    .prepare(`SELECT * FROM policies WHERE status = 'active' ORDER BY created_at DESC`)
    .all() as StoredPolicy[];
}

export function cancelPolicy(id: string): boolean {
  const result = getDb()
    .prepare(`UPDATE policies SET status = 'cancelled' WHERE id = ? AND status = 'active'`)
    .run(id);
  return result.changes > 0;
}

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
  `).all(now, now, now) as StoredPolicy[];
}

export function pausePolicy(id: string): void {
  getDb()
    .prepare(`UPDATE policies SET status = 'paused' WHERE id = ? AND status = 'active'`)
    .run(id);
}

export function advancePolicy(id: string, executedAt: Date): void {
  const db = getDb();
  const policy = db.prepare(`SELECT * FROM policies WHERE id = ?`).get(id) as StoredPolicy | undefined;
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

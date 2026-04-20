import { randomUUID } from "crypto";
import { getDb } from "./db.js";

export type JobStatus = "pending" | "processing" | "done" | "failed";

export interface Job {
  id: string;
  policy_id: string;
  status: JobStatus;
  tx_hash?: string;
  error?: string;
  attempt: number;
  next_retry_at?: string;
  created_at: string;
}

export interface JobPayload {
  policyId: string;
  recipientWallet: string;
  amountUsdc: string;
  vaultAddress: string;
}

export function createJob(policyId: string): Job {
  const job: Job = {
    id: randomUUID(),
    policy_id: policyId,
    status: "pending",
    attempt: 0,
    created_at: new Date().toISOString(),
  };
  getDb().prepare(`
    INSERT INTO jobs (id, policy_id, status, attempt, created_at)
    VALUES (@id, @policy_id, @status, @attempt, @created_at)
  `).run(job);
  return job;
}

export function getJob(id: string): Job | undefined {
  return getDb().prepare(`SELECT * FROM jobs WHERE id = ?`).get(id) as Job | undefined;
}

export function listPendingJobs(): Job[] {
  return getDb().prepare(`
    SELECT * FROM jobs
    WHERE status = 'pending'
      AND (next_retry_at IS NULL OR next_retry_at <= datetime('now'))
    ORDER BY created_at ASC
  `).all() as Job[];
}

export function updateJob(
  id: string,
  patch: Partial<Pick<Job, "status" | "tx_hash" | "error" | "attempt" | "next_retry_at">>,
): Job | undefined {
  const db = getDb();
  const sets = Object.keys(patch).map((k) => `${k} = @${k}`).join(", ");
  db.prepare(`UPDATE jobs SET ${sets} WHERE id = @id`).run({ ...patch, id });
  return getJob(id);
}

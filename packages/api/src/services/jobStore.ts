import { randomUUID } from "crypto";
import { sql } from "./db.js";

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

export async function createJob(policyId: string): Promise<Job> {
  const job: Job = {
    id: randomUUID(),
    policy_id: policyId,
    status: "pending",
    attempt: 0,
    created_at: new Date().toISOString(),
  };
  await sql`
    INSERT INTO jobs (id, policy_id, status, attempt, created_at)
    VALUES (${job.id}, ${job.policy_id}, ${job.status}, ${job.attempt}, ${job.created_at})
  `;
  return job;
}

export async function getJob(id: string): Promise<Job | undefined> {
  const rows = await sql<Job[]>`SELECT * FROM jobs WHERE id = ${id}`;
  return rows[0];
}

export async function listPendingJobs(): Promise<Job[]> {
  return sql<Job[]>`
    SELECT * FROM jobs
    WHERE status = 'pending'
      AND (next_retry_at IS NULL OR next_retry_at::timestamptz <= NOW())
    ORDER BY created_at ASC
  `;
}

export async function updateJob(
  id: string,
  patch: Partial<Pick<Job, "status" | "tx_hash" | "error" | "attempt" | "next_retry_at">>,
): Promise<Job | undefined> {
  const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return getJob(id);

  const parts = entries.map(([k], i) => `${k} = $${i + 1}`).join(", ");
  const values = [...entries.map(([, v]) => v), id];
  await sql.unsafe(`UPDATE jobs SET ${parts} WHERE id = $${entries.length + 1}`, values as string[]);
  return getJob(id);
}

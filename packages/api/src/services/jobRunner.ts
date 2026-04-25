import { executePolicy } from "./executePolicy.js";
import { getJob, updateJob } from "./jobStore.js";
import { getDb } from "./db.js";
import { advancePolicy, pausePolicy } from "./policyStore.js";
import { notify } from "./notify.js";
import { isPaused } from "./pause.js";
import type { StoredPolicy } from "./policyStore.js";

const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [60_000, 300_000];

function isPermanentError(err: unknown): boolean {
  const msg = String(err);
  return (
    msg.includes("CALL_EXCEPTION") ||
    msg.includes("Missing required env") ||
    msg.includes("INSUFFICIENT_FUNDS")
  );
}

export type RunJobResult =
  | { ok: true; txHash: string }
  | { ok: false; error: string; retryAt?: string };

export async function runJob(jobId: string): Promise<RunJobResult> {
  const job = getJob(jobId);
  if (!job) return { ok: false, error: "Job not found" };

  const policy = getDb()
    .prepare(`SELECT * FROM policies WHERE id = ?`)
    .get(job.policy_id) as StoredPolicy | undefined;

  if (!policy) return { ok: false, error: "Policy not found" };

  if (isPaused()) {
    notify({ type: "execution.paused", jobId, policyId: policy.id });
    return { ok: false, error: "Execution paused" };
  }

  updateJob(jobId, { status: "processing" });
  notify({ type: "execution.attempt", jobId, policyId: policy.id, attempt: job.attempt, maxAttempts: MAX_ATTEMPTS });

  try {
    const result = await executePolicy({
      policyId: policy.id,
      payerWallet: policy.owner_wallet,
      recipientWallet: policy.recipient_wallet,
      amountUsdc: policy.amount_usdc,
      vaultAddress: policy.vault_address,
    });

    updateJob(jobId, { status: "done", tx_hash: result.txHash });
    advancePolicy(policy.id, new Date());
    notify({ type: "execution.success", jobId, policyId: policy.id, txHash: result.txHash });
    console.log(`[jobRunner] job ${jobId} done — txHash: ${result.txHash}`);
    return { ok: true, txHash: result.txHash };
  } catch (err) {
    const detail = String(err);
    const nextAttempt = job.attempt + 1;
    const permanent = isPermanentError(err);

    notify({ type: "execution.failure", jobId, policyId: policy.id, attempt: nextAttempt, maxAttempts: MAX_ATTEMPTS, error: detail });

    if (!permanent && nextAttempt < MAX_ATTEMPTS) {
      const delayMs = RETRY_DELAYS_MS[job.attempt] ?? RETRY_DELAYS_MS.at(-1)!;
      const retryAt = new Date(Date.now() + delayMs).toISOString();
      updateJob(jobId, { status: "pending", attempt: nextAttempt, next_retry_at: retryAt, error: detail });
      console.error(`[jobRunner] job ${jobId} attempt ${nextAttempt}/${MAX_ATTEMPTS}, retry at ${retryAt}:`, detail);
      return { ok: false, error: "Execution failed, will retry", retryAt };
    }

    updateJob(jobId, { status: "failed", attempt: nextAttempt, error: detail });
    pausePolicy(policy.id);
    const reason = permanent ? "permanent error" : `exhausted ${MAX_ATTEMPTS} attempts`;
    console.error(`[jobRunner] job ${jobId} ${reason} — policy ${policy.id} paused:`, detail);
    return { ok: false, error: "Execution failed" };
  }
}

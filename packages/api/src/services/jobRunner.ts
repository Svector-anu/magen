import { executePolicy } from "./executePolicy.js";
import { getJob, updateJob } from "./jobStore.js";
import { getDb } from "./db.js";
import { advancePolicy, pausePolicy } from "./policyStore.js";
import { notify } from "./notify.js";
import { isPaused } from "./pause.js";
import { sendNotification } from "./web3mail.js";
import { createNotification } from "../store/notificationStore.js";
import type { StoredPolicy } from "./policyStore.js";

const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [60_000, 300_000];

function isPermanentError(err: unknown): boolean {
  const msg = String(err);
  return (
    msg.includes("CALL_EXCEPTION") ||
    msg.includes("Missing required env") ||
    msg.includes("INSUFFICIENT_FUNDS") ||
    msg.includes("OperatorNotActive") ||
    msg.includes("UnauthorizedCaller") ||
    msg.includes("Transaction reverted")
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

  const claimed = getDb()
    .prepare(`UPDATE jobs SET status = 'processing' WHERE id = ? AND status = 'pending'`)
    .run(jobId);
  if (claimed.changes === 0) return { ok: false, error: "Job already being processed" };

  notify({ type: "execution.attempt", jobId, policyId: policy.id, attempt: job.attempt, maxAttempts: MAX_ATTEMPTS });

  try {
    const result = await executePolicy({
      policyId: policy.id,
      payerWallet: policy.owner_wallet,
      recipientWallet: policy.recipient_wallet,
      amountUsdc: policy.amount_usdc,
      vaultAddress: policy.vault_address,
      auditorWallet: policy.auditor_wallet,
    });

    const db = getDb();
    db.exec("BEGIN IMMEDIATE");
    try {
      updateJob(jobId, { status: "done", tx_hash: result.txHash });
      advancePolicy(policy.id, new Date());
      db.exec("COMMIT");
    } catch (txErr) {
      try { db.exec("ROLLBACK"); } catch { /* ignore */ }
      throw txErr;
    }
    notify({ type: "execution.success", jobId, policyId: policy.id, txHash: result.txHash });
    console.log(`[jobRunner] job ${jobId} done — txHash: ${result.txHash}`);
    createNotification({
      wallet: policy.owner_wallet,
      type: "payment_sent",
      title: "Payment sent",
      body: `${policy.amount_usdc} USDC → ${policy.recipient_display_name}`,
      policy_id: policy.id,
      job_id: jobId,
      tx_hash: result.txHash,
    });
    createNotification({
      wallet: policy.recipient_wallet,
      type: "payment_received",
      title: "Payment received",
      body: `${policy.amount_usdc} USDC from Magen agent`,
      policy_id: policy.id,
      job_id: jobId,
      tx_hash: result.txHash,
    });
    sendNotification(
      policy.owner_wallet,
      "Payment sent — Magen",
      `<p>Your payment of <strong>${policy.amount_usdc} USDC</strong> to ${policy.recipient_display_name} was executed.</p><p>Transaction: <code>${result.txHash}</code></p>`
    );
    sendNotification(
      policy.recipient_wallet,
      "Payment received — Magen",
      `<p>You received <strong>${policy.amount_usdc} USDC</strong> via Magen.</p><p>Transaction: <code>${result.txHash}</code></p>`
    );
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
    createNotification({
      wallet: policy.owner_wallet,
      type: "payment_failed",
      title: "Payment failed",
      body: `${policy.amount_usdc} USDC → ${policy.recipient_display_name} — paused. ${detail.slice(0, 120)}`,
      policy_id: policy.id,
      job_id: jobId,
    });
    sendNotification(
      policy.owner_wallet,
      "Payment failed — Magen",
      `<p>Your payment of <strong>${policy.amount_usdc} USDC</strong> to ${policy.recipient_display_name} could not be executed and has been paused.</p><p>Reason: ${detail.slice(0, 200)}</p><p>Check your <a href="${process.env.FRONTEND_URL ?? "http://localhost:5173"}/dashboard">Magen dashboard</a> for details.</p>`
    );
    return { ok: false, error: "Execution failed" };
  }
}

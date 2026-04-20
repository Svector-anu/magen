import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { requireAgent } from "../middleware/vestauth.js";
import { executePolicy } from "../services/executePolicy.js";
import { getJob, updateJob } from "../services/jobStore.js";
import { getDb } from "../services/db.js";
import { advancePolicy, pausePolicy } from "../services/policyStore.js";
import type { StoredPolicy } from "../services/policyStore.js";
import { notify } from "../services/notify.js";
import { isPaused } from "../services/pause.js";

const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [60_000, 300_000]; // 1 min, 5 min

// On-chain reverts and config errors won't resolve on retry — pause immediately.
function isPermanentError(err: unknown): boolean {
  const msg = String(err);
  return (
    msg.includes("CALL_EXCEPTION") ||
    msg.includes("Missing required env") ||
    msg.includes("INSUFFICIENT_FUNDS")
  );
}

export const executeRouter = Router();

const RequestSchema = z.object({
  jobId: z.string().uuid(),
});

executeRouter.post("/execute", requireAgent, async (req: Request, res: Response) => {
  const body = RequestSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid request", issues: body.error.issues });
    return;
  }

  const { jobId } = body.data;
  const job = getJob(jobId);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  const policy = getDb()
    .prepare(`SELECT * FROM policies WHERE id = ?`)
    .get(job.policy_id) as StoredPolicy | undefined;

  if (!policy) {
    res.status(404).json({ error: "Policy not found" });
    return;
  }

  if (isPaused()) {
    notify({ type: "execution.paused", jobId, policyId: policy.id });
    res.status(503).json({ error: "Execution paused", paused: true });
    return;
  }

  updateJob(jobId, { status: "processing" });
  notify({ type: "execution.attempt", jobId, policyId: policy.id, attempt: job.attempt, maxAttempts: MAX_ATTEMPTS });

  try {
    const result = await executePolicy({
      policyId: policy.id,
      recipientWallet: policy.recipient_wallet,
      amountUsdc: policy.amount_usdc,
      vaultAddress: policy.vault_address,
    });

    const executedAt = new Date();
    updateJob(jobId, { status: "done", tx_hash: result.txHash });
    advancePolicy(policy.id, executedAt);
    notify({ type: "execution.success", jobId, policyId: policy.id, txHash: result.txHash });

    res.json({ txHash: result.txHash });
  } catch (err) {
    const detail = String(err);
    const nextAttempt = job.attempt + 1;
    const permanent = isPermanentError(err);

    notify({ type: "execution.failure", jobId, policyId: policy.id, attempt: nextAttempt, maxAttempts: MAX_ATTEMPTS, error: detail });

    if (!permanent && nextAttempt < MAX_ATTEMPTS) {
      const delayMs = RETRY_DELAYS_MS[job.attempt] ?? RETRY_DELAYS_MS.at(-1)!;
      const retryAt = new Date(Date.now() + delayMs).toISOString();
      updateJob(jobId, { status: "pending", attempt: nextAttempt, next_retry_at: retryAt, error: detail });
      console.error(`[execute] job ${jobId} attempt ${nextAttempt}/${MAX_ATTEMPTS}, retry at ${retryAt}`);
      res.status(500).json({ error: "Internal error", detail, retryAt });
    } else {
      updateJob(jobId, { status: "failed", attempt: nextAttempt, error: detail });
      pausePolicy(policy.id);
      const reason = permanent ? "permanent error" : `exhausted ${MAX_ATTEMPTS} attempts`;
      console.error(`[execute] job ${jobId} ${reason} — policy ${policy.id} paused`);
      res.status(500).json({ error: "Internal error", detail });
    }
  }
});

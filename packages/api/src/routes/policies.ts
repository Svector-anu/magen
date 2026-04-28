import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { DisbursementPolicySchema } from "@magen/shared";
import { createPolicy, listActivePolicies, cancelPolicy, resumePolicy, type StoredPolicy } from "../services/policyStore.js";
import { getDb } from "../services/db.js";
import { createJob } from "../services/jobStore.js";
import { makeRequireWallet } from "../middleware/requireWallet.js";

export const policiesRouter = Router();

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

const CreateSchema = z.object({
  policy: DisbursementPolicySchema,
  vaultAddress: z.string().regex(EVM_ADDRESS, { message: "Must be a valid EVM address" }),
});

policiesRouter.post("/policies", makeRequireWallet("save-policy"), (req: Request, res: Response) => {
  const body = CreateSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid request", issues: body.error.issues });
    return;
  }
  const stored = createPolicy(body.data.policy, body.data.vaultAddress, req.verifiedWallet!);
  const job = createJob(stored.id);
  res.status(201).json({ policyId: stored.id, jobId: job.id });
});

policiesRouter.get("/policies", makeRequireWallet("list-policies"), (req: Request, res: Response) => {
  res.json(listActivePolicies(req.verifiedWallet!));
});

policiesRouter.delete("/policies/:id", makeRequireWallet("cancel-policy"), (req: Request, res: Response) => {
  const cancelled = cancelPolicy(req.params.id, req.verifiedWallet!);
  if (!cancelled) {
    res.status(404).json({ error: "Policy not found or already inactive" });
    return;
  }
  res.status(204).end();
});

policiesRouter.post("/policies/:id/resume", makeRequireWallet("resume-policy"), (req: Request, res: Response) => {
  const resumed = resumePolicy(req.params.id, req.verifiedWallet!);
  if (!resumed) {
    res.status(404).json({ error: "Policy not found or not paused" });
    return;
  }
  const existing = getDb()
    .prepare(`SELECT 1 FROM jobs WHERE policy_id = ? AND status IN ('pending', 'processing') LIMIT 1`)
    .get(req.params.id);
  if (existing) {
    res.status(409).json({ error: "A job is already pending or running for this policy" });
    return;
  }
  const job = createJob(req.params.id);
  res.status(200).json({ jobId: job.id });
});

policiesRouter.post("/policies/:id/trigger", makeRequireWallet("trigger-policy"), (req: Request, res: Response) => {
  const db = getDb();
  const policy = db
    .prepare(`SELECT * FROM policies WHERE id = ? AND owner_wallet = ? AND status = 'active'`)
    .get(req.params.id, req.verifiedWallet!) as StoredPolicy | undefined;
  if (!policy) {
    res.status(404).json({ error: "Active policy not found" });
    return;
  }
  const existing = db
    .prepare(`SELECT 1 FROM jobs WHERE policy_id = ? AND status IN ('pending', 'processing') LIMIT 1`)
    .get(req.params.id);
  if (existing) {
    res.status(409).json({ error: "A job is already pending or running for this policy" });
    return;
  }
  const job = createJob(req.params.id);
  res.status(201).json({ jobId: job.id });
});

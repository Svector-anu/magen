import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { DisbursementPolicySchema } from "@magen/shared";
import { createPolicy, listActivePolicies, cancelPolicy, resumePolicy, type StoredPolicy } from "../services/policyStore.js";
import { sql } from "../services/db.js";
import { createJob } from "../services/jobStore.js";
import { makeRequireWallet } from "../middleware/requireWallet.js";

export const policiesRouter = Router();

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

const CreateSchema = z.object({
  policy: DisbursementPolicySchema,
  vaultAddress: z.string().regex(EVM_ADDRESS, { message: "Must be a valid EVM address" }),
});

policiesRouter.post("/policies", makeRequireWallet("save-policy"), async (req: Request, res: Response) => {
  const body = CreateSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid request", issues: body.error.issues });
    return;
  }
  const stored = await createPolicy(body.data.policy, body.data.vaultAddress, req.verifiedWallet!);
  const job = await createJob(stored.id);
  res.status(201).json({ policyId: stored.id, jobId: job.id });
});

policiesRouter.get("/policies", makeRequireWallet("list-policies"), async (req: Request, res: Response) => {
  res.json(await listActivePolicies(req.verifiedWallet!));
});

policiesRouter.delete("/policies/:id", makeRequireWallet("cancel-policy"), async (req: Request, res: Response) => {
  const cancelled = await cancelPolicy(req.params.id, req.verifiedWallet!);
  if (!cancelled) {
    res.status(404).json({ error: "Policy not found or already inactive" });
    return;
  }
  res.status(204).end();
});

policiesRouter.post("/policies/:id/resume", makeRequireWallet("resume-policy"), async (req: Request, res: Response) => {
  const resumed = await resumePolicy(req.params.id, req.verifiedWallet!);
  if (!resumed) {
    res.status(404).json({ error: "Policy not found or not paused" });
    return;
  }
  const existing = (await sql<{ id: string }[]>`
    SELECT id FROM jobs WHERE policy_id = ${req.params.id} AND status IN ('pending', 'processing') LIMIT 1
  `)[0];
  if (existing) {
    res.status(409).json({ error: "A job is already pending or running for this policy" });
    return;
  }
  const job = await createJob(req.params.id);
  res.status(200).json({ jobId: job.id });
});

policiesRouter.post("/policies/:id/trigger", makeRequireWallet("trigger-policy"), async (req: Request, res: Response) => {
  const policies = await sql<StoredPolicy[]>`
    SELECT * FROM policies WHERE id = ${req.params.id} AND owner_wallet = ${req.verifiedWallet!} AND status = 'active'
  `;
  if (!policies[0]) {
    res.status(404).json({ error: "Active policy not found" });
    return;
  }
  const existing = (await sql<{ id: string }[]>`
    SELECT id FROM jobs WHERE policy_id = ${req.params.id} AND status IN ('pending', 'processing') LIMIT 1
  `)[0];
  if (existing) {
    res.status(409).json({ error: "A job is already pending or running for this policy" });
    return;
  }
  const job = await createJob(req.params.id);
  res.status(201).json({ jobId: job.id });
});

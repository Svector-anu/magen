import { Router, type Request, type Response } from "express";
import { requireAgent } from "../middleware/vestauth.js";
import { getJob, listPendingJobs } from "../services/jobStore.js";

export const jobsRouter = Router();

jobsRouter.get("/jobs/pending", requireAgent, (_req: Request, res: Response) => {
  res.json(listPendingJobs());
});

jobsRouter.get("/jobs/:id", (req: Request, res: Response) => {
  const job = getJob(req.params.id);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  res.json({ id: job.id, status: job.status, txHash: job.tx_hash, error: job.error });
});

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { requireAgent } from "../middleware/vestauth.js";
import { getJob } from "../services/jobStore.js";
import { runJob } from "../services/jobRunner.js";

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
  if (!await getJob(jobId)) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  const result = await runJob(jobId);
  if (result.ok) {
    res.json({ txHash: result.txHash });
  } else if (result.retryAt) {
    res.status(500).json({ error: result.error, retryAt: result.retryAt });
  } else {
    res.status(500).json({ error: result.error });
  }
});

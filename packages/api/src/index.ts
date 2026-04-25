import { config } from "@dotenvx/dotenvx";
import { resolve } from "path";
config({ path: resolve(import.meta.dirname, "../../../.env") });
import express from "express";
import cors from "cors";
import { parseRouter } from "./routes/parse.js";
import { contactsRouter } from "./routes/contacts.js";
import { executeRouter } from "./routes/execute.js";
import { jobsRouter } from "./routes/jobs.js";
import { policiesRouter } from "./routes/policies.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { adminRouter } from "./routes/admin.js";
import { listDuePolicies } from "./services/policyStore.js";
import { createJob, listPendingJobs } from "./services/jobStore.js";
import { isPaused } from "./services/pause.js";
import { notify } from "./services/notify.js";
import { validateEnv } from "./services/config.js";
import { runJob } from "./services/jobRunner.js";

validateEnv();

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
const port = Number(process.env.API_PORT ?? 3001);

app.use(cors({ origin: process.env.FRONTEND_URL ?? "http://localhost:5173" }));
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));
app.use("/api", parseRouter);
app.use("/api", contactsRouter);
app.use("/api", executeRouter);
app.use("/api", jobsRouter);
app.use("/api", policiesRouter);
app.use("/api", dashboardRouter);
app.use("/api", adminRouter);

const SCHEDULER_INTERVAL_MS = 30_000;

function runScheduler(): void {
  if (isPaused()) {
    console.warn("[scheduler] execution paused — skipping");
    return;
  }
  try {
    const due = listDuePolicies();
    for (const policy of due) {
      const job = createJob(policy.id);
      notify({ type: "scheduler.queued", jobId: job.id, policyId: policy.id });
      console.log(`[scheduler] queued job ${job.id} for policy ${policy.id} (${policy.amount_usdc} USDC → ${policy.recipient_display_name})`);
    }
  } catch (err) {
    console.error("[scheduler] error:", err);
  }
}

const EXECUTOR_INTERVAL_MS = 5_000;

async function runExecutor(): Promise<void> {
  if (isPaused()) return;
  try {
    const jobs = listPendingJobs();
    for (const job of jobs) {
      console.log(`[executor] picking up job ${job.id}`);
      await runJob(job.id);
    }
  } catch (err) {
    console.error("[executor] error:", err);
  }
}

app.listen(port, () => {
  console.log(`Magen API listening on port ${port}`);
  runScheduler();
  setInterval(runScheduler, SCHEDULER_INTERVAL_MS);
  void runExecutor();
  setInterval(() => void runExecutor(), EXECUTOR_INTERVAL_MS);
});

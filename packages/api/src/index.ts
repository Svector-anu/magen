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
import { listDuePolicies } from "./services/policyStore.js";
import { createJob } from "./services/jobStore.js";

const app = express();
const port = Number(process.env.API_PORT ?? 3001);

app.use(cors({ origin: process.env.FRONTEND_URL ?? "http://localhost:5173" }));
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));
app.use("/api", parseRouter);
app.use("/api", contactsRouter);
app.use("/api", executeRouter);
app.use("/api", jobsRouter);
app.use("/api", policiesRouter);

const SCHEDULER_INTERVAL_MS = 30_000;

function runScheduler(): void {
  try {
    const due = listDuePolicies();
    for (const policy of due) {
      const job = createJob(policy.id);
      console.log(`[scheduler] queued job ${job.id} for policy ${policy.id} (${policy.amount_usdc} USDC → ${policy.recipient_display_name})`);
    }
  } catch (err) {
    console.error("[scheduler] error:", err);
  }
}

app.listen(port, () => {
  console.log(`Magen API listening on port ${port}`);
  runScheduler();
  setInterval(runScheduler, SCHEDULER_INTERVAL_MS);
});

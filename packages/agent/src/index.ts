import { config } from "@dotenvx/dotenvx";
import { resolve } from "path";
import { createRequire } from "module";
import { createServer } from "http";

config({ path: resolve(import.meta.dirname, "../../../.env") });

const require = createRequire(import.meta.url);
const vestauth = require("vestauth");

const API_BASE = process.env.API_BASE ?? "http://localhost:3001/api";
const POLL_INTERVAL_MS = 5_000;
const AGENT_UID = "magen-agent";

function privateJwk(): string {
  const raw = process.env.AGENT_PRIVATE_JWK;
  if (!raw) throw new Error("Missing AGENT_PRIVATE_JWK");
  return raw;
}

async function signedHeaders(method: string, url: string): Promise<Record<string, string>> {
  return vestauth.primitives.headers(method, url, AGENT_UID, privateJwk());
}

interface Job {
  id: string;
  policy_id: string;
  status: string;
}

async function fetchPendingJobs(): Promise<Job[]> {
  const url = `${API_BASE}/jobs/pending`;
  const headers = await signedHeaders("GET", url);
  const res = await fetch(url, { headers: { ...headers, "Content-Type": "application/json" } });
  if (!res.ok) throw new Error(`GET /jobs/pending failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function executeJob(job: Job): Promise<void> {
  const url = `${API_BASE}/execute`;
  const headers = await signedHeaders("POST", url);
  const res = await fetch(url, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ jobId: job.id }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail ?? data.error ?? `execute failed: ${res.status}`);
  }
  console.log(`[agent] job ${job.id} done — txHash: ${data.txHash}`);
}

async function poll(): Promise<void> {
  let jobs: Job[];
  try {
    jobs = await fetchPendingJobs();
  } catch (err) {
    console.error("[agent] poll error:", err);
    return;
  }

  for (const job of jobs) {
    console.log(`[agent] executing job ${job.id} (policy ${job.policy_id})`);
    try {
      await executeJob(job);
    } catch (err) {
      console.error(`[agent] job ${job.id} failed:`, err);
    }
  }
}

const PORT = parseInt(process.env.PORT ?? "3002", 10);
createServer((req, res) => {
  res.writeHead(req.url === "/health" ? 200 : 404);
  res.end(req.url === "/health" ? "ok" : "not found");
}).listen(PORT);

console.log(`[agent] started — polling ${API_BASE}/jobs/pending every ${POLL_INTERVAL_MS / 1000}s`);
poll();
setInterval(poll, POLL_INTERVAL_MS);

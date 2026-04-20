import { Router, type Request, type Response } from "express";
import { pause, resume, pauseStatus } from "../services/pause.js";
import { notify } from "../services/notify.js";

export const adminRouter = Router();

function requireAdminToken(req: Request, res: Response): boolean {
  const adminToken = process.env.ADMIN_TOKEN;
  if (!adminToken) {
    res.status(503).json({ error: "Admin endpoints disabled — ADMIN_TOKEN not configured" });
    return false;
  }
  const provided = req.headers.authorization?.replace("Bearer ", "");
  if (provided !== adminToken) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

adminRouter.post("/admin/pause", (req: Request, res: Response) => {
  if (!requireAdminToken(req, res)) return;
  pause();
  notify({ type: "execution.paused", detail: "manually paused via admin endpoint" });
  console.warn("[admin] execution PAUSED");
  res.json({ ...pauseStatus() });
});

adminRouter.post("/admin/resume", (req: Request, res: Response) => {
  if (!requireAdminToken(req, res)) return;
  resume();
  console.warn("[admin] execution RESUMED");
  res.json({ ...pauseStatus() });
});

adminRouter.get("/admin/status", (req: Request, res: Response) => {
  if (!requireAdminToken(req, res)) return;
  res.json({ ...pauseStatus() });
});

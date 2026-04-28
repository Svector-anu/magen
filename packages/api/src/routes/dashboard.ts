import { Router, type Request, type Response } from "express";
import { getDashboardData } from "../services/policyStore.js";
import { makeRequireWallet } from "../middleware/requireWallet.js";

export const dashboardRouter = Router();

dashboardRouter.get("/dashboard", makeRequireWallet("list-policies"), async (req: Request, res: Response) => {
  res.json(await getDashboardData(req.verifiedWallet!));
});

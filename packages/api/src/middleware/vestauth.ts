import { createRequire } from "module";
import type { Request, Response, NextFunction } from "express";

const require = createRequire(import.meta.url);
const vestauth = require("vestauth");

export async function requireAgent(req: Request, res: Response, next: NextFunction): Promise<void> {
  const rawPublicJwk = process.env.AGENT_PUBLIC_JWK;
  if (!rawPublicJwk) {
    res.status(500).json({ error: "Agent auth not configured (missing AGENT_PUBLIC_JWK)" });
    return;
  }

  let publicJwk: object;
  try {
    publicJwk = JSON.parse(rawPublicJwk);
  } catch {
    res.status(500).json({ error: "AGENT_PUBLIC_JWK is not valid JSON" });
    return;
  }

  try {
    const url = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
    await vestauth.primitives.verify(req.method, url, req.headers, {}, publicJwk);
    next();
  } catch (err) {
    res.status(401).json({ error: "Unauthorized", detail: err instanceof Error ? err.message : String(err) });
  }
}

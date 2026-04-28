import { verifyMessage, getAddress } from "ethers";
import type { Request, Response, NextFunction } from "express";

export const SIG_WINDOW_MINUTES = Number(process.env.SIG_WINDOW_MINUTES ?? 60);

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      verifiedWallet?: string;
    }
  }
}

function isValidMinute(minute: number): boolean {
  const serverMinute = Math.floor(Date.now() / 60_000);
  return Number.isInteger(minute) && Math.abs(serverMinute - minute) <= SIG_WINDOW_MINUTES;
}

export function makeRequireWallet(action: string) {
  return async function requireWalletMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
    const rawAddress = req.headers["x-wallet-address"];
    const rawSig = req.headers["x-wallet-signature"];
    const rawTs = req.headers["x-wallet-timestamp"];

    if (typeof rawAddress !== "string" || typeof rawSig !== "string" || typeof rawTs !== "string") {
      res.status(401).json({ error: "Wallet authentication required" });
      return;
    }

    const minute = Number(rawTs);
    if (!isValidMinute(minute)) {
      res.status(401).json({ error: "Signature expired or invalid timestamp" });
      return;
    }

    const message = `magen:${action}:${minute}`;
    try {
      const recovered = verifyMessage(message, rawSig);
      if (getAddress(recovered) !== getAddress(rawAddress)) {
        res.status(401).json({ error: "Signature does not match wallet address" });
        return;
      }
      req.verifiedWallet = getAddress(rawAddress);
      next();
    } catch {
      res.status(401).json({ error: "Invalid wallet signature" });
    }
  };
}

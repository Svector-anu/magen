import { Router, type Request, type Response } from "express";
import { makeRequireWallet } from "../middleware/requireWallet.js";
import { listNotifications, countUnread, markAllRead } from "../store/notificationStore.js";

export const notificationsRouter = Router();

notificationsRouter.get(
  "/notifications",
  makeRequireWallet("list-notifications"),
  async (req: Request, res: Response) => {
    const wallet = req.verifiedWallet!;
    res.json({
      notifications: await listNotifications(wallet),
      unread: await countUnread(wallet),
    });
  }
);

notificationsRouter.put(
  "/notifications/read",
  makeRequireWallet("list-notifications"),
  async (req: Request, res: Response) => {
    await markAllRead(req.verifiedWallet!);
    res.json({ ok: true });
  }
);

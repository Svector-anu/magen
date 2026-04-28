import { Router, type Request, type Response } from "express";
import { makeRequireWallet } from "../middleware/requireWallet.js";
import { listNotifications, countUnread, markAllRead } from "../store/notificationStore.js";

export const notificationsRouter = Router();

notificationsRouter.get(
  "/notifications",
  makeRequireWallet("list-notifications"),
  (req: Request, res: Response) => {
    const wallet = req.verifiedWallet!;
    res.json({
      notifications: listNotifications(wallet),
      unread: countUnread(wallet),
    });
  }
);

notificationsRouter.put(
  "/notifications/read",
  makeRequireWallet("list-notifications"),
  (req: Request, res: Response) => {
    markAllRead(req.verifiedWallet!);
    res.json({ ok: true });
  }
);

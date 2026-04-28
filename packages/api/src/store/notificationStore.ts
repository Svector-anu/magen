import { randomUUID } from "crypto";
import { getDb } from "../services/db.js";

export type NotificationType = "payment_sent" | "payment_received" | "payment_failed";

export interface AppNotification {
  id: string;
  wallet: string;
  type: NotificationType;
  title: string;
  body: string;
  policy_id: string | null;
  job_id: string | null;
  tx_hash: string | null;
  read_at: string | null;
  created_at: string;
}

export function createNotification(params: {
  wallet: string;
  type: NotificationType;
  title: string;
  body: string;
  policy_id?: string;
  job_id?: string;
  tx_hash?: string;
}): AppNotification {
  const now = new Date().toISOString();
  const n: AppNotification = {
    id: randomUUID(),
    wallet: params.wallet.toLowerCase(),
    type: params.type,
    title: params.title,
    body: params.body,
    policy_id: params.policy_id ?? null,
    job_id: params.job_id ?? null,
    tx_hash: params.tx_hash ?? null,
    read_at: null,
    created_at: now,
  };
  getDb()
    .prepare(
      `INSERT INTO notifications (id, wallet, type, title, body, policy_id, job_id, tx_hash, read_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(n.id, n.wallet, n.type, n.title, n.body, n.policy_id, n.job_id, n.tx_hash, n.read_at, n.created_at);
  return n;
}

export function listNotifications(wallet: string, limit = 50): AppNotification[] {
  return getDb()
    .prepare(
      `SELECT * FROM notifications WHERE wallet = ? ORDER BY created_at DESC LIMIT ?`
    )
    .all(wallet.toLowerCase(), limit) as unknown as AppNotification[];
}

export function countUnread(wallet: string): number {
  const row = getDb()
    .prepare(`SELECT COUNT(*) as n FROM notifications WHERE wallet = ? AND read_at IS NULL`)
    .get(wallet.toLowerCase()) as { n: number };
  return row.n;
}

export function markAllRead(wallet: string): void {
  getDb()
    .prepare(`UPDATE notifications SET read_at = ? WHERE wallet = ? AND read_at IS NULL`)
    .run(new Date().toISOString(), wallet.toLowerCase());
}

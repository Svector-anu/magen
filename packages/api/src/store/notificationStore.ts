import { randomUUID } from "crypto";
import { sql } from "../services/db.js";

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

export async function createNotification(params: {
  wallet: string;
  type: NotificationType;
  title: string;
  body: string;
  policy_id?: string;
  job_id?: string;
  tx_hash?: string;
}): Promise<void> {
  const now = new Date().toISOString();
  await sql`
    INSERT INTO notifications (id, wallet, type, title, body, policy_id, job_id, tx_hash, read_at, created_at)
    VALUES (
      ${randomUUID()}, ${params.wallet.toLowerCase()}, ${params.type},
      ${params.title}, ${params.body},
      ${params.policy_id ?? null}, ${params.job_id ?? null}, ${params.tx_hash ?? null},
      ${null}, ${now}
    )
  `;
}

export async function listNotifications(wallet: string, limit = 50): Promise<AppNotification[]> {
  return sql<AppNotification[]>`
    SELECT * FROM notifications WHERE wallet = ${wallet.toLowerCase()}
    ORDER BY created_at DESC LIMIT ${limit}
  `;
}

export async function countUnread(wallet: string): Promise<number> {
  const [row] = await sql<{ n: string }[]>`
    SELECT COUNT(*) AS n FROM notifications WHERE wallet = ${wallet.toLowerCase()} AND read_at IS NULL
  `;
  return Number(row?.n ?? 0);
}

export async function markAllRead(wallet: string): Promise<void> {
  await sql`
    UPDATE notifications SET read_at = ${new Date().toISOString()}
    WHERE wallet = ${wallet.toLowerCase()} AND read_at IS NULL
  `;
}

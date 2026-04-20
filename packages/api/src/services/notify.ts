export type NotifyEventType =
  | "execution.attempt"
  | "execution.success"
  | "execution.failure"
  | "execution.paused"
  | "scheduler.queued"
  | "scheduler.volume_alert";

export interface NotifyEvent {
  type: NotifyEventType;
  policyId?: string;
  jobId?: string;
  txHash?: string;
  attempt?: number;
  maxAttempts?: number;
  error?: string;
  detail?: string;
  count?: number;
  windowMinutes?: number;
}

const COLORS: Record<NotifyEventType, number> = {
  "execution.attempt":        0x5865f2, // blue
  "execution.success":        0x57f287, // green
  "execution.failure":        0xed4245, // red
  "execution.paused":         0xfee75c, // yellow
  "scheduler.queued":         0x5865f2,
  "scheduler.volume_alert":   0xed4245,
};

const ICONS: Record<NotifyEventType, string> = {
  "execution.attempt":      "⏳",
  "execution.success":      "✅",
  "execution.failure":      "❌",
  "execution.paused":       "⏸️",
  "scheduler.queued":       "📋",
  "scheduler.volume_alert": "🚨",
};

function formatMessage(event: NotifyEvent): string {
  const icon = ICONS[event.type];
  const ts = new Date().toISOString();
  const parts = [`${icon} **${event.type}** \`${ts}\``];
  if (event.policyId)    parts.push(`policy: \`${event.policyId.slice(0, 8)}…\``);
  if (event.jobId)       parts.push(`job: \`${event.jobId.slice(0, 8)}…\``);
  if (event.txHash)      parts.push(`tx: \`${event.txHash.slice(0, 18)}…\``);
  if (event.attempt != null) parts.push(`attempt: ${event.attempt}/${event.maxAttempts ?? "?"}`);
  if (event.error)       parts.push(`error: ${event.error.slice(0, 120)}`);
  if (event.count != null) parts.push(`count: ${event.count} in ${event.windowMinutes}min`);
  return parts.join(" | ");
}

// In-memory ring buffer for volume threshold detection (last 10 min of failures)
const recentFailures: number[] = [];
const VOLUME_WINDOW_MS = 10 * 60 * 1000;
const VOLUME_THRESHOLD = 5;

function checkVolumeAlert(event: NotifyEvent): void {
  if (event.type !== "execution.failure") return;
  const now = Date.now();
  recentFailures.push(now);
  // Evict entries outside the window
  while (recentFailures.length && recentFailures[0] < now - VOLUME_WINDOW_MS) {
    recentFailures.shift();
  }
  if (recentFailures.length >= VOLUME_THRESHOLD) {
    notify({
      type: "scheduler.volume_alert",
      count: recentFailures.length,
      windowMinutes: VOLUME_WINDOW_MS / 60_000,
    });
    recentFailures.length = 0; // reset after alert to avoid spam
  }
}

export function notify(event: NotifyEvent): void {
  const ts = new Date().toISOString();
  // Structured log always
  console.log(JSON.stringify({ ...event, timestamp: ts }));

  const webhookUrl = process.env.WEBHOOK_URL;
  if (!webhookUrl || process.env.WEBHOOK_ENABLED === "false") return;

  const text = formatMessage(event);

  // Fire-and-forget — never block execution on webhook delivery
  fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: text,           // Discord
      text,                    // Slack
      embeds: [{
        description: text,
        color: COLORS[event.type],
      }],
    }),
  }).catch((err) => console.error("[notify] webhook delivery failed:", String(err)));

  if (event.type === "execution.failure") checkVolumeAlert(event);
}

import { useState, useEffect, useRef, useCallback } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { usePrivy } from "@privy-io/react-auth";
import { api, type AppNotification } from "../lib/api.js";
import { getCached, getOrSign } from "../lib/walletAuth.js";
import styles from "./NotificationBell.module.css";

const POLL_MS = 30_000;
const ARBISCAN = "https://sepolia.arbiscan.io/tx/";

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function dotClass(type: AppNotification["type"]): string {
  if (type === "payment_sent") return styles.dotSent;
  if (type === "payment_received") return styles.dotReceived;
  return styles.dotFailed;
}

export function NotificationBell() {
  const { authenticated } = usePrivy();
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const signRef = useRef(signMessageAsync);
  useEffect(() => { signRef.current = signMessageAsync; });

  const fetch = useCallback(async () => {
    if (!address) return;
    const auth = getCached(address, "list-notifications");
    if (!auth) return;
    try {
      const data = await api.listNotifications(address, auth.sig, auth.minute);
      setNotifications(data.notifications);
      setUnread(data.unread);
    } catch {
      // silent — background poll
    }
  }, [address]);

  useEffect(() => {
    if (!authenticated || !address) return;
    void fetch();
    const id = setInterval(() => void fetch(), POLL_MS);
    return () => clearInterval(id);
  }, [authenticated, address, fetch]);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  async function handleOpen() {
    if (!address) return;
    const wasOpen = open;
    setOpen(!wasOpen);
    if (!wasOpen && unread > 0) {
      try {
        const auth = await getOrSign(address, "list-notifications", (msg) => signRef.current({ message: msg }));
        const data = await api.listNotifications(address, auth.sig, auth.minute);
        setNotifications(data.notifications);
        setUnread(0);
        void api.markNotificationsRead(address, auth.sig, auth.minute);
      } catch {
        // sign rejected
      }
    }
  }

  if (!authenticated) return null;

  return (
    <div className={styles.wrap} ref={panelRef}>
      <button className={styles.bell} onClick={handleOpen} aria-label="Notifications">
        🔔
        {unread > 0 && (
          <span className={styles.badge}>{unread > 99 ? "99+" : unread}</span>
        )}
      </button>

      {open && (
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <span className={styles.panelTitle}>Notifications</span>
          </div>
          <div className={styles.panelList}>
            {notifications.length === 0 ? (
              <div className={styles.empty}>no notifications yet</div>
            ) : (
              notifications.map((n) => (
                <div key={n.id} className={`${styles.item} ${!n.read_at ? styles.itemUnread : ""}`}>
                  <div className={styles.itemTop}>
                    <span className={styles.itemTitle}>
                      <span className={`${styles.itemDot} ${dotClass(n.type)}`} />
                      {n.title}
                    </span>
                    <span className={styles.itemTime}>{relativeTime(n.created_at)}</span>
                  </div>
                  <span className={styles.itemBody}>{n.body}</span>
                  {n.tx_hash && (
                    <a
                      className={styles.itemTx}
                      href={`${ARBISCAN}${n.tx_hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {n.tx_hash.slice(0, 14)}…{n.tx_hash.slice(-8)} ↗
                    </a>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

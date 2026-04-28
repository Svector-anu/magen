import { useState, useEffect } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useAccount } from "wagmi";
import styles from "./NotificationBanner.module.css";
import { OPT_IN_KEY } from "./EmailOptInModal.js";

const AUTO_CLOSE_MS = 12000;

interface Props {
  onEnable: () => void;
  forceHide?: boolean;
}

export function NotificationBanner({ onEnable, forceHide }: Props) {
  const { authenticated } = usePrivy();
  const { address } = useAccount();

  const [optedIn, setOptedIn] = useState(false);
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  const [sessionDismissed, setSessionDismissed] = useState(false);

  useEffect(() => {
    // Re-read localStorage on every wallet change — no stale mount-time snapshot
    setOptedIn(localStorage.getItem(OPT_IN_KEY) === "1");
    setSessionDismissed(false);
  }, [address]);

  useEffect(() => {
    if (!authenticated || optedIn || forceHide || sessionDismissed) {
      setVisible(false);
      setClosing(false);
      return;
    }
    const t = setTimeout(() => setVisible(true), 1200);
    return () => {
      clearTimeout(t);
    };
  }, [authenticated, address, optedIn, forceHide, sessionDismissed]);

  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => handleDismiss(), AUTO_CLOSE_MS);
    return () => clearTimeout(t);
  }, [visible]);

  function handleDismiss() {
    if (closing) return;
    setClosing(true);
    setTimeout(() => {
      setVisible(false);
      setClosing(false);
      setSessionDismissed(true);
    }, 380);
  }

  function handleEnable() {
    setClosing(true);
    setTimeout(() => {
      setVisible(false);
      setClosing(false);
      setSessionDismissed(true);
    }, 380);
    onEnable();
  }

  if (!visible && !closing) return null;

  return (
    <div className={`${styles.island} ${closing ? styles.closing : ""}`}>
      <span className={styles.dot} />
      <span className={styles.text}>Enable email alerts for payments</span>
      <button className={styles.btnEnable} onClick={handleEnable}>Enable</button>
      <button className={styles.btnDismiss} onClick={handleDismiss} aria-label="Dismiss">✕</button>
    </div>
  );
}

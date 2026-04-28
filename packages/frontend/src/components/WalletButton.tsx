import { useEffect, useState } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useAccount } from "wagmi";
import styles from "./WalletButton.module.css";

export function WalletButton() {
  const { ready, authenticated, login, logout } = usePrivy();
  const { wallets } = useWallets();
  const { address: wagmiAddress } = useAccount();
  const [stale, setStale] = useState(false);

  // wagmi may lag behind Privy by a render cycle — use Privy wallet as fallback
  const address = wagmiAddress ?? (wallets[0]?.address as `0x${string}` | undefined);
  const isConnecting = ready && authenticated && !address;

  // If authenticated but no address resolves within 4s, session is stale — offer escape
  useEffect(() => {
    if (!isConnecting) { setStale(false); return; }
    const t = setTimeout(() => setStale(true), 4000);
    return () => clearTimeout(t);
  }, [isConnecting]);

  if (!ready) return null;

  if (authenticated && address) {
    return (
      <button className={styles.connected} onClick={() => void logout()}>
        <span className={styles.dot} />
        {address.slice(0, 6)}…{address.slice(-4)}
      </button>
    );
  }

  if (stale) {
    return (
      <button className={styles.connect} onClick={() => void logout()}>
        reconnect →
      </button>
    );
  }

  if (authenticated) {
    return (
      <button className={styles.connected} disabled>
        <span className={styles.dot} />
        connecting…
      </button>
    );
  }

  return (
    <button className={styles.connect} onClick={login}>
      sign in
    </button>
  );
}

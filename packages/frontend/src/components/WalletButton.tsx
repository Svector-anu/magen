import { useAccount, useDisconnect } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import styles from "./WalletButton.module.css";

export function WalletButton() {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { openConnectModal } = useConnectModal();

  if (isConnected && address) {
    return (
      <button className={styles.connected} onClick={() => disconnect()}>
        <span className={styles.dot} />
        {address.slice(0, 6)}…{address.slice(-4)}
      </button>
    );
  }

  return (
    <button className={styles.connect} onClick={openConnectModal}>
      connect_wallet
    </button>
  );
}

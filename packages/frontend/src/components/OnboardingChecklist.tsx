import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useAccount, useBalance } from "wagmi";
import { useUsdcBalance, formatUsdc } from "../hooks/useWrapUsdc.js";
import { WrapUsdcModal } from "./WrapUsdcModal.js";
import styles from "./OnboardingChecklist.module.css";

const DISMISS_KEY = "magen_onboarding_v1_dismissed";
const MIN_ETH_WEI = 500_000_000_000_000n; // 0.0005 ETH

export function OnboardingChecklist() {
  const { authenticated } = usePrivy();
  const { address } = useAccount();
  const [dismissed, setDismissed] = useState(() => !!localStorage.getItem(DISMISS_KEY));
  const [showWrap, setShowWrap] = useState(false);

  const { data: ethBalance } = useBalance({ address });
  const { data: usdcBalance } = useUsdcBalance(address);

  if (!authenticated || !address || dismissed) return null;

  const hasEth  = ethBalance !== undefined && ethBalance.value >= MIN_ETH_WEI;
  const hasUsdc = usdcBalance !== undefined && usdcBalance > 0n;
  const allReady = hasEth && hasUsdc;

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  }

  return (
    <>
      {showWrap && <WrapUsdcModal onClose={() => setShowWrap(false)} onSuccess={dismiss} />}
      <div className={styles.card}>
        <div className={styles.header}>
          <span className={styles.title}>before your first payment</span>
          <button className={styles.dismissBtn} onClick={dismiss} aria-label="dismiss">
            {allReady ? "got it ✓" : "skip"}
          </button>
        </div>

        <div className={styles.steps}>
          {/* Step 1: ETH for gas */}
          <div className={`${styles.step} ${hasEth ? styles.stepDone : styles.stepPending}`}>
            <span className={styles.stepIcon}>{hasEth ? "✓" : "1"}</span>
            <div className={styles.stepBody}>
              <span className={styles.stepLabel}>gas (ETH)</span>
              <span className={styles.stepDesc}>
                {hasEth
                  ? `${Number(ethBalance!.formatted).toFixed(4)} ETH — good`
                  : "need ETH for on-chain transactions"}
              </span>
            </div>
            {!hasEth && (
              <a
                className={styles.actionLink}
                href="https://www.alchemy.com/faucets/arbitrum-sepolia"
                target="_blank"
                rel="noopener noreferrer"
              >
                faucet ↗
              </a>
            )}
          </div>

          {/* Step 2: USDC */}
          <div className={`${styles.step} ${hasUsdc ? styles.stepDone : styles.stepPending}`}>
            <span className={styles.stepIcon}>{hasUsdc ? "✓" : "2"}</span>
            <div className={styles.stepBody}>
              <span className={styles.stepLabel}>testnet USDC</span>
              <span className={styles.stepDesc}>
                {hasUsdc
                  ? `${formatUsdc(usdcBalance!)} USDC available`
                  : "need USDC to fund payments"}
              </span>
            </div>
            {!hasUsdc && (
              <a
                className={styles.actionLink}
                href="https://faucet.circle.com"
                target="_blank"
                rel="noopener noreferrer"
              >
                faucet ↗
              </a>
            )}
          </div>

          {/* Step 3: Wrap */}
          <div className={`${styles.step} ${styles.stepPending}`}>
            <span className={styles.stepIcon}>3</span>
            <div className={styles.stepBody}>
              <span className={styles.stepLabel}>wrap USDC → mwUSDC</span>
              <span className={styles.stepDesc}>
                {hasUsdc
                  ? "convert USDC to the confidential token Magen uses"
                  : "complete step 2 first"}
              </span>
            </div>
            {hasUsdc && (
              <button className={styles.actionBtn} onClick={() => setShowWrap(true)}>
                wrap →
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

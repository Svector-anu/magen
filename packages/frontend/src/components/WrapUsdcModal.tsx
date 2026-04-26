import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { useUsdcBalance, useUsdcAllowance, useApproveUsdc, useWrap, formatUsdc } from "../hooks/useWrapUsdc.js";
import styles from "./WrapUsdcModal.module.css";

interface Props {
  onClose: () => void;
}

export function WrapUsdcModal({ onClose }: Props) {
  const { address } = useAccount();
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<"input" | "approving" | "wrapping" | "done">("input");
  const [txHash, setTxHash] = useState<string | null>(null);

  const { data: usdcBalance, refetch: refetchBalance } = useUsdcBalance(address);
  const { data: allowance, refetch: refetchAllowance } = useUsdcAllowance(address);
  const approve = useApproveUsdc();
  const wrap = useWrap();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Approve confirmed → move to wrap step
  useEffect(() => {
    if (approve.isSuccess && step === "approving") {
      void refetchAllowance();
      setStep("wrapping");
    }
  }, [approve.isSuccess, step, refetchAllowance]);

  // Wrap confirmed → done
  useEffect(() => {
    if (wrap.isSuccess && step === "wrapping" && wrap.hash) {
      setTxHash(wrap.hash);
      setStep("done");
      void refetchBalance();
    }
  }, [wrap.isSuccess, step, wrap.hash, refetchBalance]);

  const balanceFormatted = usdcBalance !== undefined ? formatUsdc(usdcBalance) : null;
  const amountBigint = amount ? BigInt(Math.round(parseFloat(amount) * 1_000_000)) : 0n;
  const needsApproval = allowance !== undefined && amountBigint > 0n && allowance < amountBigint;
  const canProceed = amountBigint > 0n && usdcBalance !== undefined && amountBigint <= usdcBalance;

  function handleMaxClick() {
    if (usdcBalance !== undefined) setAmount(formatUsdc(usdcBalance));
  }

  function handleSubmit() {
    if (!address || !canProceed) return;
    if (needsApproval) {
      setStep("approving");
      approve.approve(amount);
    } else {
      setStep("wrapping");
      wrap.wrap(address, amount);
    }
  }

  function handleWrapAfterApproval() {
    if (!address) return;
    wrap.wrap(address, amount);
  }

  const isLoading = approve.isPending || approve.isConfirming || wrap.isPending || wrap.isConfirming;

  return (
    <div className={styles.backdrop} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal} role="dialog" aria-modal="true">
        <div className={styles.header}>
          <span className={styles.title}>wrap usdc</span>
          <button className={styles.closeBtn} onClick={onClose} aria-label="close">✕</button>
        </div>

        <div className={styles.body}>
          {step === "done" ? (
            <div className={styles.doneBlock}>
              <div className={styles.doneIcon}>✓</div>
              <div className={styles.doneText}>wrapped successfully</div>
              <div className={styles.doneAmount}>{amount} mwUSDC added to your account</div>
              {txHash && (
                <a
                  className={styles.txLink}
                  href={`https://sepolia.arbiscan.io/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {txHash.slice(0, 16)}…{txHash.slice(-8)} ↗
                </a>
              )}
              <button className={styles.btnPrimary} onClick={onClose}>done</button>
            </div>
          ) : (
            <>
              <div className={styles.explain}>
                Convert regular USDC into confidential mwUSDC so Magen can execute private payments on your behalf.
              </div>

              <div className={styles.balanceRow}>
                <span className={styles.balanceLabel}>your USDC balance</span>
                <span className={styles.balanceVal}>
                  {balanceFormatted !== null ? `${balanceFormatted} USDC` : "—"}
                </span>
              </div>

              <div className={styles.inputRow}>
                <input
                  className={styles.amountInput}
                  type="number"
                  min="0"
                  step="0.000001"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={isLoading}
                />
                <button className={styles.maxBtn} onClick={handleMaxClick} disabled={isLoading}>
                  max
                </button>
              </div>

              {step === "approving" && (
                <div className={styles.stepMsg}>
                  {approve.isPending && "Confirm approval in your wallet…"}
                  {approve.isConfirming && "Waiting for approval confirmation…"}
                </div>
              )}

              {step === "wrapping" && (
                <div className={styles.stepMsg}>
                  {!wrap.isPending && !wrap.isConfirming && (
                    <button className={styles.btnPrimary} onClick={handleWrapAfterApproval}>
                      confirm wrap transaction
                    </button>
                  )}
                  {wrap.isPending && "Confirm wrap in your wallet…"}
                  {wrap.isConfirming && "Wrapping USDC on-chain…"}
                </div>
              )}

              {(approve.error || wrap.error) && (
                <div className={styles.errorMsg}>
                  {String(approve.error ?? wrap.error)}
                </div>
              )}

              {step === "input" && (
                <button
                  className={styles.btnPrimary}
                  onClick={handleSubmit}
                  disabled={!canProceed || isLoading}
                >
                  {needsApproval ? "approve & wrap" : "wrap USDC"}
                </button>
              )}

              <div className={styles.note}>
                {needsApproval
                  ? "Two transactions: approve spending, then wrap. Both require small gas."
                  : "One transaction required. Small gas fee on Arbitrum Sepolia."}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

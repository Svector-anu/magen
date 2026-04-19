import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import type { DisbursementPolicy } from "@magen/shared";
import { WRAPPED_USDC_ABI, WRAPPED_USDC_ADDRESS, VAULT_ADDRESS } from "../lib/contracts.js";

export function useIsOperator(holder: `0x${string}` | undefined) {
  return useReadContract({
    address: WRAPPED_USDC_ADDRESS ?? undefined,
    abi: WRAPPED_USDC_ABI,
    functionName: "isOperator",
    args: holder && VAULT_ADDRESS ? [holder, VAULT_ADDRESS] : undefined,
    query: { enabled: !!holder && !!WRAPPED_USDC_ADDRESS && !!VAULT_ADDRESS },
  });
}

export function useSetOperator() {
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  function setOperator(deadline: number) {
    if (!WRAPPED_USDC_ADDRESS || !VAULT_ADDRESS) return;
    writeContract({
      address: WRAPPED_USDC_ADDRESS,
      abi: WRAPPED_USDC_ABI,
      functionName: "setOperator",
      args: [VAULT_ADDRESS, deadline],
    });
  }

  return { setOperator, hash, isPending, isConfirming, isSuccess, error, reset };
}

export function computeDeadline(policy: DisbursementPolicy): number {
  if (policy.approval_mode === "approve-for-period" && policy.approval_period_end) {
    return Math.floor(new Date(policy.approval_period_end).getTime() / 1000);
  }
  if (policy.approval_mode === "continue-until-revoked") {
    return Math.floor(new Date("2099-01-01T00:00:00Z").getTime() / 1000);
  }
  if (policy.end_date) {
    return Math.floor(new Date(policy.end_date).getTime() / 1000);
  }
  return Math.floor(Date.now() / 1000) + 7 * 24 * 3600;
}

export function deadlineLabel(policy: DisbursementPolicy): string {
  if (policy.approval_mode === "continue-until-revoked") return "until revoked";
  const ts = computeDeadline(policy);
  return new Date(ts * 1000).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

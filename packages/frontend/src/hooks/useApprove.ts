import { useReadContract, useWriteContract, useWaitForTransactionReceipt, useEstimateFeesPerGas } from "wagmi";
import { arbitrumSepolia } from "wagmi/chains";
import { WRAPPED_USDC_ABI, WRAPPED_USDC_ADDRESS, VAULT_ADDRESS } from "../lib/contracts.js";

export { computeDeadline, deadlineLabel } from "../lib/policy.js";

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
  const { data: feeData } = useEstimateFeesPerGas({ chainId: arbitrumSepolia.id });

  function setOperator(deadline: number) {
    if (!WRAPPED_USDC_ADDRESS || !VAULT_ADDRESS) return;
    // 2× buffer on the live maxFeePerGas so stale estimates never fall below baseFee
    const maxFeePerGas = feeData?.maxFeePerGas ? feeData.maxFeePerGas * 2n : undefined;
    writeContract({
      address: WRAPPED_USDC_ADDRESS,
      abi: WRAPPED_USDC_ABI,
      functionName: "setOperator",
      args: [VAULT_ADDRESS, deadline],
      chainId: arbitrumSepolia.id,
      ...(maxFeePerGas !== undefined && { maxFeePerGas }),
    });
  }

  return { setOperator, hash, isPending, isConfirming, isSuccess, error, reset };
}

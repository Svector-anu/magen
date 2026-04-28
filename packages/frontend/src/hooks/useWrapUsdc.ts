import { useReadContract, useWriteContract, useWaitForTransactionReceipt, useEstimateFeesPerGas } from "wagmi";
import { arbitrumSepolia } from "wagmi/chains";
import { parseUnits } from "viem";
import { USDC_ABI, USDC_ADDRESS, WRAPPED_USDC_ABI, WRAPPED_USDC_ADDRESS } from "../lib/contracts.js";

const USDC_DECIMALS = 6;

export function useUsdcBalance(address: `0x${string}` | undefined) {
  return useReadContract({
    address: USDC_ADDRESS ?? undefined,
    abi: USDC_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!USDC_ADDRESS },
  });
}

export function useUsdcAllowance(owner: `0x${string}` | undefined) {
  return useReadContract({
    address: USDC_ADDRESS ?? undefined,
    abi: USDC_ABI,
    functionName: "allowance",
    args: owner && WRAPPED_USDC_ADDRESS ? [owner, WRAPPED_USDC_ADDRESS] : undefined,
    query: { enabled: !!owner && !!USDC_ADDRESS && !!WRAPPED_USDC_ADDRESS },
  });
}

export function useApproveUsdc() {
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });
  const { data: feeData } = useEstimateFeesPerGas({ chainId: arbitrumSepolia.id });

  function approve(amountUsdc: string) {
    if (!USDC_ADDRESS || !WRAPPED_USDC_ADDRESS) return;
    const [, frac = ""] = amountUsdc.split(".");
    if (frac.length > USDC_DECIMALS) throw new Error(`USDC has ${USDC_DECIMALS} decimal places — got ${frac.length}`);
    const amount = parseUnits(amountUsdc, USDC_DECIMALS);
    const maxFeePerGas = feeData?.maxFeePerGas ? feeData.maxFeePerGas * 2n : undefined;
    writeContract({
      address: USDC_ADDRESS,
      abi: USDC_ABI,
      functionName: "approve",
      args: [WRAPPED_USDC_ADDRESS, amount],
      chainId: arbitrumSepolia.id,
      ...(maxFeePerGas !== undefined && { maxFeePerGas }),
    });
  }

  return { approve, hash, isPending, isConfirming, isSuccess, error, reset };
}

export function useWrap() {
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });
  const { data: feeData } = useEstimateFeesPerGas({ chainId: arbitrumSepolia.id });

  function wrap(to: `0x${string}`, amountUsdc: string) {
    if (!WRAPPED_USDC_ADDRESS) return;
    const [, frac = ""] = amountUsdc.split(".");
    if (frac.length > USDC_DECIMALS) throw new Error(`USDC has ${USDC_DECIMALS} decimal places — got ${frac.length}`);
    const amount = parseUnits(amountUsdc, USDC_DECIMALS);
    const maxFeePerGas = feeData?.maxFeePerGas ? feeData.maxFeePerGas * 2n : undefined;
    writeContract({
      address: WRAPPED_USDC_ADDRESS,
      abi: WRAPPED_USDC_ABI,
      functionName: "wrap",
      args: [to, amount],
      chainId: arbitrumSepolia.id,
      ...(maxFeePerGas !== undefined && { maxFeePerGas }),
    });
  }

  return { wrap, hash, isPending, isConfirming, isSuccess, error, reset };
}

export function formatUsdc(raw: bigint): string {
  const whole = raw / 1_000_000n;
  const frac = raw % 1_000_000n;
  return `${whole}.${frac.toString().padStart(6, "0").replace(/0+$/, "") || "00"}`;
}

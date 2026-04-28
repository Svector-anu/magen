import { useState, useCallback, useRef } from "react";
import { useReadContract, useWriteContract, useWaitForTransactionReceipt, useWalletClient } from "wagmi";
import { parseEventLogs } from "viem";
import { arbitrumSepolia } from "wagmi/chains";
import { createViemHandleClient } from "@iexec-nox/handle";
import type { Handle } from "@iexec-nox/handle";
import { WRAPPED_USDC_ABI, WRAPPED_USDC_ADDRESS } from "../lib/contracts.js";

const ZERO_HANDLE = "0x0000000000000000000000000000000000000000000000000000000000000000";

export function useConfidentialBalance(address: `0x${string}` | undefined) {
  return useReadContract({
    address: WRAPPED_USDC_ADDRESS ?? undefined,
    abi: WRAPPED_USDC_ABI,
    functionName: "confidentialBalanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!WRAPPED_USDC_ADDRESS },
  });
}

export function useUnwrap() {
  const { data: walletClient } = useWalletClient();
  const walletClientRef = useRef(walletClient);
  walletClientRef.current = walletClient;

  const [decryptedBalance, setDecryptedBalance] = useState<bigint | null>(null);
  const [decryptedZero, setDecryptedZero] = useState(false);
  const [decrypting, setDecrypting] = useState(false);
  const [decryptError, setDecryptError] = useState<string | null>(null);

  const [proofPending, setProofPending] = useState(false);
  const [proofError, setProofError] = useState<string | null>(null);

  const {
    writeContract: writeUnwrap,
    data: unwrapHash,
    isPending: isUnwrapPending,
    error: unwrapWriteError,
    reset: resetUnwrap,
  } = useWriteContract();

  const {
    isLoading: isUnwrapConfirming,
    isSuccess: isUnwrapConfirmed,
    data: unwrapReceipt,
  } = useWaitForTransactionReceipt({ hash: unwrapHash });

  const {
    writeContract: writeFinalize,
    data: finalizeHash,
    isPending: isFinalizePending,
    error: finalizeWriteError,
    reset: resetFinalize,
  } = useWriteContract();

  const {
    isLoading: isFinalizeConfirming,
    isSuccess: isFinalizeConfirmed,
  } = useWaitForTransactionReceipt({ hash: finalizeHash });

  const decryptBalance = useCallback(async (handle: `0x${string}`) => {
    const wc = walletClientRef.current;
    if (!wc) return;
    setDecrypting(true);
    setDecryptError(null);
    setDecryptedZero(false);
    try {
      const client = await createViemHandleClient(wc);
      const { value } = await client.decrypt(handle as Handle<"uint256">);
      if ((value as bigint) === 0n) {
        setDecryptedZero(true);
        return;
      }
      setDecryptedBalance(value as bigint);
    } catch (e) {
      setDecryptError(e instanceof Error ? e.message : "Balance decryption failed");
    } finally {
      setDecrypting(false);
    }
  }, []);

  const startUnwrap = useCallback((from: `0x${string}`, balanceHandle: `0x${string}`) => {
    if (!WRAPPED_USDC_ADDRESS) return;
    writeUnwrap({
      address: WRAPPED_USDC_ADDRESS,
      abi: WRAPPED_USDC_ABI,
      functionName: "unwrap",
      args: [from, from, balanceHandle],
      chainId: arbitrumSepolia.id,
    });
  }, [writeUnwrap]);

  const parseRequestId = useCallback((): `0x${string}` | null => {
    if (!unwrapReceipt) return null;
    try {
      const logs = parseEventLogs({
        abi: WRAPPED_USDC_ABI,
        eventName: "UnwrapRequested",
        logs: unwrapReceipt.logs,
      });
      if (logs.length > 0) {
        return (logs[0].args as { amount: `0x${string}` }).amount;
      }
    } catch (e) {
      console.error("[parseRequestId] UnwrapRequested log parse failed:", e);
    }
    return null;
  }, [unwrapReceipt]);

  const finalizeUnwrap = useCallback(async (requestId: `0x${string}`) => {
    const wc = walletClientRef.current;
    if (!wc || !WRAPPED_USDC_ADDRESS) return;
    setProofPending(true);
    setProofError(null);
    try {
      const client = await createViemHandleClient(wc);

      // The TEE gateway needs time to index the UnwrapRequested event before
      // it can provide a public decryption proof. Retry with backoff.
      const MAX_POLL = 12;
      const POLL_DELAY_MS = 5_000;
      let decryptionProof: `0x${string}` | undefined;
      for (let attempt = 0; attempt < MAX_POLL; attempt++) {
        if (attempt > 0) {
          await new Promise<void>((r) => setTimeout(r, POLL_DELAY_MS));
        }
        try {
          const result = await client.publicDecrypt(requestId as Handle<"uint256">);
          decryptionProof = result.decryptionProof as `0x${string}`;
          break;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          const notReady =
            msg.includes("does not exist") ||
            msg.includes("not publicly decryptable") ||
            msg.includes("not found");
          if (!notReady || attempt === MAX_POLL - 1) throw e;
        }
      }

      writeFinalize({
        address: WRAPPED_USDC_ADDRESS,
        abi: WRAPPED_USDC_ABI,
        functionName: "finalizeUnwrap",
        args: [requestId, decryptionProof!],
        chainId: arbitrumSepolia.id,
      });
    } catch (e) {
      setProofError(e instanceof Error ? e.message : "TEE decryption proof failed");
    } finally {
      setProofPending(false);
    }
  }, [writeFinalize]);

  const reset = useCallback(() => {
    resetUnwrap();
    resetFinalize();
    setDecryptedBalance(null);
    setDecryptedZero(false);
    setDecryptError(null);
    setProofError(null);
  }, [resetUnwrap, resetFinalize]);

  return {
    // balance decryption
    decryptBalance,
    decryptedBalance,
    decryptedZero,
    decrypting,
    decryptError,
    // unwrap tx
    startUnwrap,
    unwrapHash,
    isUnwrapPending,
    isUnwrapConfirming,
    isUnwrapConfirmed,
    unwrapWriteError,
    // parse request id from receipt
    parseRequestId,
    // finalize
    finalizeUnwrap,
    proofPending,
    proofError,
    finalizeHash,
    isFinalizePending,
    isFinalizeConfirming,
    isFinalizeConfirmed,
    finalizeWriteError,
    reset,
    ZERO_HANDLE,
  };
}

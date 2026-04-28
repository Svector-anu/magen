import { useChainId, useSwitchChain } from "wagmi";
import { arbitrumSepolia } from "wagmi/chains";

export function WrongChainBanner() {
  const chainId = useChainId();
  const { switchChain, isPending } = useSwitchChain();

  if (chainId === arbitrumSepolia.id) return null;

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 12,
      padding: "10px 14px",
      background: "rgba(248,113,113,0.12)",
      border: "1px solid rgba(248,113,113,0.35)",
      borderRadius: 8,
      marginBottom: 12,
      fontSize: 13,
      color: "#f87171",
    }}>
      <span>⚠ Wrong network — Magen runs on Arbitrum Sepolia.</span>
      <button
        onClick={() => switchChain({ chainId: arbitrumSepolia.id })}
        disabled={isPending}
        style={{
          marginLeft: "auto",
          padding: "4px 10px",
          background: "rgba(248,113,113,0.2)",
          border: "1px solid rgba(248,113,113,0.5)",
          borderRadius: 6,
          color: "#f87171",
          cursor: "pointer",
          fontSize: 12,
          whiteSpace: "nowrap",
        }}
      >
        {isPending ? "switching…" : "switch network"}
      </button>
    </div>
  );
}

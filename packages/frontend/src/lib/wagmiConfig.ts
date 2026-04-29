import { createConfig } from "@privy-io/wagmi";
import { arbitrumSepolia } from "wagmi/chains";
import { http } from "wagmi";

export const wagmiConfig = createConfig({
  chains: [arbitrumSepolia],
  transports: {
    [arbitrumSepolia.id]: http(import.meta.env.VITE_ARBITRUM_SEPOLIA_RPC || undefined),
  },
});

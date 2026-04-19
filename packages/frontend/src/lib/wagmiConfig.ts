import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { arbitrumSepolia } from "wagmi/chains";

export const wagmiConfig = getDefaultConfig({
  appName: "Magen",
  projectId: "magen-dev",
  chains: [arbitrumSepolia],
  ssr: false,
});

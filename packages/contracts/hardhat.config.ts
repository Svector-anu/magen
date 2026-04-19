import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-ignition";
import dotenv from "dotenv";
dotenv.config({ path: "../../.env" });

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    arbitrumSepolia: {
      type: "http",
      url: process.env.ARBITRUM_SEPOLIA_RPC || "https://sepolia-rollup.arbitrum.io/rpc",
      accounts:
        process.env.PRIVATE_KEY && process.env.PRIVATE_KEY.length === 66
          ? [process.env.PRIVATE_KEY]
          : [],
      chainId: 421614,
    },
  },
};

export default config;

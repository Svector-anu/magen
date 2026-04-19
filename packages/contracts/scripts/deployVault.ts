import { ethers } from "ethers";
import dotenv from "dotenv";
import { readFileSync } from "fs";
import { resolve } from "path";

dotenv.config({ path: resolve(import.meta.dirname, "../../../.env") });

const RPC_URL = process.env.ARBITRUM_SEPOLIA_RPC || "https://sepolia-rollup.arbitrum.io/rpc";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const WRAPPED_USDC = process.env.WRAPPED_USDC_ADDRESS;

if (!PRIVATE_KEY) throw new Error("PRIVATE_KEY not set");
if (!WRAPPED_USDC) throw new Error("WRAPPED_USDC_ADDRESS not set");

function loadArtifact(name: string) {
  return JSON.parse(
    readFileSync(
      resolve(import.meta.dirname, `../artifacts/contracts/${name}.sol/${name}.json`),
      "utf8"
    )
  );
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY!, provider);

  console.log("Deployer:", wallet.address);

  const feeData = await provider.getFeeData();
  const baseFee = feeData.lastBaseFeePerGas ?? ethers.parseUnits("0.1", "gwei");
  const maxFeePerGas = baseFee * 10n;
  const maxPriorityFeePerGas = baseFee;
  const overrides = { maxFeePerGas, maxPriorityFeePerGas };

  // Deploy DisbursementAgent — owner = deployer (API server wallet)
  const agentArtifact = loadArtifact("DisbursementAgent");
  const agentFactory = new ethers.ContractFactory(agentArtifact.abi, agentArtifact.bytecode, wallet);
  console.log("Deploying DisbursementAgent...");
  const agent = await agentFactory.deploy(wallet.address, overrides);
  await agent.waitForDeployment();
  const agentAddress = await agent.getAddress();
  console.log("DisbursementAgent:", agentAddress);

  // Deploy DisbursementVault — payer = deployer wallet (test vault)
  const vaultArtifact = loadArtifact("DisbursementVault");
  const vaultFactory = new ethers.ContractFactory(vaultArtifact.abi, vaultArtifact.bytecode, wallet);
  console.log("Deploying DisbursementVault...");
  const vault = await vaultFactory.deploy(WRAPPED_USDC, agentAddress, wallet.address, overrides);
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log("DisbursementVault:", vaultAddress);

  console.log("\n── Add to .env ──────────────────────────────");
  console.log(`DISBURSEMENT_AGENT_ADDRESS=${agentAddress}`);
  console.log(`DISBURSEMENT_VAULT_ADDRESS=${vaultAddress}`);
  console.log("\n── Add to packages/frontend/.env ────────────");
  console.log(`VITE_WRAPPED_USDC_ADDRESS=${WRAPPED_USDC}`);
  console.log(`VITE_VAULT_ADDRESS=${vaultAddress}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

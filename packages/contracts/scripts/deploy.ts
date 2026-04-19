import { ethers } from "ethers";
import dotenv from "dotenv";
import { readFileSync } from "fs";
import { resolve } from "path";

dotenv.config({ path: resolve(import.meta.dirname, "../../../.env") });

const RPC_URL =
  process.env.ARBITRUM_SEPOLIA_RPC || "https://sepolia-rollup.arbitrum.io/rpc";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const USDC_ADDRESS = process.env.USDC_ADDRESS;

if (!PRIVATE_KEY) throw new Error("PRIVATE_KEY not set in .env");
if (!USDC_ADDRESS) throw new Error("USDC_ADDRESS not set in .env");

const artifactPath = resolve(
  import.meta.dirname,
  "../artifacts/contracts/WrappedUSDC.sol/WrappedUSDC.json"
);

const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY!, provider);

  console.log("Deployer:", wallet.address);

  const feeData = await provider.getFeeData();
  const baseFee = feeData.lastBaseFeePerGas ?? ethers.parseUnits("0.1", "gwei");
  const maxFeePerGas = baseFee * 10n;
  const maxPriorityFeePerGas = baseFee;

  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const contract = await factory.deploy(USDC_ADDRESS, {
    maxFeePerGas,
    maxPriorityFeePerGas,
  });

  console.log("Deploying WrappedUSDC...");
  await contract.waitForDeployment();
  const address = await contract.getAddress();

  console.log("WrappedUSDC deployed to:", address);
  console.log(
    "Verify: https://sepolia.arbiscan.io/address/" + address
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

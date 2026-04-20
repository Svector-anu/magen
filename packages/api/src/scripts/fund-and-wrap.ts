/**
 * fund-and-wrap.ts
 *
 * Approves WrappedUSDC to spend raw USDC and wraps it for the payer.
 * Run after the payer wallet has received Arbitrum Sepolia USDC from the Circle faucet.
 *
 * Usage: WRAP_AMOUNT_USDC=10 npx tsx src/scripts/fund-and-wrap.ts
 */
import { config } from "@dotenvx/dotenvx";
import { resolve } from "path";
config({ path: resolve(import.meta.dirname, "../../../../.env") });
import { JsonRpcProvider, Wallet, Contract } from "ethers";

const USDC_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
];

const WRAPPED_USDC_ABI = [
  "function wrap(address to, uint256 amount) returns (bytes32)",
  "function isOperator(address holder, address spender) view returns (bool)",
];

const GAS_OVERRIDES = {
  maxFeePerGas: 500_000_000n,
  maxPriorityFeePerGas: 1_000_000n,
};

async function main() {
  const rpcUrl = process.env.ARBITRUM_SEPOLIA_RPC!;
  const privateKey = process.env.PRIVATE_KEY!;
  const usdcAddress = process.env.USDC_ADDRESS!;
  const wrappedUsdcAddress = process.env.WRAPPED_USDC_ADDRESS!;
  const vaultAddress = process.env.DISBURSEMENT_VAULT_ADDRESS!;

  const amountUsdc = process.env.WRAP_AMOUNT_USDC ?? "10";
  const amountAtomic = BigInt(Math.round(Number(amountUsdc) * 1_000_000));

  const provider = new JsonRpcProvider(rpcUrl);
  const wallet = new Wallet(privateKey, provider);

  console.log("Wallet:         ", wallet.address);
  console.log("Wrapping:       ", amountUsdc, "USDC →", amountAtomic.toString(), "atomic");

  const usdc = new Contract(usdcAddress, USDC_ABI, wallet);
  const wrappedUsdc = new Contract(wrappedUsdcAddress, WRAPPED_USDC_ABI, wallet);

  // Pre-flight checks
  const balance = await usdc.balanceOf(wallet.address);
  console.log("\nUSDC balance:   ", (Number(balance) / 1e6).toFixed(6), "USDC");
  if (balance < amountAtomic) {
    console.error(`\n✕ Insufficient USDC. Have ${Number(balance) / 1e6}, need ${amountUsdc}.`);
    console.error(`  Get testnet USDC at: https://faucet.circle.com (select Arbitrum Sepolia)`);
    console.error(`  Send to: ${wallet.address}`);
    process.exit(1);
  }

  const isOp = await wrappedUsdc.isOperator(wallet.address, vaultAddress);
  console.log("isOperator:     ", isOp, isOp ? "✓" : "⚠ run setOperator first");

  // Step 1: Approve
  const allowance = await usdc.allowance(wallet.address, wrappedUsdcAddress);
  if (allowance < amountAtomic) {
    console.log("\n[1/2] Approving WrappedUSDC to spend USDC...");
    const approveTx = await usdc.approve(wrappedUsdcAddress, amountAtomic, GAS_OVERRIDES);
    console.log("      tx sent:", approveTx.hash);
    await approveTx.wait();
    console.log("      ✓ approved");
  } else {
    console.log("\n[1/2] Allowance already sufficient, skipping approve.");
  }

  // Step 2: Wrap
  console.log("\n[2/2] Wrapping USDC → WrappedUSDC...");
  const wrapTx = await wrappedUsdc.wrap(wallet.address, amountAtomic, GAS_OVERRIDES);
  console.log("      tx sent:", wrapTx.hash);
  const receipt = await wrapTx.wait();
  console.log("      ✓ wrapped —", `https://sepolia.arbiscan.io/tx/${receipt.hash}`);
  console.log("\nPayer now has WrappedUSDC. Execute a policy to verify.");
}

main().catch((err) => {
  console.error("Error:", err.message ?? err);
  process.exit(1);
});

import { config } from "@dotenvx/dotenvx";
import { resolve } from "path";
config({ path: resolve(import.meta.dirname, "../../../../.env") });
import { JsonRpcProvider, Contract, Wallet } from "ethers";

const provider = new JsonRpcProvider(process.env.ARBITRUM_SEPOLIA_RPC!);
const wallet = new Wallet(process.env.PRIVATE_KEY!, provider);

console.log("API wallet:", wallet.address);
console.log("ETH balance:", (await provider.getBalance(wallet.address)).toString());

const vault = new Contract(process.env.DISBURSEMENT_VAULT_ADDRESS!, [
  "function payer() view returns (address)",
  "function agent() view returns (address)",
  "function wrappedUsdc() view returns (address)",
], provider);

const [payer, vaultAgent, wrappedUsdcAddr] = await Promise.all([vault.payer(), vault.agent(), vault.wrappedUsdc()]);
console.log("\nvault.payer:     ", payer);
console.log("vault.agent:     ", vaultAgent);
console.log("vault.wrappedUsdc:", wrappedUsdcAddr);

const agentContract = new Contract(process.env.DISBURSEMENT_AGENT_ADDRESS!, [
  "function owner() view returns (address)",
], provider);
console.log("agent.owner:     ", await agentContract.owner());

const usdc = new Contract(process.env.USDC_ADDRESS!, [
  "function balanceOf(address) view returns (uint256)",
], provider);
const payerBal = await usdc.balanceOf(payer);
console.log("\npayer USDC balance:", (Number(payerBal) / 1e6).toFixed(6), "USDC (raw:", payerBal.toString() + ")");

const wrappedUsdc = new Contract(wrappedUsdcAddr, [
  "function isOperator(address holder, address spender) view returns (bool)",
], provider);
const isOp = await wrappedUsdc.isOperator(payer, process.env.DISBURSEMENT_VAULT_ADDRESS!);
console.log("isOperator(payer, vault):", isOp);

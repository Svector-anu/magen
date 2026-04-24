import { JsonRpcProvider, Wallet, Contract, Interface, id as keccak256Id, getAddress } from "ethers";
import { createEthersHandleClient } from "@iexec-nox/handle";
import type { Handle } from "@iexec-nox/handle";

const NOX_GATEWAY =
  process.env.NOX_GATEWAY_URL ??
  "https://2e1800fc0dddeeadc189283ed1dce13c1ae28d48-3000.apps.ovh-tdx-dev.noxprotocol.dev";

async function encryptForVault(params: {
  atomicAmount: bigint;
  vaultAddress: string;
  wrappedUsdcAddress: string;
}): Promise<{ handle: string; handleProof: string }> {
  const { atomicAmount, vaultAddress, wrappedUsdcAddress } = params;

  const valueHex = "0x" + atomicAmount.toString(16).padStart(64, "0");

  const res = await fetch(`${NOX_GATEWAY}/v0/secrets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      value: valueHex,
      solidityType: "uint256",
      applicationContract: wrappedUsdcAddress,
      owner: vaultAddress,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Nox gateway error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as { payload?: { handle: string; proof: string }; handle?: string; proof?: string };
  const handle = data.payload?.handle ?? data.handle;
  const proof = data.payload?.proof ?? data.proof;

  if (!handle || !proof) {
    throw new Error(`Nox gateway missing handle/proof: ${JSON.stringify(data)}`);
  }

  return { handle, handleProof: proof };
}

const AGENT_ABI = [
  {
    inputs: [
      { internalType: "address", name: "vault", type: "address" },
      { internalType: "address", name: "recipient", type: "address" },
      { internalType: "address", name: "payer", type: "address" },
      { internalType: "externalEuint256", name: "encryptedAmount", type: "bytes32" },
      { internalType: "bytes", name: "inputProof", type: "bytes" },
      { internalType: "bytes32", name: "policyId", type: "bytes32" },
    ],
    name: "execute",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "vault", type: "address" },
      { indexed: true, internalType: "bytes32", name: "policyId", type: "bytes32" },
      { indexed: false, internalType: "bytes32", name: "transferredHandle", type: "bytes32" },
    ],
    name: "ExecutionRouted",
    type: "event",
  },
] as const;

const AGENT_IFACE = new Interface(AGENT_ABI as unknown as never[]);

function usdcToAtomic(amountUsdc: string): bigint {
  const [whole, frac = ""] = amountUsdc.split(".");
  const fracPadded = frac.padEnd(6, "0").slice(0, 6);
  return BigInt(whole) * 1_000_000n + BigInt(fracPadded);
}

export interface ExecuteResult {
  txHash: string;
}

export async function executePolicy(params: {
  policyId: string;
  payerWallet: string;
  recipientWallet: string;
  amountUsdc: string;
  vaultAddress: string;
}): Promise<ExecuteResult> {
  const { policyId, payerWallet, recipientWallet, amountUsdc, vaultAddress } = params;

  const rpcUrl = process.env.ARBITRUM_SEPOLIA_RPC;
  const privateKey = process.env.PRIVATE_KEY;
  const agentAddress = process.env.DISBURSEMENT_AGENT_ADDRESS;
  const wrappedUsdcAddress = process.env.WRAPPED_USDC_ADDRESS;

  if (!rpcUrl || !privateKey || !agentAddress || !wrappedUsdcAddress) {
    throw new Error("Missing required env: ARBITRUM_SEPOLIA_RPC, PRIVATE_KEY, DISBURSEMENT_AGENT_ADDRESS, WRAPPED_USDC_ADDRESS");
  }

  const provider = new JsonRpcProvider(rpcUrl);
  const wallet = new Wallet(privateKey, provider);

  const atomicAmount = usdcToAtomic(amountUsdc);
  const checksummedPayer = getAddress(payerWallet.toLowerCase());
  const checksummedRecipient = getAddress(recipientWallet.toLowerCase());
  const checksummedVault = getAddress(vaultAddress.toLowerCase());

  const { handle, handleProof } = await encryptForVault({
    atomicAmount,
    vaultAddress: checksummedVault,
    wrappedUsdcAddress: getAddress(wrappedUsdcAddress),
  });

  const agent = new Contract(agentAddress, AGENT_ABI as unknown as never[], wallet);
  const policyIdBytes32 = keccak256Id(policyId);

  const tx = await agent.execute(
    checksummedVault,
    checksummedPayer,
    checksummedRecipient,
    handle,
    handleProof,
    policyIdBytes32,
  );

  const receipt = await tx.wait();

  const routedLog = receipt.logs
    .map((log: { topics: string[]; data: string }) => {
      try { return AGENT_IFACE.parseLog(log); } catch { return null; }
    })
    .find((parsed: { name: string } | null) => parsed?.name === "ExecutionRouted");

  if (routedLog) {
    const transferredHandle = routedLog.args.transferredHandle as string;
    try {
      const noxClient = await createEthersHandleClient(wallet);
      const { value } = await noxClient.decrypt(transferredHandle as Handle<"uint256">);
      if (value === 0n) {
        throw new Error("Silent zero transfer — vault has insufficient wrapped USDC balance");
      }
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("Silent zero transfer")) throw err;
      console.error("[executePolicy] handle decrypt skipped:", err instanceof Error ? err.message : String(err));
    }
  }

  return { txHash: receipt.hash };
}

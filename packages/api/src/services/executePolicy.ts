import { JsonRpcProvider, Wallet, Contract, id as keccak256Id, getAddress } from "ethers";

const NOX_GATEWAY = "https://2e1800fc0dddeeadc189283ed1dce13c1ae28d48-3000.apps.ovh-tdx-dev.noxprotocol.dev";

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
      { internalType: "externalEuint256", name: "encryptedAmount", type: "bytes32" },
      { internalType: "bytes", name: "inputProof", type: "bytes" },
      { internalType: "bytes32", name: "policyId", type: "bytes32" },
    ],
    name: "execute",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

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
  recipientWallet: string;
  amountUsdc: string;
  vaultAddress: string;
}): Promise<ExecuteResult> {
  const { policyId, recipientWallet, amountUsdc, vaultAddress } = params;

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
  const checksummedRecipient = getAddress(recipientWallet.toLowerCase());
  const checksummedVault = getAddress(vaultAddress.toLowerCase());

  const { handle, handleProof } = await encryptForVault({
    atomicAmount,
    vaultAddress: checksummedVault,
    wrappedUsdcAddress: wrappedUsdcAddress.toLowerCase(),
  });

  const agent = new Contract(agentAddress, AGENT_ABI, wallet);

  const policyIdBytes32 = keccak256Id(policyId);

  const tx = await agent.execute(
    checksummedVault,
    checksummedRecipient,
    handle,
    handleProof,
    policyIdBytes32,
    {
      maxFeePerGas: 500_000_000n,
      maxPriorityFeePerGas: 1_000_000n,
    }
  );

  const receipt = await tx.wait();
  return { txHash: receipt.hash };
}

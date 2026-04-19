export const WRAPPED_USDC_ABI = [
  {
    inputs: [{ internalType: "address", name: "account", type: "address" }],
    name: "confidentialBalanceOf",
    outputs: [{ internalType: "euint256", name: "", type: "bytes32" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "from", type: "address" },
      { internalType: "address", name: "to", type: "address" },
      { internalType: "externalEuint256", name: "encryptedAmount", type: "bytes32" },
      { internalType: "bytes", name: "inputProof", type: "bytes" },
    ],
    name: "confidentialTransferFrom",
    outputs: [{ internalType: "euint256", name: "transferred", type: "bytes32" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "holder", type: "address" },
      { internalType: "address", name: "spender", type: "address" },
    ],
    name: "isOperator",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "operator", type: "address" },
      { internalType: "uint48", name: "until", type: "uint48" },
    ],
    name: "setOperator",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

const rawWrappedUsdc = import.meta.env.VITE_WRAPPED_USDC_ADDRESS as string | undefined;
const rawVault = import.meta.env.VITE_VAULT_ADDRESS as string | undefined;

export const WRAPPED_USDC_ADDRESS =
  rawWrappedUsdc && /^0x[0-9a-fA-F]{40}$/.test(rawWrappedUsdc)
    ? (rawWrappedUsdc as `0x${string}`)
    : null;

export const VAULT_ADDRESS =
  rawVault && /^0x[0-9a-fA-F]{40}$/.test(rawVault)
    ? (rawVault as `0x${string}`)
    : null;

export const CONTRACTS_READY = !!(WRAPPED_USDC_ADDRESS && VAULT_ADDRESS);

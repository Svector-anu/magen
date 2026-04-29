# magen — product overview

---

## 1. what magen is

magen is an AI-powered payment agent that automates recurring USDC transfers on-chain — with encrypted amounts. you describe what you want in plain english. magen handles the rest.

---

## 2. the problem

every transaction on a public blockchain is visible. anyone can see who paid who, how much, and when.

this is a problem when payments are sensitive:

- **salaries and contractor payroll** — amounts reveal compensation structures
- **subscriptions and recurring services** — spending patterns expose business relationships
- **AI agent budgets** — funding an autonomous agent publicly reveals operational spend

magen solves the visibility problem by using fully homomorphic encryption (FHE) to hide transfer amounts while keeping everything else verifiable on-chain.

---

## 3. how magen works

**step 1 — write your intent**
type a payment instruction in plain english:
```
pay svector 500 USDC monthly
send contractor.eth 1200 USDC every friday until June 2026
```

**step 2 — AI parses to policy**
magen's AI layer (powered by openai) extracts recipient, amount, frequency, approval mode, and schedule from your instruction and structures it as a policy.

**step 3 — user approves**
a policy card is generated and shown to you. you review the recipient wallet, amount, and schedule — then approve. during approval, the vault is authorized as an operator on your behalf.

**step 4 — agent executes on schedule**
magen's execution agent polls for due policies and triggers confidential transfers automatically. no manual action required after approval.

**step 5 — amounts stay encrypted**
transfers execute using `confidentialTransferFrom` on the iExec Nox protocol. the amount moved is stored as an FHE-encrypted value — visible to the chain as a transfer event, but the value itself is not readable without the decryption key.

---

## 4. system architecture

magen is built across three distinct layers. understanding the separation is important, especially for agent funding use cases.

### layer 1 — magen (funding + execution)

this is the core of magen:

- **scheduling** — policies define frequency (once, daily, weekly, monthly) and optional end dates
- **confidential transfers** — USDC is wrapped into mwUSDC (ERC-7984), which stores balances as encrypted `euint256` handles on-chain
- **vault / operator model** — a smart contract vault is authorized as an operator on the payer's wallet. the vault can execute `confidentialTransferFrom` within the scope of approved policies
- **execution loop** — a backend agent polls for due policies every 5 seconds, claims jobs, and triggers on-chain execution. failed jobs are retried up to 3 times before the policy is paused

### layer 2 — agent wallet (budget holder)

this is any wallet designated to receive periodic funds from magen:

- receives mwUSDC transfers on schedule
- holds a funded balance (mwUSDC or unwrapped USDC)
- can be a human wallet, a smart contract, or an AI agent's externally-owned account

**note:** if the receiving agent needs standard USDC (not mwUSDC), it must unwrap via the WrappedUSDC contract. magen does not perform this step automatically.

### layer 3 — spending layer (external to magen)

this is what the funded wallet does with its balance — and it is entirely outside magen's scope:

- API payments (e.g. x402, AgentCash)
- third-party subscriptions
- on-chain service fees
- any other autonomous spend

**magen does not control, monitor, or execute anything in this layer.** it is the responsibility of the agent or wallet owner.

---

## 5. agent funding use case

magen can act as a recurring funding source for an AI agent wallet.

**the pattern:**

1. deploy or designate an agent wallet address
2. create a magen policy: `pay [agent wallet] 100 USDC monthly`
3. magen funds the wallet on schedule, privately
4. the agent uses its balance to pay for external services

this gives an AI agent a predictable, automated budget — funded by a human, spent autonomously by the agent.

**important constraints:**

- magen only handles the **funding side**. the agent's spending logic is entirely separate and not built into magen
- if the spending layer requires standard USDC (not mwUSDC), the agent must unwrap its balance first by calling the WrappedUSDC contract
- the agent's autonomy is limited to whatever spending logic it implements externally — magen has no visibility into or control over how the agent spends

**think of magen as a salary stream for an autonomous agent.** it drips funds on a schedule. what the agent does with those funds is up to the agent.

---

## 6. privacy model

| what is visible | what is hidden |
|---|---|
| transfer event (that a transfer occurred) | amount transferred |
| sender and recipient addresses | exact balance of mwUSDC holders |
| policy schedule and frequency | payment size over time |

amounts are encrypted using FHE via iExec's Nox protocol (ERC-7984). balances are stored as `euint256` handles — encrypted ciphertexts that cannot be read from the outside without the key.

wallet addresses remain fully public. only the amounts are hidden.

---

## 7. security model

**non-custodial**
magen never holds user funds. USDC remains in the user's wallet until the moment of transfer.

**scoped operator permissions**
the vault is authorized as an operator via `setOperator(vault, deadline)`. this grants permission to execute `confidentialTransferFrom` — and nothing else. it cannot move funds to arbitrary addresses or exceed the policy's defined parameters.

**policy-bound execution**
every transfer is tied to an approved policy with a defined recipient, amount, and schedule. the execution agent cannot create new policies or modify existing ones.

**pause on failure**
if a job fails permanently (e.g. vault authorization expired, insufficient balance), the policy is automatically paused. no further execution happens until the user manually resumes.

---

## 8. limitations

be aware of the following before building on or with magen:

- **encrypted balances are not readable from the frontend** — `confidentialBalanceOf` returns a handle (bytes32), not a plaintext amount. the actual balance cannot be displayed in the UI without TEE decryption infrastructure
- **USDC must be wrapped before use** — standard USDC cannot be used directly for confidential transfers. users must wrap USDC into mwUSDC via the wrap interface first
- **agent autonomy is limited to pre-approved policies** — magen cannot dynamically create or modify policies on behalf of an agent. all policies are defined and approved by a human
- **spending layer is not part of magen** — magen has no integration with how a funded agent wallet spends its balance. that layer must be built separately
- **operator authorization expires** — in `approve-for-period` mode, the vault authorization has a deadline. expired authorizations will cause payment failures until re-authorized
- **free-tier execution latency** — if running on a hosted free tier, the execution agent may have cold-start delays. for production use, the agent should run on a persistent, always-on service

---

## 9. narrative

this is not just payments.

magen is programmable, private funding infrastructure — for humans and machines.

a developer can pay a contractor without revealing the rate. a DAO can fund contributors without exposing treasury strategy. an AI agent can receive a monthly budget without the funding source being public.

the amounts move quietly. the schedule runs itself. the chain records that it happened — but not how much.

that is what magen is for.

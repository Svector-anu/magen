# Magen — Release State
Last updated: 2026-04-25

---

## What Is Live

| Service | URL | Platform | Plan |
|---|---|---|---|
| magen-frontend | https://magen-frontend.onrender.com | Render static | Free |
| magen-api | https://magen-api.onrender.com | Render web | Free |
| magen-agent | https://magen-agent.onrender.com | Render web (not worker) | Free |

Repo: https://github.com/Svector-anu/magen — branch `main`

---

## Architecture Deployed

```
Browser → magen-frontend (Vite/React, static)
             ↓ HTTPS
         magen-api (Express, Node 22, node:sqlite)
             ↓ polls /jobs/pending
         magen-agent (polling worker running as web service)
             ↓ signed vestauth requests
         magen-api /execute
             ↓ Nox TEE gateway (encrypt amount)
         DisbursementAgent.execute() on Arbitrum Sepolia
             ↓
         DisbursementVault → WrappedUSDC.confidentialTransferFrom()
```

**Key contracts (Arbitrum Sepolia, chainId 421614)**
- `WRAPPED_USDC_ADDRESS` = `0x0b6aCacf10fb1Ec0Ac66b9eCe71DB09b11eA2742`
- `DISBURSEMENT_VAULT_ADDRESS` = `0xfcC96b2bD9E30BDFE941C230873eCEd3f71D6466` (shared vault, multi-payer)
- `DISBURSEMENT_AGENT_ADDRESS` = `0x42fdD28DF516d8Cc0f0692cF00AF917CbD847E5c`
- `USDC_ADDRESS` = `0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d`

**Database**: `node:sqlite` (built-in Node 22, no native compilation). DB file at `.magen.db` in CWD (ephemeral on Render — resets on redeploy).

**Agent auth**: vestauth Ed25519 keypair. API verifies with `AGENT_PUBLIC_JWK`, agent signs with `AGENT_PRIVATE_JWK`.

**Secrets**: dotenvx-encrypted `.env` at repo root. Decrypted locally via `.env.keys` (gitignored). On Render, all vars set as plain text env vars (dotenvx `.env` file not present on Render).

---

## What Works End-to-End

- [x] Natural language instruction → parsed policy (Groq LLM)
- [x] Wallet connect (RainbowKit + wagmi, Arbitrum Sepolia)
- [x] `setOperator` on-chain approval via MetaMask
- [x] Policy saved to SQLite, first job queued
- [x] Agent polls `/api/jobs/pending` every 5s (signed vestauth)
- [x] Nox TEE gateway encrypts transfer amount → `(handle, proof)`
- [x] `DisbursementAgent.execute()` called on-chain
- [x] `confidentialTransferFrom` — amount never visible on-chain
- [x] Job marked `done` with txHash
- [x] Frontend shows active policies with next execution date
- [x] Policy cancel (DB-level, sets `status = 'cancelled'`)
- [x] Retry backoff: 3 attempts, 1m/5m delays
- [x] Permanent error classification (CALL_EXCEPTION, INSUFFICIENT_FUNDS)
- [x] Global pause endpoint (`POST /api/admin/pause`)
- [x] Execution cap per hour (default 3)
- [x] Webhook alerts (Discord/Slack-compatible)

---

## Known Pending Items

| Item | Priority | Notes |
|---|---|---|
| Set `ADMIN_TOKEN` on magen-api Render env | High | Pause endpoint is dead without it |
| Rotate `PRIVATE_KEY`, `AGENT_PRIVATE_JWK`, `GROQ_API_KEY` | Pre-mainnet | Current keys are testnet only |
| Wire `setOperator(vault, 0)` into cancel flow | Pre-mainnet | On-chain revocation gap — documented in ARCHITECTURE.md |
| SQLite DB is ephemeral on Render | Known | Resets on redeploy. Acceptable for testnet/demo. Use `DB_PATH` pointing to persistent volume for prod. |
| `punycode` deprecation warning | Low | From ethers.js dependency, not our code |
| `contactStore` + `parseInstruction` test suites failing | Low | Pre-existing: `import.meta.dirname` at module-eval-time breaks in CJS Jest |
| `WALLETCONNECT_PROJECT_ID` | Low | Falls back to `"magen-dev"` — get real ID from cloud.reown.com |
| X/Twitter handle resolution | Known | `by_x_username` is behind Neynar paid tier ($9/mo). Free tier resolves Farcaster usernames, ENS, and raw addresses only. X-only users cannot be resolved until upgraded. User-facing message: "Try their Farcaster username, ENS name, or paste their wallet address directly." |

---

## Env Vars Required

### magen-api (Render)
| Key | Value |
|---|---|
| `ARBITRUM_SEPOLIA_RPC` | `https://sepolia-rollup.arbitrum.io/rpc` |
| `PRIVATE_KEY` | API wallet private key (signs on-chain txs) |
| `DISBURSEMENT_AGENT_ADDRESS` | `0x0F3c2ab72F78477f9BeE916e0872Da18645B3b56` |
| `DISBURSEMENT_VAULT_ADDRESS` | `0x39B557adf435D360d054294a2Fe3322844308Eb3` |
| `WRAPPED_USDC_ADDRESS` | `0x0b6aCacf10fb1Ec0Ac66b9eCe71DB09b11eA2742` |
| `USDC_ADDRESS` | `0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d` |
| `AGENT_PUBLIC_JWK` | Ed25519 public JWK — copy from `.env.keys` or Render agent env |
| `GROQ_API_KEY` | Groq API key |
| `OPENAI_API_KEY` | OpenAI API key (fallback parser) |
| `FRONTEND_URL` | `https://magen-frontend.onrender.com` |
| `NOX_GATEWAY_URL` | Nox TEE gateway endpoint (optional — defaults to dev endpoint hardcoded in `executePolicy.ts`) |
| `ADMIN_TOKEN` | **Not set yet** — set before using pause endpoint |
| `APP_ENV` | `dev` (set to `prod` before mainnet) |
| `NEYNAR_API_KEY` | Neynar API key — enables Farcaster + X handle resolution. Get free key at neynar.com. Optional: omit to skip social resolution and fall through to ENS only. |

### magen-agent (Render)
| Key | Value |
|---|---|
| `ARBITRUM_SEPOLIA_RPC` | `https://sepolia-rollup.arbitrum.io/rpc` |
| `PRIVATE_KEY` | Same as API |
| `DISBURSEMENT_AGENT_ADDRESS` | `0x0F3c2ab72F78477f9BeE916e0872Da18645B3b56` |
| `WRAPPED_USDC_ADDRESS` | `0x0b6aCacf10fb1Ec0Ac66b9eCe71DB09b11eA2742` |
| `AGENT_PRIVATE_JWK` | `{"crv":"Ed25519","d":"pbd94-...","x":"VHuned7b...","kty":"OKP","kid":"Jz9LNJi..."}` (full value in `.env.keys`) |
| `API_BASE` | `https://magen-api.onrender.com/api` |

### magen-frontend (Render, baked at build time)
| Key | Value |
|---|---|
| `VITE_WRAPPED_USDC_ADDRESS` | `0x0b6aCacf10fb1Ec0Ac66b9eCe71DB09b11eA2742` |
| `VITE_VAULT_ADDRESS` | `0x39B557adf435D360d054294a2Fe3322844308Eb3` |
| `VITE_API_URL` | `https://magen-api.onrender.com` |
| `VITE_WALLETCONNECT_PROJECT_ID` | Get from cloud.reown.com (currently falls back to `"magen-dev"`) |

---

## Next 5 Priorities

1. **Set `ADMIN_TOKEN`** on magen-api — one env var, unlocks the pause/resume endpoint for ops
2. **Get WalletConnect project ID** from cloud.reown.com, set `VITE_WALLETCONNECT_PROJECT_ID` on frontend, redeploy — fixes wallet modal 403 warning
3. **Persistent SQLite volume** — on Render, add a disk to magen-api and set `DB_PATH=/data/.magen.db` so the DB survives redeploys
4. **Wire on-chain cancel** — call `setOperator(vault, 0)` from `DELETE /api/policies/:id` before mainnet
5. **Key rotation** — generate fresh `PRIVATE_KEY`, `AGENT_PRIVATE_JWK`, `GROQ_API_KEY` before any mainnet or public demo

# MileAI

> Milestone-based escrow that is released autonomously by an AI Agent on BNB Smart Chain.

Funds are locked in a smart contract, split per milestone. Workers submit proof of work, the AI Agent verifies automatically, and funds are released — no human approval. A manual fallback is available if the AI is unsure.

Built for **BNB Chain Hackathon** — **AI Agents** track, by 1 solo developer.

---

## Demo Flow

```
Payer connects wallet
    ↓
Create escrow → funds locked in MilestoneEscrow.sol (BSC Testnet)
    ↓
Worker submits proof of work (text + link) → status Submitted on-chain
    ↓
Backend AI Agent (polling every ~12s) detects new proof
    ↓
LLM (Groq/Gemini) evaluates proof vs criteria → confidence 0–100 + reason
    ↓
┌─ Confidence ≥ 85 → automatic autoRelease → funds go to Worker wallet
├─ Confidence 50–84 → status "Manual Review Needed" → Payer approves manually
└─ Confidence < 50 → status "Insufficient Evidence" → no action
```

All transactions (createEscrow, submitProof, manualApprove, refund) are signed directly from the user's wallet in the frontend — the backend never holds user private keys.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Smart Contract | Solidity + Foundry + OpenZeppelin |
| Chain | BNB Smart Chain Testnet (chainId 97) |
| Backend + AI Agent | FastAPI (Python) |
| Contract Interaction | web3.py |
| Database | SQLite |
| LLM | Groq API / Google Gemini API (free tier, text-only) |
| Frontend | Next.js, single page |
| Wallet | Multi-wallet via EIP-6963 |

---

## Project Structure

```
mileai/
├── contracts/
│   ├── src/MilestoneEscrow.sol      # Main smart contract
│   ├── script/Deploy.s.sol          # Deploy script (Foundry)
│   ├── test/                        # Foundry tests
│   └── foundry.toml
├── backend/
│   ├── main.py                      # FastAPI app + endpoints
│   ├── agent.py                     # Background polling + LLM verify + autoRelease
│   ├── ai.py                        # LLM integration (Groq/Gemini) + prompt injection defense
│   ├── contract_client.py           # web3.py wrapper
│   ├── config.py                    # Configuration from .env
│   ├── db.py                        # SQLite setup
│   ├── seed_manual.py               # Seed data for testing
│   └── requirements.txt
├── frontend/
│   ├── pages/
│   │   ├── index.js                 # Landing page (role selection)
│   │   ├── payer/                   # Payer dashboard + create escrow
│   │   └── worker/                  # Worker dashboard + submit proof
│   ├── components/                  # UI components (fx animations)
│   ├── lib/
│   │   ├── wallet.jsx               # Multi-wallet EIP-6963
│   │   ├── contract.js              # Contract interaction (ethers.js)
│   │   ├── api.js                   # Backend API client
│   │   └── escrows.js               # Escrow helpers
│   └── package.json
├── docs/                            # Per-area change log
└── PRD-MileAI-SoloScope.md          # Product Requirements Document
```

---

## Prerequisites

- [Node.js](https://nodejs.org/) ≥ 18
- [Python](https://python.org/) ≥ 3.11
- [Foundry](https://book.getfoundry.sh/) (forge, cast, anvil)
- Wallet extension (MetaMask, Rabby, etc.) — must support EIP-6963
- tBNB from the [BNB Chain Faucet](https://testnet.bnbchain.org/faucet-smart) (for the deployer, agent wallet, and payer wallet)
- Free API key from [Groq](https://console.groq.com/) or [Google AI Studio](https://aistudio.google.com/)

---

## Setup

### 1. Smart Contract

```bash
cd contracts
cp .env.example .env    
forge install
forge build
forge test
```

### 2. Deploy to BSC Testnet
```bash
cd contracts
forge script script/Deploy.s.sol:Deploy --rpc-url https://data-seed-prebsc.org --broadcast
```

After deploying, update `CONTRACT_ADDRESS` in `contracts/.env`, `backend/.env`, and `frontend/.env.local`.

### 3. Backend

```bash
cd backend
cp .env.example .env    # then fill in:
#   CONTRACT_ADDRESS=<deployed contract address>
#   AGENT_PRIVATE_KEY=<agent wallet private key — MUST hold AI_AGENT_ROLE>
#   LLM_API_KEY=<Groq or Gemini key>
#   LLM_PROVIDER=groq   # or "gemini"

pip install -r requirements.txt --break-system-packages
uvicorn main:app --reload
```

The backend runs on `http://localhost:8000`. Automatic polling is active; the AI Agent starts monitoring milestones with Submitted status.

### 4. Frontend

```bash
cd frontend
cp .env.example .env.local    # then fill in NEXT_PUBLIC_CONTRACT_ADDRESS
npm install
npm run dev
```

Open `http://localhost:3000`.

---

## Smart Contract: MilestoneEscrow.sol

**Main functions:**

| Function | Caller | Description |
|---|---|---|
| `createEscrow(recipient, token, milestones[])` | Payer | Lock funds in the contract |
| `submitProof(escrowId, milestoneIndex, proofText)` | Recipient | Submit proof of work |
| `autoRelease(escrowId, milestoneIndex)` | AI Agent (role-gated) | Release funds autonomously |
| `manualApprove(escrowId, milestoneIndex)` | Payer | Manual approve fallback |
| `refund(escrowId)` | Payer | Withdraw remaining funds |
| `raiseDispute(escrowId, milestoneIndex)` | Payer or Recipient | Halt the verification process |
| `resolveDispute(escrowId, milestoneIndex)` | Payer or Recipient | Resolve the dispute |

**Security:**

- ReentrancyGuard on all transfer functions
- AccessControl with `AI_AGENT_ROLE` separate from the admin role
- SafeERC20 for all ERC20 token transfers
- Bounds checking for escrowId/milestoneIndex
- Per-escrow specific authorization
- Status-based idempotency guard
- Max 10 milestones per escrow (anti gas DoS)

---

## Backend API

| Endpoint | Method | Description |
|---|---|---|
| `/health` | GET | Contract, RPC, LLM connection status |
| `/escrows/{id}/milestones/{index}/status` | GET | Combined on-chain data + AI verification result |
| `/agent/trigger/{escrow_id}/{milestone_index}` | POST | Manual verification trigger (testing) |

---

## AI Agent Configuration

| Variable | Default | Description |
|---|---|---|
| `POLL_INTERVAL_SECONDS` | 12 | Contract polling interval |
| `CONFIDENCE_AUTO` | 85 | Threshold for autoRelease |
| `CONFIDENCE_REVIEW_MIN` | 50 | Threshold for manual review |
| `PROOF_MIN_LEN_FOR_HIGH_SCORE` | 120 | Min proof text length for the sanity guard |
| `HIGH_SCORE_LIMIT` | 98 | Confidence threshold for the sanity guard |

---

## Security

- **Prompt injection defense**: LLM system instructions are strictly separated from recipient data using the `<DATA>` delimiter. The LLM is explicitly asked to ignore any instructions appearing inside the proof of work.
- **Sanity guard**: If confidence ≥ 98 but the proof of work is < 120 characters, it is automatically downgraded to manual review.
- **Idempotency**: Before `autoRelease`, the status is re-checked on-chain. If it is no longer Submitted, the transaction is aborted.
- **No user private key**: The backend only stores the AI Agent wallet's private key (for autoRelease). User transactions are signed directly from the wallet in the frontend.
- **Nonce management**: autoRelease transactions are locked with a mutex to prevent nonce collisions.

---

## Testing

### Smart Contract

```bash
cd contracts
forge test -vvv
```

### Backend

```bash
cd backend
pytest
```

### End-to-End

1. Deploy the contract + run backend + frontend
2. Connect a wallet as Payer → create an escrow (make sure the wallet has testnet BNB + TestToken)
3. Connect a wallet as Worker → submit proof of work
4. Wait ~12 seconds → the AI Agent verifies automatically
5. Check the status in the dashboard: confidence score + AI reason

---

## Roadmap (post-hackathon)

- Multi-modal verification (images, documents, video)
- Proof storage on IPFS
- WebSocket event listener (upgrade from polling)
- Recipient reputation score
- More secure key management (MPC/account abstraction)

---

## License

MIT

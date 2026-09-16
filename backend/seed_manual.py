"""Seed 4 escrow dummy untuk test manual (anvil pada port 8546).

Cara pakai:
  cd backend
  .venv\\Scripts\\python.exe seed_manual.py

Menghubungkan langsung ke anvil via web3.py (bukan lewat backend), lalu:
  escrow 0: milestone Pending          (belum submit bukti)
  escrow 1: milestone Submitted        (sudah submit bukti, belum diverifikasi)
  escrow 2: milestone Released via autoRelease ASLI (stub verdict AI tersimpan di SQLite)
  escrow 3: milestone Perlu Review Manual (stub verdict AI tersimpan di SQLite)
"""

import json
import os
from pathlib import Path

from web3 import Web3

import db as db_module
import config

RPC = "http://127.0.0.1:8546"
ESCROW_ADDR = Web3.to_checksum_address(config.CONTRACT_ADDRESS)
TOKEN_ADDR = Web3.to_checksum_address(
    os.getenv("TOKEN_ADDRESS", "0xcf7ed3acca5a467e9e704c703e8d87f634fb0fc9").strip())

# Anvil default account keys (deterministic, publik — dev lokal saja, TIDAK boleh
# dipakai ke network selain anvil localhost 127.0.0.1:8546).
PAYER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"     # anvil[0]
RECIPIENT_KEY = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a"  # anvil[2]
ANVIL_AGENT_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"  # anvil[1]

# AGENT diambil dari config .env. Guard WAJIB: kalau key bukan anvil[1] (mis.
# user tidak sengaja mengisi key testnet/mainnet asli), jangan jalan sama sekali —
# script ini cuma untuk seed dev lokal di anvil.
agent_env_key = (config.AGENT_PRIVATE_KEY or "").strip()
if agent_env_key != ANVIL_AGENT_KEY:
    raise SystemExit(
        "AGENT_PRIVATE_KEY di .env bukan key anvil[1] (dev lokal).\n"
        "seed_manual.py HANYA untuk anvil localhost — isi .env dengan key anvil[1]:\n"
        + ANVIL_AGENT_KEY
    )
AGENT_KEY = agent_env_key

ABI_ESCROW = json.loads(
    Path("../contracts/out/MilestoneEscrow.sol/MilestoneEscrow.json").read_text()
)["abi"]
ABI_TOKEN = json.loads(
    Path("../contracts/out/TestToken.sol/TestToken.json").read_text()
)["abi"]

w3 = Web3(Web3.HTTPProvider(RPC))
if not w3.is_connected():
    raise SystemExit("anvil tidak terhubung di " + RPC)

escrow = w3.eth.contract(address=ESCROW_ADDR, abi=ABI_ESCROW)
token = w3.eth.contract(address=TOKEN_ADDR, abi=ABI_TOKEN)

payer = w3.eth.account.from_key(PAYER_KEY)
recipient = w3.eth.account.from_key(RECIPIENT_KEY)
agent = w3.eth.account.from_key(AGENT_KEY)


def tx(fn, account, gas=300_000, wait=True):
    nonce = w3.eth.get_transaction_count(account.address, "pending")
    txn = fn.build_transaction(
        {
            "from": account.address,
            "nonce": nonce,
            "gas": gas,
            "chainId": 31337,
            "gasPrice": w3.eth.gas_price,
        }
    )
    signed = account.sign_transaction(txn)
    h = w3.eth.send_raw_transaction(signed.raw_transaction)
    if wait:
        return w3.eth.wait_for_transaction_receipt(h, timeout=30)
    return h


def ensure_balance(account, amount_ether):
    bal = token.functions.balanceOf(account.address).call()
    have = bal / 10 ** token.functions.decimals().call()
    if have < amount_ether:
        tx(token.functions.mint(account.address, int(amount_ether * 1e18)), account)


def create_escrow(total, milestones, approve_to=None):
    ensure_balance(payer, total)
    token_contract = token
    if approve_to is None:
        approve_to = ESCROW_ADDR
    tx(token.functions.approve(approve_to, total * 10**18), payer)  # amount dalam ether
    tx(escrow.functions.createEscrow(recipient.address, TOKEN_ADDR, milestones), payer)


# pastikan ABI TestToken punya decimals (ERC20 standar ada).
def submit_proof(eid, midx, proof):
    tx(escrow.functions.submitProof(eid, midx, proof), recipient)

def state(eid, midx):
    m = escrow.functions.getMilestone(eid, midx).call()
    return m, m[3]  # tuple, status (int)

POOF_PENDING = [
    {"amount": int(2 * 1e18), "proofRequirement": "Desain halaman landing lengkap",
     "proofText": "", "status": 0},
]
POOF_SUBMIT = [
    {"amount": int(3 * 1e18), "proofRequirement": "Halaman landing + flow connect",
     "proofText": "", "status": 0},
]
POOF_RELEASE = [
    {"amount": int(4 * 1e18), "proofRequirement": "Kontrak deploy + E2E asli lolos",
     "proofText": "", "status": 0},
]
POOF_REVIEW = [
    {"amount": int(5 * 1e18), "proofRequirement": "Integrasi backend + status viewer",
     "proofText": "", "status": 0},
]

print("== escrow 0 (Pending) ==")
create_escrow(2, POOF_PENDING)

print("== escrow 1 (Submitted) ==")
create_escrow(3, POOF_SUBMIT)
submit_proof(1, 0, "Bukti E1: landing page selesai, wallet connect flow berjalan, PR updated.")

print("== escrow 2 (Released via autoRelease asli) ==")
create_escrow(4, POOF_RELEASE)
submit_proof(2, 0, "Bukti E2: MilestoneEscrow dideploy ke anvil, autoRelease asli dipanggil, chain menerima tx, status on-chain Released, saldo MILE bertambah di recipient.")
# autoRelease pakai wallet agent (real on-chain)
tx(escrow.functions.autoRelease(2, 0), agent, gas=300_000)
# Simpan verdict AI hasil autoRelease (stub, jelas ditandai) ke SQLite.
db_module.upsert_verification(
    2, 0, "verified_auto", confidence=95,
    reason="[STUB] Bukti menyebut deploy sukses dan autoRelease on-chain berhasil, memenuhi kriteria milestone — verdict dummy utk test manual.",
    proof_text="Bukti E2: MilestoneEscrow dideploy ke anvil, autoRelease asli dipanggil, chain menerima tx, status on-chain Released, saldo MILE bertambah di recipient.",
    tx_hash="0x" + "ab" * 32,
)

print("== escrow 3 (Perlu Review Manual) ==")
create_escrow(5, POOF_REVIEW)
submit_proof(3, 0, "Bukti E3: backend jalan, status viewer merender, tapi integrasi AI belum divalidasi manual.")
db_module.upsert_verification(
    3, 0, "manual_review", confidence=62,
    reason="[STUB] Sebagian kriteria terpenuhi (halaman berjalan) tapi klaim dashboard belum diverifikasi — perlu review manual.",
    proof_text="Bukti E3: backend jalan, status viewer merender, tapi integrasi AI belum divalidasi manual.",
)

print("== status akhir (on-chain) ==")
for eid, midx in [(0,0),(1,0),(2,0),(3,0)]:
    m, st = state(eid, midx)
    print(f"escrow {eid} m{midx}: status={st} amount={m[0]/1e18} req={m[1][:30]!r} proof={m[2][:30]!r}")

print("Done. Payer:", payer.address)
print("Recipient:", recipient.address)
print("Agent:", agent.address)
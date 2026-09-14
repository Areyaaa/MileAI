"""FastAPI app — titik masuk backend MileAI.

Backend TIDAK pernah menerima/menyimpan private key user. Semua operasi milik
payer/recipient (createEscrow, submitProof, manualApprove, refund) ditandatangi
langsung oleh wallet user di frontend; backend hanya memegang wallet AI Agent
untuk autoRelease.

Endpoints:
- GET /health
- GET /escrow/{id}/milestones/{index}/status   (on-chain + hasil AI dari SQLite)
- POST /agent/trigger/{escrow_id}/{milestone_index}  (verify manual, tanpa tunggu polling)
"""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

import agent as agent_mod
import config
from contract_client import ContractClient, ContractError
from db import get_verification, init_db

log = logging.getLogger("mileai")

STATUS_NAMES = {0: "Pending", 1: "Submitted", 2: "Released", 3: "Disputed"}
# Tampilan untuk status viewer (gabungan on-chain + hasil AI).
ACTION_LABEL = {
    "verified_auto": "Released by AI (auto)",
    "manual_review": "Perlu Review Manual",
    "insufficient": "Bukti Belum Cukup",
    "error": "Error Verifikasi",
}


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()

    app.state.agent = None
    app.state.poll_task = None
    client = None
    try:
        client = ContractClient()
        app.state.agent = agent_mod.AIAgent(client)
        app.state.poll_task = asyncio.create_task(app.state.agent.poll_loop())
    except Exception as exc:  # noqa: BLE001 - backend tetap jalan walau chain/LLM belum siap
        log.warning("Agent polling tidak aktif: %s", exc)
        app.state.bootstrap_error = str(exc)

    yield

    if app.state.poll_task is not None:
        app.state.poll_task.cancel()


app = FastAPI(title="MileAI Backend", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # dev/demo; frontend Next.js lokal/vercel
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _require_agent() -> agent_mod.AIAgent:
    if app.state.agent is None:
        msg = getattr(app.state, "bootstrap_error", None) or (
            "Backend belum terkoneksi ke kontrak. Set CONTRACT_ADDRESS & "
            "AGENT_PRIVATE_KEY di .env lalu restart."
        )
        raise HTTPException(status_code=503, detail=msg)
    return app.state.agent


@app.get("/health")
def health():
    agent: agent_mod.AIAgent | None = app.state.agent
    client = agent.client if agent else None
    chain_id = client.chain_id if client else None
    return {
        "status": "ok",
        "contract_address": config.CONTRACT_ADDRESS or None,
        "rpc": config.RPC,
        "llm_provider": config.LLM_PROVIDER,
        "llm_configured": bool(config.LLM_API_KEY),
        "agent_configured": bool(client and client.is_configured),
        "chain_id": chain_id,
        "polling_active": app.state.poll_task is not None,
        "contract_connected": bool(client and client.contract is not None),
    }


@app.get("/escrow/{escrow_id}/milestones/{milestone_index}/status")
def milestone_status(escrow_id: int, milestone_index: int):
    agent = _require_agent()
    client = agent.client
    try:
        escrow_info = client.get_escrow(escrow_id)
        milestone = client.get_milestone(escrow_id, milestone_index)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ContractError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    verification = get_verification(escrow_id, milestone_index)
    onchain_name = STATUS_NAMES.get(milestone["status"], str(milestone["status"]))

    if milestone["status"] == config.STATUS_SUBMITTED and verification:
        onchain_name = ACTION_LABEL.get(verification["action"], onchain_name)

    return {
        "escrow_id": escrow_id,
        "milestone_index": milestone_index,
        "milestone_count": escrow_info["milestone_count"],
        "payer": escrow_info["payer"],
        "recipient": escrow_info["recipient"],
        "token": escrow_info["token"],
        "amount": milestone["amount"],
        "proof_requirement": milestone["proof_requirement"],
        "proof_text": milestone["proof_text"],
        "onchain_status": milestone["status"],
        "display_status": onchain_name,
        "verification": {
            "action": verification["action"] if verification else None,
            "confidence": verification["confidence"] if verification else None,
            "reason": verification["reason"] if verification else None,
            "tx_hash": verification["tx_hash"] if verification else None,
            "updated_at": verification["updated_at"] if verification else None,
        },
    }


@app.post("/agent/trigger/{escrow_id}/{milestone_index}")
async def trigger_verification(escrow_id: int, milestone_index: int):
    """Paksa verifikasi sekarang (tanpa menunggu siklus polling) — untuk testing."""
    agent = _require_agent()
    try:
        result = await asyncio.to_thread(agent.verify_one, escrow_id, milestone_index, True)
    except (ValueError, ContractError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return result
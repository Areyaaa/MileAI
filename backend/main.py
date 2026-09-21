"""FastAPI app — titik masuk backend MileAI.

Backend TIDAK pernah menerima/menyimpan private key user. Semua operasi milik
payer/recipient (createEscrow, submitProof, manualApprove, refund) ditandatangi
langsung oleh wallet user di frontend; backend hanya memegang wallet AI Agent
untuk autoRelease.

Endpoints:
- GET /health
- GET /escrows/{id}/milestones/{index}/status  (on-chain + hasil AI dari SQLite)
- GET /verify/all  (semua verdict AI sekaligus dari SQLite, tanpa RPC — buat dashboard)
- POST /agent/trigger/{escrow_id}/{milestone_index}  (verify manual, tanpa tunggu polling)
"""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware

import agent as agent_mod
import config
from contract_client import ContractClient, ContractError
from db import get_all_verifications, get_verification, init_db

log = logging.getLogger("mileai")

STATUS_NAMES = {0: "Pending", 1: "Submitted", 2: "Released", 3: "Disputed"}
# Tampilan untuk status viewer (gabungan on-chain + hasil AI). Bahasa Inggris
# konsisten dengan frontend (frontend/lib/escrows.js ACTION_EN) & /verify/all.
ACTION_LABEL = {
    "verified_auto": "Released by AI (auto)",
    "manual_review": "Manual Review Needed",
    "insufficient": "Insufficient Evidence",
    "error": "Verification Error",
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
    allow_origins=config.ALLOWED_CORS_ORIGINS,  # dev: localhost; atur via ALLOWED_CORS_ORIGINS
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


def _require_agent_token(
    authorization: Optional[str] = Header(default=None),
    x_agent_token: Optional[str] = Header(default=None),
) -> None:
    """Guard ringan untuk POST /agent/trigger.

    Menghindari spam verifikasi LLM oleh pihak ketiga (burn free-tier API).
    Token dibaca dari AGENT_TRIGGER_TOKEN; kalau kosong, endpoint terbuka
    (mode dev/demo — lihat catatan keamanan di config.py/.env.example).
    """
    expected = config.AGENT_TRIGGER_TOKEN
    if not expected:
        return

    provided = ""
    if authorization and authorization.lower().startswith("bearer "):
        provided = authorization[7:].strip()
    if not provided:
        provided = (x_agent_token or "").strip()

    if provided != expected:
        raise HTTPException(
            status_code=401,
            detail="Trigger token salah atau tidak diberikan.",
        )


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


@app.get("/escrows/{escrow_id}/milestones/{milestone_index}/status")
def milestone_status(escrow_id: int, milestone_index: int):
    if escrow_id < 0 or milestone_index < 0:
        raise HTTPException(status_code=404, detail="escrow_id / milestone_index tidak boleh negatif.")
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


@app.get("/verify/all")
def verify_all():
    """Semua verdict AI dari SQLite sekaligus (tanpa RPC / tanpa butuh chain).

    Frontend dashboard membaca ini sekali per refresh, menggantikan
    N panggilan /escrows/{id}/milestones/{index}/status per milestone.
    Bisa dipanggil walau agent/chain belum terkoneksi.
    """
    rows = get_all_verifications()
    return {
        "count": len(rows),
        "verifications": [
            {
                "escrow_id": r["escrow_id"],
                "milestone_index": r["milestone_index"],
                "action": r["action"],
                "confidence": r["confidence"],
                "reason": r["reason"],
                "tx_hash": r["tx_hash"],
                "updated_at": r["updated_at"],
            }
            for r in rows
        ],
    }


@app.post("/agent/trigger/{escrow_id}/{milestone_index}", dependencies=[Depends(_require_agent_token)])
async def trigger_verification(escrow_id: int, milestone_index: int):
    """Paksa verifikasi sekarang (tanpa menunggu siklus polling) — untuk testing."""
    if escrow_id < 0 or milestone_index < 0:
        raise HTTPException(status_code=404, detail="escrow_id / milestone_index tidak boleh negatif.")
    agent = _require_agent()
    try:
        result = await asyncio.to_thread(agent.verify_one, escrow_id, milestone_index, True)
    except (ValueError, ContractError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return result
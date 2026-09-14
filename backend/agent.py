"""AI Agent: background polling kontrak + verifikasi LLM + eksekusi autoRelease.

Alur per milestone berstatus "Submitted":
1. Baca on-chain (proofRequirement + proofText + status terkini).
2. Jangan ulang dinilai bila bukti sama sudah punya hasil final (idempotency,
   anti-spam LLM). Bukti berubah / trigger manual -> dinilai ulang.
3. Panggil LLM (text-only, prompt injection defense di ai.verify_llm).
4. Sanity guard: confidence sangat tinggi tapi bukti pendek -> review manual.
5. Keputusan:
   - confidence >= CONFIDENCE_AUTO -> cek ulang status on-chain lalu
     autoRelease via wallet agent (nonce di-lock di contract_client).
   - CONFIDENCE_REVIEW_MIN <= confidence < CONFIDENCE_AUTO -> "manual review".
   - confidence < CONFIDENCE_REVIEW_MIN -> "bukti belum cukup", tanpa aksi.
6. Simpan hasil ke SQLite.

Semua panggilan web3.py dan HTTP bersifat blocking -> dijalankan lewat
asyncio.to_thread / ThreadPoolExecutor supaya event loop FastAPI tetap hidup.
"""

from __future__ import annotations

import asyncio
import logging
import threading

import ai
import config
from contract_client import ContractClient
from db import already_verified_with, upsert_verification

log = logging.getLogger("mileai.agent")

STATUS_SUBMITTED = config.STATUS_SUBMITTED


class AIAgent:
    def __init__(self, client: ContractClient | None = None) -> None:
        self.client = client or ContractClient()
        # Satu agent: serialkan verifikasi+transaksi (cek dobel di satu siklus polling).
        self._verify_lock = threading.Lock()

    # ------------------------------------------------------------------ verifikasi inti

    def verify_one(self, escrow_id: int, milestone_index: int, forced: bool = False) -> dict:
        """Verifikasi satu milestone. Panggil dari thread (bukan event loop)."""
        with self._verify_lock:
            return self._verify_inner(escrow_id, milestone_index, forced)

    def _verify_inner(self, escrow_id: int, milestone_index: int, forced: bool) -> dict:
        milestone = self.client.get_milestone(escrow_id, milestone_index)
        onchain_status = milestone["status"]
        proof = milestone["proof_text"]

        if onchain_status != STATUS_SUBMITTED:
            return {
                "escrow_id": escrow_id,
                "milestone_index": milestone_index,
                "skipped": f"status on-chain {onchain_status} (bukan Submitted)",
            }

        if not forced and already_verified_with(escrow_id, milestone_index, proof):
            return {
                "escrow_id": escrow_id,
                "milestone_index": milestone_index,
                "skipped": "bukti yang sama sudah pernah dinilai — tunggu perubahan/trigger",
            }

        requirement = milestone["proof_requirement"]

        # --- 1. LLM ---
        try:
            confidence, reason = ai.verify_llm(requirement, proof)
        except Exception as exc:  # noqa: BLE001 - catat & jangan matikan polling
            log.exception("LLM verify gagal untuk %d/%d", escrow_id, milestone_index)
            upsert_verification(
                escrow_id,
                milestone_index,
                action="error",
                reason=f"LLM error: {exc}",
                proof_text=proof,
            )
            return self._result(escrow_id, milestone_index, "error", confidence=None, reason=str(exc))

        # --- 2. sanity guard (anti prompt-injection sederhana) ---
        if ai.sanity_guard(confidence, proof):
            log.warning(
                "Sanity guard memicu untuk %d/%d (conf=%d, len=%d)",
                escrow_id, milestone_index, confidence, len(proof),
            )
            forced_reason = (
                "Sanity guard: confidence sangat tinggi tapi bukti terlalu pendek — "
                "kemungkinan percobaan prompt injection. Status diturunkan ke review manual."
            )
            upsert_verification(
                escrow_id, milestone_index, "manual_review", confidence=None,
                reason=forced_reason, proof_text=proof,
            )
            return self._result(escrow_id, milestone_index, "manual_review", None, forced_reason)

        # --- 3. keputusan ---
        if confidence >= config.CONFIDENCE_AUTO:
            # Cek ulang on-chain TERKINI lalu kirim autoRelease (double-check di
            # contract_client.auto_release juga dilakukan sebelum build tx).
            try:
                tx_hash = self.client.auto_release(escrow_id, milestone_index)
            except Exception as exc:  # noqa: BLE001
                log.exception("autoRelease gagal untuk %d/%d", escrow_id, milestone_index)
                upsert_verification(
                    escrow_id, milestone_index, "manual_review",
                    confidence=confidence,
                    reason=f"AI confident, tapi autoRelease gagal: {exc}", proof_text=proof,
                )
                return self._result(
                    escrow_id, milestone_index, "manual_review", confidence,
                    f"AI confident, tapi autoRelease gagal: {exc}",
                )
            upsert_verification(
                escrow_id, milestone_index, "verified_auto", confidence=confidence,
                reason=reason, proof_text=proof, tx_hash=tx_hash,
            )
            log.info("AUTO-RELEASED %d/%d confidence=%d tx=%s", escrow_id, milestone_index, confidence, tx_hash)
            return self._result(
                escrow_id, milestone_index, "verified_auto", confidence,
                reason, tx_hash=tx_hash,
            )

        if confidence >= config.CONFIDENCE_REVIEW_MIN:
            detail = f"confidence {confidence} — butuh aproval manual."
            upsert_verification(
                escrow_id, milestone_index, "manual_review", confidence=confidence,
                reason=f"{reason} {detail}", proof_text=proof,
            )
            return self._result(
                escrow_id, milestone_index, "manual_review", confidence,
                f"{reason} {detail}",
            )

        detail = "confidence rendah — bukti belum cukup, tidak ada aksi."
        upsert_verification(
            escrow_id, milestone_index, "insufficient", confidence=confidence,
            reason=f"{reason} {detail}", proof_text=proof,
        )
        return self._result(
            escrow_id, milestone_index, "insufficient", confidence, f"{reason} {detail}",
        )

    @staticmethod
    def _result(escrow_id, milestone_index, action, confidence, reason, tx_hash=None):
        return {
            "escrow_id": escrow_id,
            "milestone_index": milestone_index,
            "action": action,
            "confidence": confidence,
            "reason": reason,
            "tx_hash": tx_hash,
        }

    # ------------------------------------------------------------------ polling

    def poll_once(self) -> list[dict]:
        """Satu siklus: loop semua escrow & milestone, verifikasi yang Submitted."""
        results = []
        try:
            escrow_count = self.client.escrow_count()
        except Exception:  # noqa: BLE001
            log.exception("escrowCount gagal saat polling")
            return results

        for escrow_id in range(escrow_count):
            try:
                escrow_info = self.client.get_escrow(escrow_id)
                for milestone_index in range(escrow_info["milestone_count"]):
                    milestone = self.client.get_milestone(escrow_id, milestone_index)
                    if milestone["status"] == STATUS_SUBMITTED:
                        results.append(self.verify_one(escrow_id, milestone_index, forced=False))
            except Exception:  # noqa: BLE001 - jangan matikan loop karena 1 escrow error
                log.exception("poll escrow %d gagal", escrow_id)
        return results

    async def poll_loop(self) -> None:
        """Background task: polling tiap POLL_INTERVAL_SECONDS via executor thread."""
        log.info("Polling loop dimulai (interval %ss)", config.POLL_INTERVAL_SECONDS)
        while True:
            try:
                await asyncio.to_thread(self.poll_once)
            except asyncio.CancelledError:
                log.info("Polling loop dibatalkan")
                raise
            except Exception:  # noqa: BLE001
                log.exception("poll_once di poll_loop gagal")
            await asyncio.sleep(config.POLL_INTERVAL_SECONDS)
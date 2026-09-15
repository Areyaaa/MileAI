"""Double in-memory untuk ContractClient — tidak menyentuh RPC asli.

Used by unit test agent.py dan integration test main.py. Perilaku on-chain
disimulasikan di RAM (dict escrows / milestones) supaya tes deterministik.
"""

from __future__ import annotations

import asyncio

import config


class FakeClient:
    """Mirror API ContractClient yang dipakai agent.py & main.py."""

    def __init__(self) -> None:
        self.escrows: dict[int, dict] = {}
        self.milestones: dict[tuple[int, int], dict] = {}
        self.released: list[tuple[int, int]] = []
        self.poll_count_override: int | None = None  # None = pakai len(escrows)
        self.fail_auto_release = False  # True -> autoRelease selalu revert

    # ---------------- admin seeding ----------------

    def add_escrow(self, escrow_id, payer, recipient, token, milestone_count, *,
                   refunded=False):
        self.escrows[escrow_id] = {
            "escrow_id": escrow_id,
            "payer": payer,
            "recipient": recipient,
            "token": token,
            "milestone_count": milestone_count,
            "refunded": refunded,
        }

    def add_milestone(self, escrow_id, milestone_index, amount, requirement, proof,
                      status):
        self.milestones[(escrow_id, milestone_index)] = {
            "amount": amount,
            "proof_requirement": requirement,
            "proof_text": proof,
            "status": status,
        }

    # ---------------- ContractClient API ----------------

    def get_escrow(self, escrow_id: int) -> dict:
        if escrow_id not in self.escrows:
            raise ValueError(f"Escrow {escrow_id} tidak ditemukan")
        return dict(self.escrows[escrow_id])

    def get_milestone(self, escrow_id: int, milestone_index: int) -> dict:
        key = (escrow_id, milestone_index)
        if key not in self.milestones:
            raise ValueError(f"Milestone {escrow_id}/{milestone_index} di luar range")
        return dict(self.milestones[key])

    def escrow_count(self) -> int:
        if self.poll_count_override is not None:
            return self.poll_count_override
        return len(self.escrows)

    def auto_release(self, escrow_id: int, milestone_index: int) -> str:
        if self.fail_auto_release:
            from contract_client import ContractError

            raise ContractError("simulasi: status on-chain sudah berubah")
        key = (escrow_id, milestone_index)
        if key not in self.milestones:
            raise ValueError(f"Milestone {escrow_id}/{milestone_index} di luar range")
        m = self.milestones[key]
        if m["status"] != config.STATUS_SUBMITTED:
            from contract_client import ContractError

            raise ContractError(
                f"Milestone {escrow_id}/{milestone_index} sudah bukan Submitted "
                f"(status={m['status']}) — dibatalkan sebelum mengirim tx."
            )
        m["status"] = config.STATUS_RELEASED
        self.released.append((escrow_id, milestone_index))
        tx = f"0x{len(self.released):064x}"
        m["tx_hash"] = tx
        return tx

    # ---------------- dipakai /health & attribute mirip asli ----------------

    @property
    def is_configured(self) -> bool:
        return True

    @property
    def contract(self):
        return object()

    @property
    def chain_id(self) -> int:
        return 97

    # ---------------- async wrapper (patokan pemakaian non-blocking) --------

    async def get_milestone_async(self, escrow_id: int, milestone_index: int) -> dict:
        return await asyncio.to_thread(self.get_milestone, escrow_id, milestone_index)

    async def auto_release_async(self, escrow_id: int, milestone_index: int) -> str:
        return await asyncio.to_thread(self.auto_release, escrow_id, milestone_index)
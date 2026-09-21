"""Wrapper web3.py untuk baca/tulis kontrak MilestoneEscrow.

Semua operasi di sini bersifat SYNC (web3.py sync). Pemanggil bertanggung jawab
menjalankannya lewat executor/thread supaya tidak memblokir event loop FastAPI
(lihat agent.py / main.py).

Nonce management: satu threading.Lock membungkus baca-status ulang + build +
send transaksi, jadi beberapa milestone yang siap autoRelease dalam satu siklus
polling tidak mungkin berbenturan nonce.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import threading
from pathlib import Path

from web3 import Web3
from web3.exceptions import BadFunctionCallOutput, ContractCustomError
from web3.middleware import ExtraDataToPOAMiddleware

import config

log = logging.getLogger("mileai.contract")


class ContractError(RuntimeError):
    pass


class ContractClient:
    def __init__(
        self,
        rpc: str | None = None,
        address: str | None = None,
        private_key: str | None = None,
        abi_path: str | None = None,
    ) -> None:
        self.rpc = rpc or config.RPC
        self.address = (address or config.CONTRACT_ADDRESS).strip()
        self.private_key = (private_key or config.AGENT_PRIVATE_KEY).strip()

        self.w3 = Web3(Web3.HTTPProvider(self.rpc, request_kwargs={"timeout": 30}))
        # BSC = Proof-of-Authority: block extraData bisa >32 byte (mis. 279 byte).
        # Tanpa middleware ini, web3.py melempar "extraData is N bytes, but should be 32"
        # saat membaca blok terbaru (mis. di wait_for_transaction_receipt).
        try:
            self.w3.middleware_onion.inject(ExtraDataToPOAMiddleware, layer=0)
        except AttributeError:
            # Web3 palsu di test tidak punya middleware_onion — abaikan.
            pass
        if not self.w3.is_connected():
            raise ContractError(f"Tidak bisa terhubung ke RPC {self.rpc}")

        abi_file = Path(abi_path or config.ABI_PATH)
        if not abi_file.is_absolute():
            abi_file = Path(os.path.dirname(os.path.abspath(__file__))) / abi_file
        if not abi_file.exists():
            raise ContractError(
                f"ABI tidak ditemukan: {abi_file}. Jalankan 'forge build' di contracts/ "
                "terlebih dahulu atau set CONTRACT_ABI_PATH."
            )
        with abi_file.open() as fh:
            abi = json.load(fh)["abi"]

        self.contract = None
        self.account = None
        if self.address:
            self.contract = self.w3.eth.contract(
                address=Web3.to_checksum_address(self.address), abi=abi
            )
        if self.private_key:
            self.account = self.w3.eth.account.from_key(self.private_key)

        self._tx_lock = threading.Lock()

    # ---------- status konfigurasi ----------

    @property
    def can_send_auto_release(self) -> bool:
        return self.is_configured and self.contract is not None and self.account is not None

    @property
    def is_configured(self) -> bool:
        return bool(self.address) and bool(self.private_key)

    @property
    def agent_address(self) -> str | None:
        return self.account.address if self.account else None

    @property
    def chain_id(self) -> int | None:
        try:
            return int(self.w3.eth.chain_id)
        except Exception:
            return None

    # ---------- baca on-chain ----------

    def escrow_count(self) -> int:
        return self.contract.functions.escrowCount().call()

    def get_escrow(self, escrow_id: int) -> dict:
        try:
            payer, recipient, token, milestone_count, refunded = (
                self.contract.functions.getEscrow(escrow_id).call()
            )
        except (ContractCustomError, BadFunctionCallOutput) as exc:
            raise ValueError(f"Escrow {escrow_id} tidak ditemukan") from exc
        return {
            "escrow_id": escrow_id,
            "payer": payer,
            "recipient": recipient,
            "token": token,
            "milestone_count": milestone_count,
            "refunded": refunded,
        }

    def get_milestone(self, escrow_id: int, milestone_index: int) -> dict:
        try:
            amount, requirement, proof, status = (
                self.contract.functions.getMilestone(escrow_id, milestone_index).call()
            )
        except (ContractCustomError, BadFunctionCallOutput) as exc:
            raise ValueError(
                f"Milestone {escrow_id}/{milestone_index} di luar range"
            ) from exc
        return {
            "escrow_id": escrow_id,
            "milestone_index": milestone_index,
            "amount": amount,
            "proof_requirement": requirement,
            "proof_text": proof,
            "status": status,  # 0 Pending, 1 Submitted, 2 Released, 3 Disputed
        }

    # ---------- tulis on-chain ----------

    def auto_release(self, escrow_id: int, milestone_index: int) -> str:
        """Sign & kirim tx autoRelease dari wallet agent. Return tx hash."""
        if not self.can_send_auto_release:
            raise ContractError("CONTRACT_ADDRESS / AGENT_PRIVATE_KEY belum dikonfigurasi")

        with self._tx_lock:
            # Idempotency vs state on-chain TERKINI (bukan cache) sebelum kirim.
            m = self.get_milestone(escrow_id, milestone_index)
            if m["status"] != config.STATUS_SUBMITTED:
                raise ContractError(
                    f"Milestone {escrow_id}/{milestone_index} sudah bukan Submitted "
                    f"(status={m['status']}) — dibatalkan sebelum mengirim tx."
                )

            nonce = self.w3.eth.get_transaction_count(self.account.address)
            args = self.contract.functions.autoRelease(escrow_id, milestone_index)
            tx = args.build_transaction(
                {
                    "from": self.account.address,
                    "nonce": nonce,
                    "gas": 300_000,
                }
            )
            signed = self.w3.eth.account.sign_transaction(tx, self.private_key)
            tx_hash = self.w3.eth.send_raw_transaction(signed.raw_transaction)
            log.info("autoRelease tx terkirim: %s", tx_hash.to_0x_hex())

            receipt = self.w3.eth.wait_for_transaction_receipt(
                tx_hash, timeout=120, poll_latency=2
            )
            if receipt["status"] != 1:
                raise ContractError(
                    f"autoRelease tx reverted: {tx_hash.to_0x_hex()}"
                )
            return tx_hash.to_0x_hex()

    # ---------- varian async (web3.py sync dijalankan via to_thread) ----------
    #
    # web3.py bersifat sync. Kalau dipanggil langsung di dalam coroutine, event
    # loop FastAPI ikut terblokir selama call RPC. Wrapper berikut menjamin
    # panggilan dipindahkan ke executor thread (non-blocking).

    async def get_milestone_async(self, escrow_id: int, milestone_index: int) -> dict:
        return await asyncio.to_thread(self.get_milestone, escrow_id, milestone_index)

    async def auto_release_async(self, escrow_id: int, milestone_index: int) -> str:
        return await asyncio.to_thread(self.auto_release, escrow_id, milestone_index)
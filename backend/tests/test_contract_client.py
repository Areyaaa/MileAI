"""Unit test contract_client.py dengan Web3/chain di-mock.

Dua hal yang dibuktikan:
1. get_milestone_async / auto_release_async benar-benar dijalankan lewat
   thread (asyncio.to_thread) sehingga CALL RPC SYNC tidak memblokir event loop.
2. Nonce lock: dua auto_release bersamaan memakai nonce berbeda (tidak race).
Tambahan: idempotency guard di auto_release — kalau status sudah bukan
Submitted sebelum tx dibangun, fungsi berhenti tanpa kirim transaksi.
"""

from __future__ import annotations

import asyncio
import itertools
import time
from unittest.mock import MagicMock

import pytest
from hexbytes import HexBytes

import config
import contract_client as cc
from contract_client import ContractClient, ContractError

ADDR = "0x1000000000000000000000000000000000000001"
KEY = "0x" + "22" * 32


class _HTTPProvider:
    def __init__(self, rpc=None, request_kwargs=None):
        self.rpc = rpc
        self.request_kwargs = request_kwargs or {}


class FakeWeb3:
    """Pengganti Web3: semua atribut dipegang MagicMock di .eth."""

    HTTPProvider = _HTTPProvider
    to_checksum_address = staticmethod(
        __import__("web3").Web3.to_checksum_address
    )

    def __init__(self):
        self._eth = MagicMock(name="fake-eth")

    def __call__(self, provider=None):
        return self

    def is_connected(self):
        return True

    @property
    def eth(self):
        return self._eth


class _Fn:
    """Mirror contract.functions.getMilestone(...).call(); bisa kasih delay."""

    def __init__(self, result, delay=0.0):
        self._result = result
        self._delay = delay

    def call(self):
        if self._delay:
            time.sleep(self._delay)
        return self._result


@pytest.fixture
def contract_client(tmp_path, monkeypatch):
    """Factory membuat ContractClient dengan Web3 palsu (tanpa RPC)."""
    abi_file = tmp_path / "abi.json"
    abi_file.write_text('{"abi": []}')
    fakes: list = []

    def _make(private_key=KEY):
        fw = FakeWeb3()
        eth = fw._eth
        eth.contract.return_value = MagicMock(name="contract")
        eth.account.from_key.return_value = MagicMock(name="account")
        monkeypatch.setattr(cc, "Web3", fw)
        client = ContractClient(
            rpc="http://fake", address=ADDR, private_key=private_key,
            abi_path=str(abi_file),
        )
        fakes.append((client, fw))
        return client, fw

    yield _make
    for client, fw in fakes:
        fw._eth.reset_mock()


SUB = (100, "kriteria", "bukti panjang " * 6, config.STATUS_SUBMITTED)


class TestAsyncNonBlocking:
    def test_get_milestone_async_tidak_memblokir_event_loop(self, contract_client):
        client, fw = contract_client()
        contract = fw._eth.contract.return_value
        # call RPC lambat 0.4s disimulasikan; kalau event loop terblokir,
        # task ticker tidak akan jalan selama call itu.
        contract.functions.getMilestone.side_effect = lambda *a: _Fn(SUB, delay=0.4)

        ticks = []

        async def ticker():
            while len(ticks) < 500:
                ticks.append(1)
                await asyncio.sleep(0.02)

        async def main():
            t = asyncio.create_task(ticker())
            res = await client.get_milestone_async(0, 0)
            await t
            return res

        res = asyncio.run(main())
        assert res["status"] == config.STATUS_SUBMITTED
        # Dengan to_thread, event loop terus maju selama 0.4s (>= ~20 tick).
        # Kalau call dijalankan sync di dalam coroutine, ticks tidak akan naik
        # selama delay -> jumlahnya ~1.
        assert len(ticks) > 5, f"event loop terblokir selama call (ticks={len(ticks)})"

    def test_get_milestone_async_mengembalikan_data_sama_dengan_sync(
            self, contract_client):
        client, fw = contract_client()
        fw._eth.contract.return_value.functions.getMilestone.side_effect = (
            lambda *a: _Fn(SUB)
        )
        sync_res = client.get_milestone(0, 0)
        async_res = asyncio.run(client.get_milestone_async(0, 0))
        assert async_res == sync_res == {
            "escrow_id": 0, "milestone_index": 0,
            "amount": 100, "proof_requirement": "kriteria",
            "proof_text": "bukti panjang " * 6, "status": config.STATUS_SUBMITTED,
        }


class TestAutoReleaseNonceLock:
    def _configure_release_ok(self, fw, nonces, tx_id):
        eth = fw._eth
        contract = eth.contract.return_value
        contract.functions.getMilestone.side_effect = lambda *a: _Fn(SUB)

        nonce_iter = iter(nonces)
        eth.get_transaction_count.side_effect = lambda addr: next(nonce_iter)

        used_nonces = []

        def _build(tx):
            used_nonces.append(tx["nonce"])
            return dict(tx)

        contract.functions.autoRelease.return_value.build_transaction.side_effect = _build
        eth.account.sign_transaction.return_value.raw_transaction = b"\x00" * 32

        hash_iter = itertools.count(tx_id)
        eth.send_raw_transaction.side_effect = (
            lambda raw: HexBytes(bytes([next(hash_iter)]) * 32)
        )
        eth.wait_for_transaction_receipt.return_value = {"status": 1}
        return used_nonces

    def test_dua_auto_release_bersamaan_memakai_nonce_berbeda(self, contract_client):
        client, fw = contract_client()
        used = self._configure_release_ok(fw, nonces=[5, 6], tx_id=7)

        async def main():
            return await asyncio.gather(
                client.auto_release_async(0, 0),
                client.auto_release_async(1, 1),
            )

        h1, h2 = asyncio.run(main())
        assert len(used) == 2, "kedua panggilan harus tereksekusi"
        assert used[0] != used[1], f"nonce bertabrakan: {used}"
        assert h1 != h2

    def test_auto_release_sync_dan_async_diekssekusi_sukses(self, contract_client):
        client, fw = contract_client()
        used = self._configure_release_ok(fw, nonces=[10], tx_id=11)
        h = asyncio.run(client.auto_release_async(0, 0))
        assert h
        assert used == [10]
        # tx receipt dipanggil untuk cek status == 1
        fw._eth.wait_for_transaction_receipt.assert_called_once()


class TestAutoReleaseIdempotencyGuard:
    def test_status_berubah_sebelum_tx_berhenti_tanpa_kirim(self, contract_client):
        client, fw = contract_client()
        contract = fw._eth.contract.return_value
        # getMilestone mengembalikan status sudah RELEASED (berubah) saat
        # double-check di dalam auto_release -> jangan bangun/kirim tx.
        contract.functions.getMilestone.side_effect = lambda *a: _Fn(
            (100, "kriteria", "bukti", config.STATUS_RELEASED)
        )

        with pytest.raises(ContractError, match="bukan Submitted"):
            client.auto_release(0, 0)

        fw._eth.send_raw_transaction.assert_not_called()
        contract.functions.autoRelease.build_transaction.assert_not_called()

    def test_wallet_agent_belum_dikonfigurasi(self, contract_client, monkeypatch):
        monkeypatch.setattr(config, "AGENT_PRIVATE_KEY", "")
        client, _fw = contract_client(private_key=None)
        with pytest.raises(ContractError, match="belum dikonfigurasi"):
            asyncio.run(client.auto_release_async(0, 0))


class TestBacaOnChain:
    def test_get_escrow_menerjemahkan_kembalian(self, contract_client):
        client, fw = contract_client()
        fw._eth.contract.return_value.functions.getEscrow.return_value.call.return_value = (
            "0xpayer", "0xrecipient", "0xtoken", 3, False,
        )
        assert client.get_escrow(0) == {
            "escrow_id": 0, "payer": "0xpayer", "recipient": "0xrecipient",
            "token": "0xtoken", "milestone_count": 3, "refunded": False,
        }

    def test_escrow_count(self, contract_client):
        client, fw = contract_client()
        fw._eth.contract.return_value.functions.escrowCount.return_value.call.return_value = 4
        assert client.escrow_count() == 4

    def test_abi_tidak_ditemukan_melempar_contract_error(self, contract_client,
                                                         tmp_path):
        contract_client()  # siapkan mock Web3 (is_connected->True)
        with pytest.raises(ContractError, match="ABI tidak ditemukan"):
            ContractClient(
                rpc="http://fake", address=ADDR, private_key=KEY,
                abi_path=str(tmp_path / "tidak-ada" / "abi.json"),
            )